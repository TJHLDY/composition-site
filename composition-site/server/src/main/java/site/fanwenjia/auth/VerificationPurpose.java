package site.fanwenjia.auth;

/**
 * 验证码用途:注册与重置密码各自独立发码,互不通用。
 */
public enum VerificationPurpose {

    REGISTER("范文夹 - 注册验证码"),
    PASSWORD_RESET("范文夹 - 重置密码验证码");

    final String subject;

    VerificationPurpose(String subject) {
        this.subject = subject;
    }
}
