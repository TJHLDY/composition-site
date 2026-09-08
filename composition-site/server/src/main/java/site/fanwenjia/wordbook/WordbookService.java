package site.fanwenjia.wordbook;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.auth.UserAccount;
import site.fanwenjia.composition.*;
import static site.fanwenjia.wordbook.WordbookViews.*;

@Service
@Transactional
public class WordbookService {
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();
    @PersistenceContext private EntityManager em;

    // A database row lock serializes the user's collection writes across server instances.
    public void acquireOwnerLock(CurrentUser user) {
        if (em.find(UserAccount.class, user.id(), LockModeType.PESSIMISTIC_WRITE) == null)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    }

    private void prepare(CurrentUser user) {
        acquireOwnerLock(user);
        if (em.find(WordbookImport.class, user.id()) != null) return;
        List<CompositionAnnotation> notes = em.createQuery("select a from CompositionAnnotation a where a.owner.id=:owner order by a.id", CompositionAnnotation.class)
                .setParameter("owner", user.id()).getResultList();
        for (CompositionAnnotation note : notes) {
            Composition source = note.getComposition();
            syncInternal(user, source.getId(), source.getTitle(), note.getId(), note.getSelectedText(),
                    note.getTranslationZh(), note.getNote(), sentence(source.getContent(), note.getStartOffset(), note.getEndOffset()));
        }
        em.persist(new WordbookImport(user.id()));
    }

    public Page list(CurrentUser user, String kind, String q, String exact, int page, int size) {
        prepare(user);
        if (kind != null && !kind.isBlank() && !Set.of("word", "phrase").contains(kind)) bad("分类不正确");
        if (page < 0 || page > 100000 || size < 1 || size > 100) bad("分页范围不正确");
        String filter = " from WordbookEntry e where e.ownerId=:owner and e.deleted=false";
        Map<String, Object> params = new HashMap<>();
        params.put("owner", user.id());
        if (exact != null && !exact.isBlank()) {
            filter += " and e.normalizedTerm=:exact";
            params.put("exact", EnglishTerms.canonical(optional(exact, 500)).replaceAll("[\\p{Z}\\s]+", " ").toLowerCase(Locale.ROOT));
        } else {
            if (kind != null && !kind.isBlank()) { filter += " and e.kind=:kind"; params.put("kind", kind); }
            String query = optional(q, 500).toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
            if (!query.isEmpty()) {
                String escaped = query.replace("!", "!!").replace("%", "!%").replace("_", "!_");
                if (query.matches("[a-z]")) {
                    filter += " and e.normalizedTerm like :q escape '!'";
                    params.put("q", escaped + "%");
                } else {
                    filter += " and (e.normalizedTerm like :q escape '!' or lower(e.translationZh) like :q escape '!' or lower(e.dictionaryJson) like :q escape '!' or exists (select s.id from WordbookSense s where s.entryId=e.id and lower(s.translationZh) like :q escape '!'))";
                    params.put("q", "%" + escaped + "%");
                }
            }
        }
        TypedQuery<WordbookEntry> rows = em.createQuery("select e" + filter + " order by e.normalizedTerm, e.id", WordbookEntry.class);
        TypedQuery<Long> total = em.createQuery("select count(e)" + filter, Long.class);
        params.forEach((key, value) -> { rows.setParameter(key, value); total.setParameter(key, value); });
        return new Page(rows.setFirstResult(page * size).setMaxResults(size).getResultList().stream().map(this::item).toList(),
                total.getSingleResult(), count(user, "word"), count(user, "phrase"));
    }

    public Detail read(CurrentUser user, Long id) { prepare(user); return detail(owned(user, id)); }

    public Detail save(CurrentUser user, Save request) {
        prepare(user);
        String term = EnglishTerms.display(request.term());
        WordbookEntry entry = findTerm(user, term);
        if (entry == null) entry = create(user, term, request.translationZh(), request.note());
        else if (entry.deleted) {
            entry.deleted = false; entry.term = term;
            entry.translationZh = optional(request.translationZh(), 1000);
            entry.note = optional(request.note(), 2000); entry.updatedAt = Instant.now();
        } else {
            String translation = optional(request.translationZh(), 1000), note = optional(request.note(), 2000);
            if (entry.translationZh == null || entry.translationZh.isBlank()) entry.translationZh = translation;
            if (entry.note == null || entry.note.isBlank()) entry.note = note;
        }
        storeDictionary(entry, request.dictionary());
        return detail(entry);
    }

