package site.fanwenjia.auth;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {

    Optional<UserSession> findByTokenHashAndExpiresAtAfter(String tokenHash, Instant instant);

    long deleteByTokenHash(String tokenHash);

    long deleteByUser_Id(Long userId);
}
