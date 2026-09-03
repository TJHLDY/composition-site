package site.fanwenjia.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * 通过 SMTP 发送验证码邮件。COMPOSITION_MAIL_PASSWORD 未配置时返回可恢复的 503,
 * 与 TRANSLATION_API_KEY 的降级策略一致:站点照常启动,只有发码功能明确提示未就绪。
 */
@Component
class SmtpVerificationEmailSender implements VerificationEmailSender {

    private final JavaMailSender mailSender;
    private final String from;
    private final boolean configured;

    SmtpVerificationEmailSender(
            JavaMailSender mailSender,
            @Value("${spring.mail.username}") String from,
            @Value("${spring.mail.password:}") String password
    ) {
        this.mailSender = mailSender;
        this.from = from;
        this.configured = password != null && !password.isBlank();
    }

    @Override
    public void send(String to, String code, VerificationPurpose purpose) {
        if (!configured) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "邮件服务未配置:请在服务端设置 COMPOSITION_MAIL_PASSWORD 后重试");
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setSubject(purpose.subject);
            message.setText("您的验证码是:" + code + ",5 分钟内有效。请勿泄露给他人。");
            mailSender.send(message);
        } catch (MailException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "验证码邮件发送失败,请稍后重试", exception);
        }
    }
}