    public Detail update(CurrentUser user, Long id, Save request) {
        prepare(user);
        WordbookEntry entry = owned(user, id);
        if (request.term() != null && !EnglishTerms.normalize(request.term()).equals(entry.normalizedTerm)) bad("修改拼写请重新收录，当前操作仅修改释义和备注");
        entry.translationZh = optional(request.translationZh(), 1000);
        entry.note = optional(request.note(), 2000); entry.updatedAt = Instant.now();
        storeDictionary(entry, request.dictionary());
        return detail(entry);
    }

    public void delete(CurrentUser user, Long id) {
        prepare(user);
        WordbookEntry entry = owned(user, id);
        em.createQuery("delete from WordbookSense s where s.entryId=:id").setParameter("id", id).executeUpdate();
        em.createQuery("delete from WordbookExample e where e.entryId=:id").setParameter("id", id).executeUpdate();
        entry.deleted = true; entry.translationZh = ""; entry.note = ""; entry.dictionaryJson = null; entry.updatedAt = Instant.now();
    }

    public Example saveExample(CurrentUser user, Long id, SaveExample request) {
        prepare(user);
        WordbookEntry entry = owned(user, id);
        String english = optional(request.english(), 2000), translation = optional(request.translationZh(), 2000), usage = optional(request.usage(), 2000);
        if (!entry.kind.equals("phrase") || english.isBlank() || translation.isBlank()) bad("请为短语保存完整的英文例句与中文翻译");
        String boundary = "[\\p{L}\\p{N}_'\\p{Pd}\\p{M}]";
        String pattern = "(?i)(?<!" + boundary + ")" + java.util.regex.Pattern.quote(entry.term).replace(" ", "\\E\\s+\\Q") + "(?!" + boundary + ")";
        if (!java.util.regex.Pattern.compile(pattern).matcher(EnglishTerms.canonical(english)).find()) bad("例句必须包含当前短语");
        List<WordbookExample> existing = examples(id);
        for (WordbookExample example : existing) if (example.english.equals(english)) return example(example);
        if (existing.size() >= 50) bad("每个短语最多收藏 50 条例句，请先删除不需要的例句");
        WordbookExample example = new WordbookExample();
        example.entryId = id; example.english = english; example.translationZh = translation; example.usage = usage;
        em.persist(example);
        return example(example);
    }

    public void deleteExample(CurrentUser user, Long id, Long exampleId) {
        prepare(user); owned(user, id);
        WordbookExample example = em.find(WordbookExample.class, exampleId);
        if (example == null || !example.entryId.equals(id)) throw missing();
        em.remove(example);
    }

    public void sync(CurrentUser user, Long compositionId, String title, Long annotationId, String term, String translation, String note, String sentence) {
        prepare(user);
        syncInternal(user, compositionId, title, annotationId, term, translation, note, sentence);
    }

    private void syncInternal(CurrentUser user, Long compositionId, String title, Long annotationId, String term, String translation, String note, String sentence) {
        WordbookEntry entry = findTerm(user, term);
        if (entry != null && entry.deleted) return;
        if (entry == null) entry = create(user, term, translation, "");
        List<WordbookSense> found = em.createQuery("select s from WordbookSense s where s.annotationId=:annotation and s.ownerId=:owner", WordbookSense.class)
                .setParameter("annotation", annotationId).setParameter("owner", user.id()).getResultList();
        WordbookSense sense = found.isEmpty() ? new WordbookSense() : found.get(0);
        sense.entryId = entry.id; sense.ownerId = user.id(); sense.annotationId = annotationId;
        sense.compositionId = compositionId; sense.compositionTitle = title; sense.translationZh = translation; sense.note = note; sense.sentence = sentence;
        if (sense.id == null) em.persist(sense);
    }

    public void detach(CurrentUser user, Long compositionId, Long annotationId) {
        prepare(user);
        String query = "select s from WordbookSense s where s.ownerId=:owner and s.compositionId=:composition";
        if (annotationId != null) query += " and s.annotationId=:annotation";
        TypedQuery<WordbookSense> rows = em.createQuery(query, WordbookSense.class).setParameter("owner", user.id()).setParameter("composition", compositionId);
        if (annotationId != null) rows.setParameter("annotation", annotationId);
        for (WordbookSense sense : rows.getResultList()) { sense.compositionId = null; sense.compositionTitle = null; sense.annotationId = null; }
    }

