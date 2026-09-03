package site.fanwenjia.auth;

/**
 * 验证码发信接口;测试中替换为假实现,绝不触网。
 */
interface VerificationEmailSender {

    void send(String to, String code, VerificationPurpose purpose);
}
