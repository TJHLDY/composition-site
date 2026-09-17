package site.fanwenjia.onboarding;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import site.fanwenjia.auth.CurrentUser;

@RestController
@RequestMapping("/api/onboarding")
public class OnboardingController {

    private final OnboardingService onboardingService;

    public OnboardingController(OnboardingService onboardingService) {
        this.onboardingService = onboardingService;
    }

    @GetMapping
    public OnboardingView view(@AuthenticationPrincipal CurrentUser user) {
        return onboardingService.view(user);
    }

    @PostMapping("/core/start")
    public OnboardingView start(@AuthenticationPrincipal CurrentUser user) {
        return onboardingService.start(user);
    }

    @PostMapping("/core/skip")
    public OnboardingView skip(@AuthenticationPrincipal CurrentUser user) {
        return onboardingService.skip(user);
    }

    @PostMapping("/core/wordbook/{entryId}")
    public OnboardingView recordWordbook(
            @AuthenticationPrincipal CurrentUser user,
            @PathVariable Long entryId
    ) {
        return onboardingService.recordWordbook(user, entryId);
    }

    @PostMapping("/core/composition/{compositionId}")
    public OnboardingView recordComposition(
            @AuthenticationPrincipal CurrentUser user,
            @PathVariable Long compositionId
    ) {
        return onboardingService.recordComposition(user, compositionId);
    }

    @PostMapping("/core/complete")
    public OnboardingView complete(
            @AuthenticationPrincipal CurrentUser user,
            @RequestBody CompleteRequest request
    ) {
        return onboardingService.complete(user, request.annotationId());
    }

    @PostMapping("/ai-guide/claim")
    public AiGuideClaim claimAiGuide(@AuthenticationPrincipal CurrentUser user) {
        return onboardingService.claimAiGuide(user);
    }

    public record CompleteRequest(Long annotationId) {
    }
}
