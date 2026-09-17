package site.fanwenjia.onboarding;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import site.fanwenjia.auth.VerificationCodeStore;
import site.fanwenjia.auth.VerificationPurpose;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:onboarding-api-test;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "composition.translation.provider.api-key=",
        "composition.translation.provider.model="
})
@AutoConfigureMockMvc
@Transactional
class OnboardingApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private VerificationCodeStore verificationCodeStore;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

    @Test
    void newAccountStartsAutomaticallyWhileMissingStateIsTreatedAsLegacy() throws Exception {
        String token = register("onboarding-fresh@example.com", "Fresh learner");

        mockMvc.perform(get("/api/onboarding").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tutorialVersion").value(1))
                .andExpect(jsonPath("$.coreStatus").value("not_started"))
                .andExpect(jsonPath("$.autoStart").value(true))
                .andExpect(jsonPath("$.aiGuideSeen").value(false));

        jdbcTemplate.update("delete from user_onboarding where owner_id = (select id from app_users where email = ?)",
                "onboarding-fresh@example.com");
        entityManager.clear();

        mockMvc.perform(get("/api/onboarding").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coreStatus").value("completed"))
                .andExpect(jsonPath("$.autoStart").value(false));
    }

    @Test
    void startedGuideCanBeSkippedAndNeverAutoStartsAgain() throws Exception {
        String token = register("onboarding-skip@example.com", "Skipping learner");

        mockMvc.perform(post("/api/onboarding/core/start").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coreStatus").value("in_progress"))
                .andExpect(jsonPath("$.autoStart").value(true));

        mockMvc.perform(post("/api/onboarding/core/skip").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coreStatus").value("skipped"))
                .andExpect(jsonPath("$.autoStart").value(false));

        mockMvc.perform(get("/api/onboarding").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coreStatus").value("skipped"))
                .andExpect(jsonPath("$.autoStart").value(false));
    }

    @Test
    void guideOwnsOneWordbookAndOneCompositionUntilItsOwnAnnotationCompletesIt() throws Exception {
        String alice = register("onboarding-owner@example.com", "Owner");
        String bob = register("onboarding-other@example.com", "Other");
        mockMvc.perform(post("/api/onboarding/core/start").header("Authorization", "Bearer " + alice))
                .andExpect(status().isOk());

        long bobsWordbook = createWordbook(bob, "borrow");
        mockMvc.perform(post("/api/onboarding/core/wordbook/{entryId}", bobsWordbook)
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isNotFound());

        long wordbookId = createWordbook(alice, "explore");
        mockMvc.perform(post("/api/onboarding/core/wordbook/{entryId}", wordbookId)
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tutorialWordbookId").value(wordbookId));
        mockMvc.perform(post("/api/onboarding/core/wordbook/{entryId}", wordbookId)
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isOk());
        long replacementWordbook = createWordbook(alice, "replace");
        mockMvc.perform(post("/api/onboarding/core/wordbook/{entryId}", replacementWordbook)
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isConflict());

        long compositionId = createComposition(alice, "Tutorial essay", "Students explore ideas.");
        mockMvc.perform(post("/api/onboarding/core/composition/{compositionId}", compositionId)
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tutorialCompositionId").value(compositionId));

        long annotationId = createAnnotation(alice, compositionId, 9, 16);
        mockMvc.perform(post("/api/onboarding/core/complete")
                        .header("Authorization", "Bearer " + alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"annotationId\":" + annotationId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coreStatus").value("completed"))
                .andExpect(jsonPath("$.autoStart").value(false));
    }

    @Test
    void aiGuideIsClaimedOnceWithoutReopeningTheCoreGuide() throws Exception {
        String token = register("onboarding-ai@example.com", "AI learner");

        mockMvc.perform(post("/api/onboarding/ai-guide/claim").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.show").value(true));
        mockMvc.perform(post("/api/onboarding/ai-guide/claim").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.show").value(false));
        mockMvc.perform(get("/api/onboarding").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.coreStatus").value("not_started"))
                .andExpect(jsonPath("$.aiGuideSeen").value(true));
    }

    private String register(String email, String displayName) throws Exception {
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
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.path("token").asText();
    }

    private long createWordbook(String token, String term) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/wordbook")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "term", term,
                                "translationZh", "释义",
                                "note", ""
                        ))))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("id").asLong();
    }

    private long createComposition(String token, String title, String content) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/compositions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", title,
                                "content", content
                        ))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("id").asLong();
    }

    private long createAnnotation(String token, long compositionId, int startOffset, int endOffset) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/compositions/{compositionId}/annotations", compositionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "startOffset", startOffset,
                                "endOffset", endOffset,
                                "contentVersion", 1,
                                "kind", "word",
                                "translationZh", "探索"
                        ))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("id").asLong();
    }
}
