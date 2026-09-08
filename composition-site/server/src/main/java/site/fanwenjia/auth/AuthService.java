package site.fanwenjia.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private static final int TOKEN_BYTES = 32;
    private static final long SESSION_DAYS = 30;

    private final UserAccountRepository userAccountRepository;
    private final UserSessionRepository userSessionRepository;
    private final PasswordEncoder passwordEncoder;
    private final VerificationCodeStore verificationCodeStore;
    private final VerificationEmailSender verificationEmailSender;
    private final Duration codeTtl;
    private final Duration codeCooldown;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            UserAccountRepository userAccountRepository,
            UserSessionRepository userSessionRepository,
            PasswordEncoder passwordEncoder,
            VerificationCodeStore verificationCodeStore,
            VerificationEmailSender verificationEmailSender,
            @Value("${composition.auth.code-expire-minutes:5}") long codeExpireMinutes,
            @Value("${composition.auth.code-resend-seconds:60}") long codeResendSeconds
    ) {
        this.userAccountRepository = userAccountRepository;
        this.userSessionRepository = userSessionRepository;
        this.passwordEncoder = passwordEncoder;
        this.verificationCodeStore = verificationCodeStore;
        this.verificationEmailSender = verificationEmailSender;
        this.codeTtl = Duration.ofMinutes(codeExpireMinutes);
        this.codeCooldown = Duration.ofSeconds(codeResendSeconds);
    }

    @Transactional
    public AuthResult register(RegisterRequest request) {
        validatePasswordBytes(request.password());
        String email = normalizeEmail(request.email());
        if (!verificationCodeStore.verify(VerificationPurpose.REGISTER, email, request.code())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "验证码不正确或已过期");
        }
        if (userAccountRepository.findByEmail(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该邮箱已经注册");
        }
        UserAccount user = userAccountRepository.save(new UserAccount(
                email,
                request.displayName().trim(),
                passwordEncoder.encode(request.password())
        ));
        return issueSession(user);
    }

    @Transactional
    public void sendRegisterCode(SendCodeRequest request) {
        String email = normalizeEmail(request.email());
        if (userAccountRepository.findByEmail(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该邮箱已经注册,请直接登录或重置密码");
        }
        issueCode(VerificationPurpose.REGISTER, email);
    }

    @Transactional
    public void sendPasswordResetCode(SendCodeRequest request) {
        String email = normalizeEmail(request.email());
        if (userAccountRepository.findByEmail(email).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "该邮箱尚未注册");
        }
        issueCode(VerificationPurpose.PASSWORD_RESET, email);
    }

    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        validatePasswordBytes(request.newPassword());
        String email = normalizeEmail(request.email());
        if (!verificationCodeStore.verify(VerificationPurpose.PASSWORD_RESET, email, request.code())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "验证码不正确或已过期");
        }
        UserAccount user = userAccountRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "该邮箱尚未注册"));
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userAccountRepository.save(user);
        // 密码被重置后旧会话一律作废,防止遗留在其他设备上的登录态继续生效。
        userSessionRepository.deleteByUser_Id(user.getId());
    }

    private void issueCode(VerificationPurpose purpose, String email) {
        if (!verificationCodeStore.canIssue(purpose, email, codeCooldown)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "验证码已发送,请一分钟后再试");
        }
        String code = verificationCodeStore.issue(purpose, email, codeTtl);
        try {
            verificationEmailSender.send(email, code, purpose);
        } catch (RuntimeException exception) {
            // 发信失败就把刚发的码作废,用户可立即重试而不用等冷却。
            verificationCodeStore.discard(purpose, email);
            throw exception;
        }
    }

    @Transactional
    public AuthResult login(LoginRequest request) {
        validatePasswordBytes(request.password());
        UserAccount user = userAccountRepository.findByEmail(normalizeEmail(request.email()))
                .orElseThrow(this::invalidCredentials);
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw invalidCredentials();
        }
        return issueSession(user);
    }

    @Transactional(readOnly = true)
    public Optional<CurrentUser> currentUser(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        return userSessionRepository.findByTokenHashAndExpiresAtAfter(hashToken(rawToken), Instant.now())
                .map(session -> toCurrentUser(session.getUser()));
    }

    @Transactional
    public void logout(String rawToken) {
        if (rawToken != null && !rawToken.isBlank()) {
            userSessionRepository.deleteByTokenHash(hashToken(rawToken));
        }
    }

    private AuthResult issueSession(UserAccount user) {
        String rawToken = generateToken();
        userSessionRepository.save(new UserSession(
                user,
                hashToken(rawToken),
                Instant.now().plus(SESSION_DAYS, ChronoUnit.DAYS)
        ));
        return new AuthResult(rawToken, toUserView(user));
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hashToken(String rawToken) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private void validatePasswordBytes(String password) {
        if (password == null || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "密码过长：最多 72 个 UTF-8 字节，中文等字符会占多个字节，请缩短密码。");
        }
    }

    private ResponseStatusException invalidCredentials() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "邮箱或密码不正确");
    }

    private UserView toUserView(UserAccount user) {
        return new UserView(user.getId(), user.getEmail(), user.getDisplayName());
    }

    private CurrentUser toCurrentUser(UserAccount user) {
        return new CurrentUser(user.getId(), user.getEmail(), user.getDisplayName());
    }
}
