package site.fanwenjia.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:auth-service-test;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Transactional
class AuthServiceTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private VerificationCodeStore verificationCodeStore;

    @MockitoBean
    private SmtpVerificationEmailSender emailSender;

    @Test
    void rejectsOversizedUtf8PasswordsBeforeConsumingVerificationCodes() {
        String email = "utf8@example.com";
        String code = verificationCodeStore.issue(VerificationPurpose.REGISTER, email, Duration.ofMinutes(5));
        assertThatThrownBy(() -> authService.register(new RegisterRequest(email, "密".repeat(25), "Reader", code)))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("72");
        authService.register(new RegisterRequest(email, "密".repeat(24), "Reader", code));
        assertThat(authService.login(new LoginRequest(email, "密".repeat(24))).token()).isNotBlank();
        assertThatThrownBy(() -> authService.login(new LoginRequest(email, "密".repeat(25))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("72");
        String resetCode = verificationCodeStore.issue(VerificationPurpose.PASSWORD_RESET, email, Duration.ofMinutes(5));
        assertThatThrownBy(() -> authService.resetPassword(new ResetPasswordRequest(email, resetCode, "密".repeat(25))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("72");
        authService.resetPassword(new ResetPasswordRequest(email, resetCode, "NewPassword123"));
    }

    @Test
    void registerRequiresAValidEmailCode() {
        String code = verificationCodeStore.issue(VerificationPurpose.REGISTER, "reader@example.com", Duration.ofMinutes(5));

        AuthResult result = authService.register(new RegisterRequest(
                "reader@example.com",
                "StrongPass123",
                "Reader",
                code
        ));

        UserAccount user = userAccountRepository.findByEmail("reader@example.com").orElseThrow();
        assertThat(result.token()).isNotBlank();
        assertThat(user.getPasswordHash()).doesNotContain("StrongPass123");
        assertThat(authService.currentUser(result.token()))
                .contains(new CurrentUser(user.getId(), "reader@example.com", "Reader"));
    }

    @Test
    void registerRejectsWrongCode() {
        String realCode = verificationCodeStore.issue(VerificationPurpose.REGISTER, "reader@example.com", Duration.ofMinutes(5));

        assertThatThrownBy(() -> authService.register(new RegisterRequest(
                "reader@example.com",
                "StrongPass123",
                "Reader",
                wrongCodeFor(realCode)
        )))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(exception -> ((ResponseStatusException) exception).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(userAccountRepository.findByEmail("reader@example.com")).isEmpty();
    }

    @Test
    void loginRejectsWrongPassword() {
        seedRegisteredUser("reader@example.com");

        assertThatThrownBy(() -> authService.login(new LoginRequest("reader@example.com", "wrong-password")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("邮箱或密码不正确");
    }

    @Test
    void resetPasswordVerifiesCodeAndInvalidatesExistingSessions() {
        AuthResult oldSession = seedRegisteredUser("reader@example.com");
        String code = verificationCodeStore.issue(VerificationPurpose.PASSWORD_RESET, "reader@example.com", Duration.ofMinutes(5));

        authService.resetPassword(new ResetPasswordRequest("reader@example.com", code, "FreshPass456"));

        UserAccount user = userAccountRepository.findByEmail("reader@example.com").orElseThrow();
        assertThat(user.getPasswordHash()).doesNotContain("StrongPass123");
        assertThat(authService.currentUser(oldSession.token())).isEmpty();
        assertThat(authService.login(new LoginRequest("reader@example.com", "FreshPass456")).token()).isNotBlank();
    }

    @Test
    void registerCodeRefusesTakenEmailsAndThrottlesResends() {
        seedRegisteredUser("taken@example.com");

        assertThatThrownBy(() -> authService.sendRegisterCode(new SendCodeRequest("taken@example.com")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(exception -> ((ResponseStatusException) exception).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);

        authService.sendRegisterCode(new SendCodeRequest("fresh@example.com"));
        assertThatThrownBy(() -> authService.sendRegisterCode(new SendCodeRequest("fresh@example.com")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(exception -> ((ResponseStatusException) exception).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void passwordResetCodeRefusesUnknownEmails() {
        assertThatThrownBy(() -> authService.sendPasswordResetCode(new SendCodeRequest("ghost@example.com")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(exception -> ((ResponseStatusException) exception).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    private AuthResult seedRegisteredUser(String email) {
        String code = verificationCodeStore.issue(VerificationPurpose.REGISTER, email, Duration.ofMinutes(5));
        return authService.register(new RegisterRequest(email, "StrongPass123", "Reader", code));
    }

    private static String wrongCodeFor(String realCode) {
        return realCode.equals("000000") ? "999999" : "000000";
    }
}
