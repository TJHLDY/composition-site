package site.fanwenjia.auth;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 内存验证码存储:按「用途 + 邮箱」隔离,到期自动失效,验证连续错五次即作废。
 * 与主项目 vocabulary 的做法一致,服务重启后未用完的验证码自然清空。
 */
@Component
public class VerificationCodeStore {

    private static final int MAX_VERIFY_ATTEMPTS = 5;

    private final SecureRandom secureRandom = new SecureRandom();
    private final Map<String, CodeEntry> store = new ConcurrentHashMap<>();

    public String issue(VerificationPurpose purpose, String email, Duration ttl) {
        String code = String.format("%06d", secureRandom.nextInt(1_000_000));
        store.put(key(purpose, email), new CodeEntry(code, System.currentTimeMillis() + ttl.toMillis()));
        return code;
    }

    public boolean canIssue(VerificationPurpose purpose, String email, Duration cooldown) {
        CodeEntry entry = store.get(key(purpose, email));
        return entry == null || System.currentTimeMillis() - entry.createdAt >= cooldown.toMillis();
    }

    public boolean verify(VerificationPurpose purpose, String email, String code) {
        String key = key(purpose, email);
        CodeEntry entry = store.get(key);
        if (entry == null || entry.isExpired() || entry.attempts >= MAX_VERIFY_ATTEMPTS) {
            store.remove(key);
            return false;
        }
        entry.attempts++;
        if (!entry.code.equals(code)) {
            if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
                store.remove(key);
            }
            return false;
        }
        store.remove(key);
        return true;
    }

    public void discard(VerificationPurpose purpose, String email) {
        store.remove(key(purpose, email));
    }

    private String key(VerificationPurpose purpose, String email) {
        return purpose.name() + ":" + email.trim().toLowerCase(Locale.ROOT);
    }

    private static final class CodeEntry {

        private final String code;
        private final long createdAt = System.currentTimeMillis();
        private final long expiresAt;
        private int attempts;

        private CodeEntry(String code, long expiresAt) {
            this.code = code;
            this.expiresAt = expiresAt;
        }

        private boolean isExpired() {
            return System.currentTimeMillis() > expiresAt;
        }
    }
}
