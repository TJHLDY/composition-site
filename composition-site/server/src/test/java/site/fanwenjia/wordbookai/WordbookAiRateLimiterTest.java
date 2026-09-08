package site.fanwenjia.wordbookai;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class WordbookAiRateLimiterTest {
    private final AtomicLong now = new AtomicLong();
    private final WordbookAiRateLimiter limiter = new WordbookAiRateLimiter(now::get, Duration.ofSeconds(2), 2, 2);

    @Test
    void activeRequestCannotBeEvictedAndCooldownStartsWhenItFinishes() {
        limiter.acquire(1L);
        now.set(Duration.ofMinutes(1).toNanos());
        limited(() -> limiter.acquire(1L));
        limiter.release(1L);
        limited(() -> limiter.acquire(1L));
        now.addAndGet(Duration.ofSeconds(2).toNanos());
        assertThatCode(() -> limiter.acquire(1L)).doesNotThrowAnyException();
    }

    @Test
    void storageIsBoundedAndExpiredAccountsMakeRoom() {
        limiter.acquire(1L);
        limiter.release(1L);
        limiter.acquire(2L);
        limiter.release(2L);
        limited(() -> limiter.acquire(3L));
        limited(() -> limiter.acquire(1L));
        now.addAndGet(Duration.ofSeconds(2).toNanos());
        assertThatCode(() -> limiter.acquire(3L)).doesNotThrowAnyException();
    }

    @Test
    void limitsGlobalConcurrencyWhileAllowingIndependentAccounts() {
        var global = new WordbookAiRateLimiter(now::get, Duration.ofSeconds(2), 8, 2);
        global.acquire(1L);
        global.acquire(2L);
        limited(() -> global.acquire(3L));
        global.release(1L);
        assertThatCode(() -> global.acquire(3L)).doesNotThrowAnyException();
    }

    private void limited(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class,
                exception -> org.assertj.core.api.Assertions.assertThat(exception.getStatusCode().value()).isEqualTo(429));
    }
}
