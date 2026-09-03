package site.fanwenjia.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class VerificationCodeStoreTest {

    private static final String EMAIL = "reader@example.com";

    private final VerificationCodeStore store = new VerificationCodeStore();

    @Test
    void issuedCodeVerifiesOnceThenIsConsumed() {
        String code = store.issue(VerificationPurpose.REGISTER, EMAIL, Duration.ofMinutes(5));

        assertThat(store.verify(VerificationPurpose.REGISTER, EMAIL, code)).isTrue();
        assertThat(store.verify(VerificationPurpose.REGISTER, EMAIL, code)).isFalse();
    }

    @Test
    void wrongCodeFiveTimesBurnsTheCode() {
        String code = store.issue(VerificationPurpose.REGISTER, EMAIL, Duration.ofMinutes(5));
        String wrong = wrongCodeFor(code);

        for (int attempt = 0; attempt < 5; attempt++) {
            assertThat(store.verify(VerificationPurpose.REGISTER, EMAIL, wrong)).isFalse();
        }
        assertThat(store.verify(VerificationPurpose.REGISTER, EMAIL, code))
                .as("连错五次后正确的码也必须作废")
                .isFalse();
    }

    @Test
    void expiredCodesNeverVerify() {
        String code = store.issue(VerificationPurpose.PASSWORD_RESET, EMAIL, Duration.ofMillis(-1));

        assertThat(store.verify(VerificationPurpose.PASSWORD_RESET, EMAIL, code)).isFalse();
    }

    @Test
    void cooldownBlocksImmediateReissue() {
        store.issue(VerificationPurpose.REGISTER, EMAIL, Duration.ofMinutes(5));

        assertThat(store.canIssue(VerificationPurpose.REGISTER, EMAIL, Duration.ofSeconds(60))).isFalse();
        assertThat(store.canIssue(VerificationPurpose.REGISTER, EMAIL, Duration.ZERO)).isTrue();
    }

    @Test
    void purposesAndEmailCaseAreIsolated() {
        String registerCode = store.issue(VerificationPurpose.REGISTER, EMAIL, Duration.ofMinutes(5));
        store.issue(VerificationPurpose.PASSWORD_RESET, EMAIL, Duration.ofMinutes(5));

        assertThat(store.verify(VerificationPurpose.PASSWORD_RESET, EMAIL, registerCode))
                .as("注册验证码不能用来重置密码")
                .isFalse();
        assertThat(store.verify(VerificationPurpose.REGISTER, EMAIL.toUpperCase(java.util.Locale.ROOT), registerCode))
                .as("邮箱大小写不敏感")
                .isTrue();
    }

    @Test
    void discardRemovesThePendingCodeAndCooldown() {
        String code = store.issue(VerificationPurpose.REGISTER, EMAIL, Duration.ofMinutes(5));

        store.discard(VerificationPurpose.REGISTER, EMAIL);

        assertThat(store.verify(VerificationPurpose.REGISTER, EMAIL, code)).isFalse();
        assertThat(store.canIssue(VerificationPurpose.REGISTER, EMAIL, Duration.ofSeconds(60))).isTrue();
    }

    private static String wrongCodeFor(String realCode) {
        return realCode.equals("000000") ? "999999" : "000000";
    }
}
