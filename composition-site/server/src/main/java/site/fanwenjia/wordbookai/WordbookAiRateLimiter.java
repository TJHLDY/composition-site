package site.fanwenjia.wordbookai;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Process-local limits shared by lookup and sentence; never evicts an active or cooling account. */
@Component
public class WordbookAiRateLimiter {
    private final Map<Long, Slot> accounts = new HashMap<>();
    private final LongSupplier ticker;
    private final long cooldownNanos;
    private final int capacity;
    private final int maximumConcurrent;
    private int active;

    public WordbookAiRateLimiter() {
        this(System::nanoTime, Duration.ofSeconds(2), 1024, 16);
    }

    WordbookAiRateLimiter(LongSupplier ticker, Duration cooldown, int capacity, int maximumConcurrent) {
        this.ticker = ticker;
        this.cooldownNanos = cooldown.toNanos();
        this.capacity = capacity;
        this.maximumConcurrent = maximumConcurrent;
    }

    public synchronized void acquire(Long accountId) {
        long now = ticker.getAsLong();
        accounts.entrySet().removeIf(entry -> !entry.getValue().active
                && now - entry.getValue().finishedAt >= cooldownNanos);
        if (accounts.containsKey(accountId) || accounts.size() >= capacity || active >= maximumConcurrent) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "AI 请求过于频繁，请稍后再试。");
        }
        accounts.put(accountId, new Slot());
        active++;
    }

    public synchronized void release(Long accountId) {
        Slot slot = accounts.get(accountId);
        if (slot != null && slot.active) {
            slot.active = false;
            slot.finishedAt = ticker.getAsLong();
            active--;
        }
    }

    private static final class Slot {
        private boolean active = true;
        private long finishedAt;
    }
}
