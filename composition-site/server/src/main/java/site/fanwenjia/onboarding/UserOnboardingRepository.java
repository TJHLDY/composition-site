package site.fanwenjia.onboarding;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface UserOnboardingRepository extends JpaRepository<UserOnboarding, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select onboarding from UserOnboarding onboarding where onboarding.ownerId = :ownerId")
    Optional<UserOnboarding> lockByOwnerId(Long ownerId);
}
