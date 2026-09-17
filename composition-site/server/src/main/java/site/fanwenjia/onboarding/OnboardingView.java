package site.fanwenjia.onboarding;

public record OnboardingView(
        int tutorialVersion,
        String coreStatus,
        boolean autoStart,
        boolean aiGuideSeen,
        Long tutorialWordbookId,
        Long tutorialCompositionId
) {
}
