package site.fanwenjia;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import site.fanwenjia.auth.VerificationCodeStore;
import site.fanwenjia.auth.VerificationPurpose;

/**
 * Exercises the servlet error-dispatch path that MockMvc does not use.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:composition-real-http-test;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "composition.translation.provider.api-key=",
        "composition.translation.provider.model="
})
class ExplanationHttpIntegrationTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private VerificationCodeStore verificationCodeStore;

    @LocalServerPort
    private int port;

    @Test
    void missingAccountAiConfigurationReturns428OverTheRealHttpServer() {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String email = "real-http-" + suffix + "@example.com";
        String code = verificationCodeStore.issue(VerificationPurpose.REGISTER, email, Duration.ofMinutes(5));
        Map<String, String> registerBody = new HashMap<>();
        registerBody.put("email", email);
        registerBody.put("password", "StrongPass123");
        registerBody.put("displayName", "HTTP Reader");
        registerBody.put("code", code);
        ResponseEntity<Map> registered = restTemplate.postForEntity(
                url("/api/auth/register"),
                registerBody,
                Map.class
        );
        assertThat(registered.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String token = String.valueOf(registered.getBody().get("token"));

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> created = restTemplate.exchange(
                url("/api/compositions"),
                HttpMethod.POST,
                new HttpEntity<>(Map.of(
                        "title", "A title",
                        "content", "A meaningful contribution matters."
                ), headers),
                Map.class
        );
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Number compositionId = (Number) created.getBody().get("id");

        ResponseEntity<Map> explanation = restTemplate.exchange(
                url("/api/compositions/" + compositionId.longValue() + "/explanations"),
                HttpMethod.POST,
                new HttpEntity<>(Map.of(
                        "startOffset", 2,
                        "endOffset", 12,
                        "kind", "word",
                        "contentVersion", 1
                ), headers),
                Map.class
        );

        assertThat(explanation.getStatusCode()).isEqualTo(HttpStatus.PRECONDITION_REQUIRED);
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
