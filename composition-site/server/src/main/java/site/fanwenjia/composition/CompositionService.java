package site.fanwenjia.composition;

import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.auth.UserAccount;
import site.fanwenjia.auth.UserAccountRepository;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CompositionService {

    private final CompositionRepository compositionRepository;
    private final CompositionAnnotationRepository annotationRepository;
    private final UserAccountRepository userAccountRepository;
    private final site.fanwenjia.wordbook.WordbookService wordbookService;
    private final site.fanwenjia.translation.GlossaryStore glossary;

    public CompositionService(
            CompositionRepository compositionRepository,
            CompositionAnnotationRepository annotationRepository,
            UserAccountRepository userAccountRepository,
            site.fanwenjia.wordbook.WordbookService wordbookService,
            site.fanwenjia.translation.GlossaryStore glossary
    ) {
        this.compositionRepository = compositionRepository;
        this.annotationRepository = annotationRepository;
        this.userAccountRepository = userAccountRepository;
        this.wordbookService = wordbookService;
        this.glossary = glossary;
    }

    @Transactional
    public CompositionView create(CurrentUser currentUser, CreateCompositionRequest request) {
        String title = requiredText(request.title(), "题目", 200);
        String content = requiredText(request.content(), "范文", 100_000).replace("\r\n", "\n").replace('\r', '\n');
        String sourceLabel = optionalText(request.sourceLabel(), 100);
        UserAccount owner = userAccountRepository.getReferenceById(currentUser.id());
        Composition composition = compositionRepository.save(new Composition(owner, title, sourceLabel, content));
        glossary.enqueue(currentUser,composition);
        return toView(composition, List.of());
    }

    @Transactional(readOnly = true)
    public List<CompositionListItem> list(CurrentUser currentUser) {
        return compositionRepository.findByOwnerIdOrderByUpdatedAtDescIdDesc(currentUser.id())
                .stream()
                .map(composition -> new CompositionListItem(
                        composition.getId(),
                        composition.getTitle(),
                        composition.getSourceLabel(),
                        Math.toIntExact(annotationRepository.countByCompositionIdAndOwnerId(
                                composition.getId(),
                                currentUser.id()
                        )),
                        composition.getUpdatedAt()
                ))
                .toList();
    }

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public CompositionView update(CurrentUser user, Long id, UpdateCompositionRequest request) {
        wordbookService.acquireOwnerLock(user);
        Composition essay = findOwned(user, id);
        compositionRepository.lockById(id).orElseThrow();
        if (request.contentVersion() == null || request.contentVersion() != essay.getContentVersion())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "范文已在其他页面更新，请重新打开后再编辑。");
        String title = requiredText(request.title(), "题目", 200);
        String content = requiredText(request.content(), "范文", 100_000).replace("\r\n", "\n").replace('\r', '\n');
        String source = optionalText(request.sourceLabel(), 100);
        String old = essay.getContent();
        var notes = annotationRepository.findByCompositionIdAndOwnerIdOrderByStartOffsetAscIdAsc(id, user.id());
        int prefix = 0, suffix = 0;
        while (prefix < Math.min(old.length(), content.length()) && old.charAt(prefix) == content.charAt(prefix)) prefix++;
        while (suffix < Math.min(old.length(), content.length()) - prefix &&
                old.charAt(old.length()-1-suffix) == content.charAt(content.length()-1-suffix)) suffix++;
        var positions = new java.util.ArrayList<Integer>();
        for (var note : notes) {
            int start;
            if (note.getEndOffset() <= prefix) start = note.getStartOffset();
            else if (note.getStartOffset() >= old.length()-suffix) start = note.getStartOffset()+content.length()-old.length();
            else throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "正文改动涉及已有摘录。请保留摘录所在片段，或先处理对应摘录后再修改；本次未保存，原内容和笔记仍保留。");
            if ((start > 0 && Character.isLetterOrDigit(content.charAt(start-1))) ||
                    (start+note.getSelectedText().length() < content.length() && Character.isLetterOrDigit(content.charAt(start+note.getSelectedText().length()))))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "正文改动改变了摘录的单词边界，请先处理对应摘录。");
            positions.add(start);
        }
        // Import old notes before changing their positions or source metadata.
        wordbookService.prepare(user);
        essay.edit(title, source, content);
        for (int i=0; i<notes.size(); i++) notes.get(i).relocate(positions.get(i), essay.getContentVersion());
        annotationRepository.flush();
        for (var note : notes) {
            SelectionContext selection = resolveSelection(user, id, new SelectionRequest(note.getStartOffset(),
                    note.getEndOffset(), note.getKind(), essay.getContentVersion()));
            wordbookService.sync(user,id,title,note.getId(),note.getSelectedText(),note.getTranslationZh(),note.getNote(),selection.sentence());
        }
        glossary.enqueue(user,essay);
        return toView(essay, notes.stream().map(this::toAnnotationView).toList());
    }

    @Transactional(readOnly = true)
    public CompositionView read(CurrentUser currentUser, Long compositionId) {
        Composition composition = findOwned(currentUser, compositionId);
        return toView(
                composition,
                annotationRepository.findByCompositionIdAndOwnerIdOrderByStartOffsetAscIdAsc(
                        compositionId,
                        currentUser.id()
                ).stream().map(this::toAnnotationView).toList()
        );
    }

    @Transactional
    public AnnotationSaveResult saveAnnotation(
            CurrentUser currentUser,
            Long compositionId,
            SaveAnnotationRequest request
    ) {
        wordbookService.acquireOwnerLock(currentUser);
        SelectionContext selection = resolveSelection(currentUser, compositionId, new SelectionRequest(
                request.startOffset(),
                request.endOffset(),
                request.kind(),
                request.contentVersion()
        ));
        Composition composition = findOwned(currentUser, compositionId);
        String translationZh = optionalText(request.translationZh(), 1000, "释义格式不正确");
        String requestedLearningText = optionalText(request.learningText(), 500, "学习内容格式不正确");
        String note = optionalText(request.note(), 2000, "笔记格式不正确");

        return annotationRepository.findByCompositionIdAndOwnerIdAndContentVersionAndStartOffsetAndEndOffset(
                        compositionId,
                        currentUser.id(),
                        selection.contentVersion(),
                        selection.startOffset(),
                        selection.endOffset()
                )
                .map(existing -> {
                    String learningText = requestedLearningText != null
                            ? requestedLearningText
                            : existing.getLearningText();
                    existing.update(selection.kind(), translationZh, learningText, note);
                    wordbookService.sync(currentUser, compositionId, composition.getTitle(), existing.getId(),
                            selection.selectedText(), translationZh, note, selection.sentence());
                    composition.touch();
                    return new AnnotationSaveResult(toAnnotationView(existing), false);
                })
                .orElseGet(() -> {
                    UserAccount owner = userAccountRepository.getReferenceById(currentUser.id());
                    CompositionAnnotation annotation = annotationRepository.save(new CompositionAnnotation(
                            composition,
                            owner,
                            selection.contentVersion(),
                            selection.selectedText(),
                            selection.startOffset(),
                            selection.endOffset(),
                            selection.kind(),
                            translationZh,
                            requestedLearningText,
                            note
                    ));
                    composition.touch();
                    wordbookService.sync(currentUser, compositionId, composition.getTitle(), annotation.getId(),
                            selection.selectedText(), translationZh, note, selection.sentence());
                    return new AnnotationSaveResult(toAnnotationView(annotation), true);
                });
    }

    @Transactional(readOnly = true)
    public SelectionContext resolveSelection(
            CurrentUser currentUser,
            Long compositionId,
            SelectionRequest request
    ) {
        Composition composition = findOwned(currentUser, compositionId);
        int requestedVersion = requiredInt(request.contentVersion(), "范文版本格式不正确");
        if (requestedVersion != composition.getContentVersion()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "范文已更新，请重新选择内容");
        }
        int startOffset = requiredInt(request.startOffset(), "笔记范围格式不正确");
        int endOffset = requiredInt(request.endOffset(), "笔记范围格式不正确");
        String selectedText = selectedText(composition.getContent(), startOffset, endOffset);
        String kind = normalizeKind(request.kind(), selectedText);
        return new SelectionContext(
                composition.getId(),
                composition.getContentVersion(),
                kind,
                selectedText,
                startOffset,
                endOffset,
                sourceSentence(composition.getContent(), startOffset, endOffset)
        );
    }

    @Transactional
    public void deleteAnnotation(CurrentUser currentUser, Long compositionId, Long annotationId) {
        wordbookService.acquireOwnerLock(currentUser);
        Composition composition = findOwned(currentUser, compositionId);
        CompositionAnnotation annotation = annotationRepository.findByIdAndCompositionIdAndOwnerId(
                        annotationId,
                        compositionId,
                        currentUser.id()
                )
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "笔记不存在"));
        wordbookService.detach(currentUser, compositionId, annotationId);
        annotationRepository.delete(annotation);
        composition.touch();
    }

    @Transactional(isolation=org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void deleteComposition(CurrentUser currentUser, Long compositionId) {
        wordbookService.acquireOwnerLock(currentUser);
        Composition composition = findOwned(currentUser, compositionId);
        compositionRepository.lockById(compositionId).orElseThrow();
        glossary.delete(compositionId);
        wordbookService.detach(currentUser, compositionId, null);
        annotationRepository.deleteAll(
                annotationRepository.findByCompositionIdAndOwnerIdOrderByStartOffsetAscIdAsc(compositionId, currentUser.id())
        );
        compositionRepository.delete(composition);
    }

    private Composition findOwned(CurrentUser currentUser, Long compositionId) {
        return compositionRepository.findByIdAndOwnerId(compositionId, currentUser.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "范文不存在"));
    }

    private String requiredText(String value, String label, int maximumLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty() || normalized.length() > maximumLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + "格式不正确");
        }
        return normalized;
    }

    private String optionalText(String value, int maximumLength) {
        return optionalText(value, maximumLength, "小标题格式不正确");
    }

    private String optionalText(String value, int maximumLength, String errorMessage) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() > maximumLength) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorMessage);
        }
        return normalized.isEmpty() ? null : normalized;
    }

    private int requiredInt(Integer value, String errorMessage) {
        if (value == null || value < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, errorMessage);
        }
        return value;
    }

    private String selectedText(String content, int startOffset, int endOffset) {
        if (startOffset < 0 || endOffset <= startOffset || endOffset > content.length()
                || endOffset - startOffset > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "笔记范围格式不正确");
        }
        String selectedText = content.substring(startOffset, endOffset);
        if (selectedText.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "笔记范围格式不正确");
        }
        return selectedText;
    }

    private String normalizeKind(String value, String selectedText) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        boolean valid = switch (normalized) {
            case "word" -> selectedText.matches("[A-Za-z]+(?:['’-][A-Za-z]+)*");
            case "phrase" -> selectedText.matches(
                    "[A-Za-z]+(?:['’-][A-Za-z]+)*(?:\\s+[A-Za-z]+(?:['’-][A-Za-z]+)*)+"
            );
            default -> false;
        };
        if (!valid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "笔记类型与所选文本不匹配");
        }
        return normalized;
    }

    public static String sourceSentence(String content, int startOffset, int endOffset) {
        int left = Math.max(
                Math.max(content.lastIndexOf('.', startOffset - 1), content.lastIndexOf('!', startOffset - 1)),
                Math.max(content.lastIndexOf('?', startOffset - 1), content.lastIndexOf('\n', startOffset - 1))
        );
        int right = content.length();
        for (char delimiter : new char[]{'.', '!', '?', '\n'}) {
            int candidate = content.indexOf(delimiter, endOffset);
            if (candidate >= 0 && candidate + 1 < right) {
                right = candidate + 1;
            }
        }
        return content.substring(left + 1, right).trim();
    }

    private CompositionView toView(Composition composition, List<AnnotationView> annotations) {
        return new CompositionView(
                composition.getId(),
                composition.getTitle(),
                composition.getSourceLabel(),
                composition.getContent(),
                composition.getContentVersion(),
                annotations,
                composition.getCreatedAt(),
                composition.getUpdatedAt()
        );
    }

    private AnnotationView toAnnotationView(CompositionAnnotation annotation) {
        return new AnnotationView(
                annotation.getId(),
                annotation.getContentVersion(),
                annotation.getSelectedText(),
                annotation.getStartOffset(),
                annotation.getEndOffset(),
                annotation.getKind(),
                annotation.getTranslationZh(),
                annotation.getLearningText(),
                annotation.getNote(),
                annotation.getCreatedAt(),
                annotation.getUpdatedAt()
        );
    }
}
