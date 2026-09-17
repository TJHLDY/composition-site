package site.fanwenjia.onboarding;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;

@Entity
@Table(name = "user_onboarding")
public class UserOnboarding {

    public static final int CURRENT_TUTORIAL_VERSION = 1;

    @Id
    @Column(name = "owner_id")
    private Long ownerId;

    @Column(nullable = false)
    private int tutorialVersion = CURRENT_TUTORIAL_VERSION;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OnboardingStatus coreStatus = OnboardingStatus.NOT_STARTED;

    @Column(nullable = false)
    private boolean aiGuideSeen;

    private Long tutorialWordbookId;

    private Long tutorialCompositionId;

    @Column(nullable = false)
    private Instant updatedAt;

    @Version
    private long version;

    protected UserOnboarding() {
    }

    private UserOnboarding(Long ownerId, OnboardingStatus coreStatus) {
        this.ownerId = ownerId;
        this.coreStatus = coreStatus;
    }

    public static UserOnboarding newAccount(Long ownerId) {
        return new UserOnboarding(ownerId, OnboardingStatus.NOT_STARTED);
    }

    public static UserOnboarding legacyAccount(Long ownerId) {
        return new UserOnboarding(ownerId, OnboardingStatus.COMPLETED);
    }

    @PrePersist
    @PreUpdate
    void updateTimestamp() {
        updatedAt = Instant.now();
    }

    public Long getOwnerId() {
        return ownerId;
    }

    public int getTutorialVersion() {
        return tutorialVersion;
    }

    public OnboardingStatus getCoreStatus() {
        return coreStatus;
    }

    public boolean isAiGuideSeen() {
        return aiGuideSeen;
    }

    public Long getTutorialWordbookId() {
        return tutorialWordbookId;
    }

    public Long getTutorialCompositionId() {
        return tutorialCompositionId;
    }

    public void start() {
        if (coreStatus == OnboardingStatus.NOT_STARTED) {
            coreStatus = OnboardingStatus.IN_PROGRESS;
        }
    }

    public void skip() {
        if (coreStatus == OnboardingStatus.NOT_STARTED || coreStatus == OnboardingStatus.IN_PROGRESS) {
            coreStatus = OnboardingStatus.SKIPPED;
        }
    }

    public void recordWordbook(Long entryId) {
        tutorialWordbookId = writeOnce(tutorialWordbookId, entryId);
    }

    public void recordComposition(Long compositionId) {
        tutorialCompositionId = writeOnce(tutorialCompositionId, compositionId);
    }

    public void complete() {
        if (coreStatus == OnboardingStatus.IN_PROGRESS) {
            coreStatus = OnboardingStatus.COMPLETED;
        }
    }

    public boolean claimAiGuide() {
        if (aiGuideSeen) {
            return false;
        }
        aiGuideSeen = true;
        return true;
    }

    private Long writeOnce(Long existing, Long requested) {
        if (existing == null || existing.equals(requested)) {
            return requested;
        }
        throw new OnboardingConflictException("教程已关联另一条学习记录，不会覆盖已保存内容。");
    }
}
