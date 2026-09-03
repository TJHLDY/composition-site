package site.fanwenjia.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.server.ResponseStatusException;

class SmtpVerificationEmailSenderTest {

    @Test
    void unconfiguredSenderReturnsRecoverable503WithoutSending() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        SmtpVerificationEmailSender sender = new SmtpVerificationEmailSender(mailSender, "VocabNote@163.com", "");

        assertThatThrownBy(() -> sender.send("reader@example.com", "123456", VerificationPurpose.REGISTER))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("邮件服务未配置")
                .extracting(exception -> ((ResponseStatusException) exception).getStatusCode())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        verify(mailSender, org.mockito.Mockito.never()).send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
    }

    @Test
    void sendsThePlainTextCodeMail() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        SmtpVerificationEmailSender sender = new SmtpVerificationEmailSender(mailSender, "VocabNote@163.com", "smtp-auth-code");

        sender.send("reader@example.com", "654321", VerificationPurpose.PASSWORD_RESET);

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(captor.capture());
        SimpleMailMessage message = captor.getValue();
        assertThat(message.getFrom()).isEqualTo("VocabNote@163.com");
        assertThat(message.getTo()).containsExactly("reader@example.com");
        assertThat(message.getSubject()).isEqualTo("范文夹 - 重置密码验证码");
        assertThat(message.getText()).contains("654321").contains("5 分钟");
    }

    @Test
    void smtpFailuresMapTo503InsteadOfLeakingDetails() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        org.mockito.Mockito.doThrow(new MailAuthenticationException("auth rejected"))
                .when(mailSender).send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
        SmtpVerificationEmailSender sender = new SmtpVerificationEmailSender(mailSender, "VocabNote@163.com", "bad-code");

        assertThatThrownBy(() -> sender.send("reader@example.com", "123456", VerificationPurpose.REGISTER))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("验证码邮件发送失败")
                .extracting(exception -> ((ResponseStatusException) exception).getStatusCode())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }
}
