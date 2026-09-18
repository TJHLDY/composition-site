package site.fanwenjia.onboarding;

import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.composition.CompositionAnnotationRepository;
import site.fanwenjia.composition.CompositionRepository;
import site.fanwenjia.wordbook.WordbookService;

@Service
@Transactional
public class OnboardingService {

    private final UserOnboardingRepository repository;
    private final WordbookService wordbookService;
    private final CompositionRepository compositionRepository;
    private final CompositionAnnotationRepository annotationRepository;

    public OnboardingService(
            UserOnboardingRepository repository,
            WordbookService wordbookService,
            CompositionRepository compositionRepository,
            CompositionAnnotationRepository annotationRepository
    ) {
        this.repository = repository;
        this.wordbookService = wordbookService;
        this.compositionRepository = compositionRepository;
        this.annotationRepository = annotationRepository;
    }

    public void createForNewAccount(Long ownerId) {
        repository.save(UserOnboarding.newAccount(ownerId));
    }

    @Transactional(readOnly = true)
    public OnboardingView view(CurrentUser user) {
        return repository.findById(user.id())
                .map(this::viewOf)
                .orElseGet(() -> legacyView(user.id()));
    }

    public OnboardingView start(CurrentUser user) {
        return repository.lockByOwnerId(user.id())
                .map(onboarding -> {
                    onboarding.start();
                    return viewOf(onboarding);
                })
                .orElseGet(() -> legacyView(user.id()));
    }

    public OnboardingView skip(CurrentUser user) {
        return repository.lockByOwnerId(user.id())
                .map(onboarding -> {
                    onboarding.skip();
                    return viewOf(onboarding);
                })
                .orElseGet(() -> legacyView(user.id()));
    }

    public OnboardingView recordWordbook(CurrentUser user, Long entryId) {
        wordbookService.read(user, entryId);
        UserOnboarding onboarding = recordable(user);
        onboarding.recordWordbook(entryId);
        return viewOf(onboarding);
    }

    public OnboardingView recordComposition(CurrentUser user, Long compositionId) {
        compositionRepository.findByIdAndOwnerId(compositionId, user.id())
                .orElseThrow(() -> notFound("范文不存在"));
        UserOnboarding onboarding = recordable(user);
        require(onboarding.getTutorialWordbookId() != null, "请先完成单词收录。");
        onboarding.recordComposition(compositionId);
        return viewOf(onboarding);
    }

    public OnboardingView complete(CurrentUser user, Long annotationId) {
        UserOnboarding onboarding = active(user);
        Long compositionId = onboarding.getTutorialCompositionId();
        require(onboarding.getTutorialWordbookId() != null, "请先完成单词收录。");
        require(compositionId != null, "请先保存范文。");
        annotationRepository.findByIdAndCompositionIdAndOwnerId(annotationId, compositionId, user.id())
                .orElseThrow(() -> notFound("摘录不存在"));
        onboarding.complete();
        return viewOf(onboarding);
    }

    public AiGuideClaim claimAiGuide(CurrentUser user) {
        UserOnboarding onboarding = repository.lockByOwnerId(user.id())
                .orElseGet(() -> repository.save(UserOnboarding.legacyAccount(user.id())));
        return new AiGuideClaim(onboarding.claimAiGuide());
    }

    private UserOnboarding active(CurrentUser user) {
        UserOnboarding onboarding = repository.lockByOwnerId(user.id())
                .orElseThrow(() -> new OnboardingConflictException("该账号不需要自动新手引导。"));
        require(onboarding.getCoreStatus() == OnboardingStatus.IN_PROGRESS, "新手引导当前未在进行中。");
        return onboarding;
    }

    private UserOnboarding recordable(CurrentUser user) {
        UserOnboarding onboarding = repository.lockByOwnerId(user.id())
                .orElseGet(() -> repository.save(UserOnboarding.legacyAccount(user.id())));
        onboarding.start();
        return onboarding;
    }

    private void require(boolean condition, String message) {
        if (!condition) {
            throw new OnboardingConflictException(message);
        }
    }

    private ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    private OnboardingView legacyView(Long ownerId) {
        return viewOf(UserOnboarding.legacyAccount(ownerId));
    }

    private OnboardingView viewOf(UserOnboarding onboarding) {
        OnboardingStatus status = onboarding.getCoreStatus();
        boolean autoStart = status == OnboardingStatus.NOT_STARTED || status == OnboardingStatus.IN_PROGRESS;
        return new OnboardingView(
                onboarding.getTutorialVersion(),
                status.name().toLowerCase(Locale.ROOT),
                autoStart,
                onboarding.isAiGuideSeen(),
                onboarding.getTutorialWordbookId(),
                onboarding.getTutorialCompositionId()
        );
    }
}
