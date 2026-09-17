package site.fanwenjia.translation;

import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.composition.*;

@Service
public class GlossaryStore {
    private static final Pattern WORD = Pattern.compile("[A-Za-z]+(?:['’-][A-Za-z]+)*");
    private final CompositionRepository compositions;
    private final StoredExplanationRepository entries;
    private final GlossaryJobRepository jobs;
    public GlossaryStore(CompositionRepository compositions,StoredExplanationRepository entries,GlossaryJobRepository jobs) {
        this.compositions=compositions;this.entries=entries;this.jobs=jobs;
    }
    public static List<SelectionContext> words(Long id,int version,String content) {
        var result=new ArrayList<SelectionContext>();var matcher=WORD.matcher(content);
        while(matcher.find()) {
            if(matcher.end()-matcher.start()>500) continue;
            result.add(new SelectionContext(id,version,"word",matcher.group(),matcher.start(),matcher.end(),
                    CompositionService.sourceSentence(content,matcher.start(),matcher.end())));
        }
        return result;
    }
    private static String position(int start,int end) {return start+":"+end;}
    private static String meaningKey(String word,String sentence) {return word+"\u0000"+sentence;}

    /** Participates in the composition save transaction; no network calls here. */
    @Transactional
    public void enqueue(CurrentUser user,Composition essay) {
        // The composition lock serializes initialization. Avoid locking a missing job's
        // index gap when distinct compositions are created concurrently on MySQL.
        var previous=jobs.existsById(essay.getId())?jobs.lockById(essay.getId()).orElse(null):null;
        if(previous!=null && previous.contentVersion==essay.getContentVersion()) return;
        var targets=words(essay.getId(),essay.getContentVersion(),essay.getContent());
        var reusable=new HashMap<String,ContextualExplanation>();
        if(previous!=null) for(var row:entries.findByCompositionIdAndContentVersionOrderById(essay.getId(),previous.contentVersion))
            reusable.put(meaningKey(row.selectedText,row.sentence),row.answer());
        entries.deleteByCompositionId(essay.getId());
        entries.flush();
        var copies=new ArrayList<StoredExplanation>();
        for(var s:targets) {
            var answer=reusable.get(meaningKey(s.selectedText(),s.sentence()));
            if(answer!=null) copies.add(new StoredExplanation(s,answer));
        }
        entries.saveAll(copies);
        var job=previous==null?new GlossaryJob():previous;
        job.compositionId=essay.getId();job.ownerId=user.id();job.contentVersion=essay.getContentVersion();
        job.total=targets.size();job.done=copies.size();job.attempts=0;job.lease=null;job.message=null;job.configurationRequired=false;
        job.status=job.done==job.total?"complete":"queued";job.nextAttempt=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);jobs.save(job);
    }
    @Transactional(readOnly=true)
    public Optional<ContextualExplanation> find(SelectionContext s) {
        return entries.findByCompositionIdAndContentVersionAndStartOffsetAndEndOffset(s.compositionId(),s.contentVersion(),s.startOffset(),s.endOffset()).map(StoredExplanation::answer);
    }
    @Transactional
    public void save(List<SelectionContext> selections,List<ContextualExplanation> answers) {
        if(selections.isEmpty()) return;
        var first=selections.get(0);
        var essay=compositions.lockById(first.compositionId()).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(essay.getContentVersion()!=first.contentVersion()) throw new ResponseStatusException(HttpStatus.CONFLICT,"范文已更新，请重新打开。");
        for(int i=0;i<selections.size();i++) {
            var s=selections.get(i);
            if(entries.findByCompositionIdAndContentVersionAndStartOffsetAndEndOffset(s.compositionId(),s.contentVersion(),s.startOffset(),s.endOffset()).isEmpty())
                entries.save(new StoredExplanation(s,answers.get(i)));
        }
    }
    public record Work(Long id,int version,CurrentUser user,String lease,List<ExplanationRequest> requests) {}
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public Work claim() {
        var ids=jobs.due(Instant.now(),PageRequest.of(0,1));
        if(ids.isEmpty()) return null;
        var essay=compositions.lockById(ids.get(0)).orElse(null);
        if(essay==null) return null;
        var job=jobs.lockById(essay.getId()).orElse(null);
        if(job==null || !Set.of("queued","running","retrying").contains(job.status) || job.nextAttempt.isAfter(Instant.now())) return null;
        var ready=new HashSet<String>();
        for(var row:entries.findByCompositionIdAndContentVersionOrderById(job.compositionId,job.contentVersion)) ready.add(position(row.startOffset,row.endOffset));
        var targets=words(essay.getId(),essay.getContentVersion(),essay.getContent());
        var missing=targets.stream().filter(s->!ready.contains(position(s.startOffset(),s.endOffset()))).toList();
        job.done=job.total-missing.size();
        if(missing.isEmpty()) {job.status="complete";job.message=null;job.configurationRequired=false;return null;}
        job.status="running";job.nextAttempt=Instant.now().plusSeconds(120);job.lease=UUID.randomUUID().toString();
        return new Work(job.compositionId,job.contentVersion,new CurrentUser(job.ownerId,"",""),job.lease,
                missing.stream().limit(12).map(s->new ExplanationRequest(s.startOffset(),s.endOffset(),"word",s.contentVersion())).toList());
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void finish(Work work,String failure,boolean configurationMissing) {
        var essay=compositions.lockById(work.id()).orElse(null);
        if(essay==null) return;
        var job=jobs.lockById(work.id()).orElse(null);
        if(job==null || job.contentVersion!=work.version() || !Objects.equals(job.lease,work.lease())) return;
        if(failure==null) {
            var ready=new HashSet<String>();
            for(var row:entries.findByCompositionIdAndContentVersionOrderById(job.compositionId,job.contentVersion)) ready.add(position(row.startOffset,row.endOffset));
            job.done=(int)words(essay.getId(),essay.getContentVersion(),essay.getContent()).stream()
                    .filter(s->ready.contains(position(s.startOffset(),s.endOffset()))).count();
            job.status=job.done>=job.total?"complete":"queued";job.attempts=0;job.message=null;job.configurationRequired=false;job.nextAttempt=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        } else {
            job.attempts++;job.message=failure;
            job.configurationRequired=configurationMissing;
            job.status=configurationMissing||job.attempts>=3?"paused":"retrying";
            job.nextAttempt=Instant.now().plusSeconds(30L*job.attempts);
        }
        job.lease=null;
    }
    public record Progress(int contentVersion,String status,int done,int total,String message,boolean configurationRequired,List<StoredExplanation.View> results,long cursor) {}
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public Progress progress(CurrentUser user,Long id,long after) {
        var essay=ownedLocked(user,id);
        enqueue(user,essay);
        var job=jobs.findById(id).orElseThrow();
        var rows=entries.findByCompositionIdAndContentVersionAndIdGreaterThanOrderById(id,essay.getContentVersion(),Math.max(0,after));
        return new Progress(job.contentVersion,job.status,job.done,job.total,job.message,job.configurationRequired,rows.stream().map(StoredExplanation::view).toList(),
                rows.isEmpty()?Math.max(0,after):rows.get(rows.size()-1).id);
    }
    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void retry(CurrentUser user,Long id) {
        var essay=ownedLocked(user,id);enqueue(user,essay);
        var job=jobs.findById(id).orElseThrow();
        if(Set.of("paused","retrying").contains(job.status)) {
            job.status="queued";job.attempts=0;job.nextAttempt=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);job.message=null;job.configurationRequired=false;
        }
    }
    private Composition ownedLocked(CurrentUser user,Long id) {
        if(user==null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return compositions.lockOwned(id,user.id()).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
    @Transactional public void delete(Long id) {entries.deleteByCompositionId(id);jobs.deleteById(id);}
}