    private WordbookEntry create(CurrentUser user, String raw, String translation, String note) {
        WordbookEntry entry = new WordbookEntry();
        entry.ownerId = user.id(); entry.term = EnglishTerms.display(raw); entry.normalizedTerm = EnglishTerms.normalize(raw); entry.kind = EnglishTerms.kind(entry.term);
        entry.translationZh = optional(translation, 1000); entry.note = optional(note, 2000);
        em.persist(entry);
        return entry;
    }
    private WordbookEntry findTerm(CurrentUser user, String term) {
        return em.createQuery("select e from WordbookEntry e where e.ownerId=:owner and e.normalizedTerm=:term", WordbookEntry.class)
                .setParameter("owner", user.id()).setParameter("term", EnglishTerms.normalize(term)).getResultStream().findFirst().orElse(null);
    }
    private WordbookEntry owned(CurrentUser user, Long id) {
        WordbookEntry entry = em.find(WordbookEntry.class, id);
        if (entry == null || entry.deleted || !entry.ownerId.equals(user.id())) throw missing();
        return entry;
    }
    private long count(CurrentUser user, String kind) {
        return em.createQuery("select count(e) from WordbookEntry e where e.ownerId=:owner and e.kind=:kind and e.deleted=false", Long.class)
                .setParameter("owner", user.id()).setParameter("kind", kind).getSingleResult();
    }
    private Item item(WordbookEntry entry) { return new Item(entry.id, entry.term, entry.kind, entry.translationZh); }
    private List<WordbookExample> examples(Long id) {
        return em.createQuery("select e from WordbookExample e where e.entryId=:id order by e.id", WordbookExample.class).setParameter("id", id).getResultList();
    }
    private Example example(WordbookExample e) { return new Example(e.id, e.english, e.translationZh, e.usage); }
    private Detail detail(WordbookEntry entry) {
        List<Sense> senses = em.createQuery("select s from WordbookSense s where s.entryId=:id order by s.id", WordbookSense.class).setParameter("id", entry.id).getResultList().stream()
                .map(s -> new Sense(s.id, s.translationZh, s.note, s.sentence, s.compositionId, s.compositionTitle, s.annotationId)).toList();
        List<Item> related = em.createQuery("select e from WordbookEntry e where e.ownerId=:owner and e.kind=:kind and e.deleted=false order by e.normalizedTerm", WordbookEntry.class)
                .setParameter("owner", entry.ownerId).setParameter("kind", entry.kind.equals("word") ? "phrase" : "word").getResultList().stream()
                .filter(other -> entry.kind.equals("word") ? EnglishTerms.containsWord(other.normalizedTerm, entry.normalizedTerm) : EnglishTerms.containsWord(entry.normalizedTerm, other.normalizedTerm))
                .map(this::item).toList();
        return new Detail(entry.id, entry.term, entry.kind, entry.translationZh, entry.note, senses, related, examples(entry.id).stream().map(this::example).toList(), readDictionary(entry));
    }
    private void storeDictionary(WordbookEntry entry, site.fanwenjia.dictionary.DictionaryData data) {
        if (data == null) return;
        if (!EnglishTerms.normalize(data.term()).equals(entry.normalizedTerm)) bad("词典资料与词条不匹配");
        try { entry.dictionaryJson = JSON.writeValueAsString(data); }
        catch (com.fasterxml.jackson.core.JsonProcessingException e) { bad("词典资料无法保存"); }
    }
    private site.fanwenjia.dictionary.DictionaryData readDictionary(WordbookEntry entry) {
        if (entry.dictionaryJson == null) return null;
        try { return JSON.readValue(entry.dictionaryJson, site.fanwenjia.dictionary.DictionaryData.class); }
        catch (com.fasterxml.jackson.core.JsonProcessingException e) { return null; }
    }
    private static String optional(String raw, int max) {
        String value = raw == null ? "" : raw.trim();
        if (value.length() > max) bad("输入超过长度限制（" + max + "）");
        return value;
    }
    private static void bad(String message) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "词库记录不存在"); }
    private static String sentence(String content, int start, int end) {
        int left = start, right = end;
        while (left > 0 && ".!?\n".indexOf(content.charAt(left - 1)) < 0) left--;
        while (right < content.length() && ".!?\n".indexOf(content.charAt(right)) < 0) right++;
        return content.substring(left, Math.min(content.length(), right + 1)).trim();
    }
}
