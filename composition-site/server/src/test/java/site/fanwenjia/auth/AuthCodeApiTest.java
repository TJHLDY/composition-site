package site.fanwenjia.auth;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:auth-code-api-test;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@AutoConfigureMockMvc
@Transactional
class AuthCodeApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private VerificationCodeStore verificationCodeStore;

    @MockitoBean
    private SmtpVerificationEmailSender emailSender;

    @Test
    void registerSendCodeSendsOnceThenThrottlesTheResend() throws Exception {
        mockMvc.perform(post("/api/auth/register/send-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", "new-reader@example.com"))))
                .andExpect(status().isNoContent());
        verify(emailSender).send(eq("new-reader@example.com"), any(), eq(VerificationPurpose.REGISTER));

        mockMvc.perform(post("/api/auth/register/send-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", "new-reader@example.com"))))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void registerSendCodeRefusesAlreadyRegisteredEmails() throws Exception {
        registerViaHttp("taken@example.com", "Taken Reader");

        mockMvc.perform(post("/api/auth/register/send-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", "taken@example.com"))))
                .andExpect(status().isConflict());
    }

    @Test
    void registerWithoutAValidCodeIsRejected() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "reader@example.com",
                                "password", "StrongPass123",
                                "displayName", "Reader",
                                "code", "123456"
                        ))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void passwordResetFlowEndsTheOldSessionAndAcceptsTheNewPassword() throws Exception {
        String oldToken = registerViaHttp("reset@example.com", "Reset Reader");

        mockMvc.perform(post("/api/auth/forgot-password/send-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("email", "reset@example.com"))))
                .andExpect(status().isNoContent());

        ArgumentCaptor<String> codeCaptor = ArgumentCaptor.forClass(String.class);
        verify(emailSender).send(eq("reset@example.com"), codeCaptor.capture(), eq(VerificationPurpose.PASSWORD_RESET));

        mockMvc.perform(post("/api/auth/forgot-password/reset")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "reset@example.com",
                                "code", codeCaptor.getValue(),
                                "newPassword", "FreshPass456"
                        ))))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + oldToken))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "reset@example.com",
                                "password", "FreshPass456"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    private String registerViaHttp(String email, String displayName) throws Exception {
        String code = verificationCodeStore.issue(VerificationPurpose.REGISTER, email, Duration.ofMinutes(5));
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email,
                                "password", "StrongPass123",
                                "displayName", displayName,
                                "code", code
                        ))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("token").asText();
    }
}
