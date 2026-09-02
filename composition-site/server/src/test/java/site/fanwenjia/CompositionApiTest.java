package site.fanwenjia;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:composition-api-test;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "composition.translation.zhipu.api-key="
})
@AutoConfigureMockMvc
@Transactional
class CompositionApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void servesTheStandaloneFrontendAndUses401ForProtectedRoutes() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("index.html"));
        mockMvc.perform(get("/index.html"))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(new String(
                        result.getResponse().getContentAsByteArray(),
                        StandardCharsets.UTF_8
                )).contains("范文夹"));
        mockMvc.perform(get("/styles.css")).andExpect(status().isOk());
        mockMvc.perform(get("/api-client.js")).andExpect(status().isOk());
        mockMvc.perform(get("/app.js")).andExpect(status().isOk());
        mockMvc.perform(get("/essay-utils.js")).andExpect(status().isOk());

        mockMvc.perform(get("/api/compositions"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/compositions").header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void bearerTokenWorksUntilLogoutThenBecomesUnauthorized() throws Exception {
        String token = register("reader@example.com", "Reader");

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("reader@example.com"));
        mockMvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void accountCanCreateAndAnnotateOnlyItsOwnComposition() throws Exception {
        String aliceToken = register("alice@example.com", "Alice");
        MvcResult created = mockMvc.perform(post("/api/compositions")
                        .header("Authorization", "Bearer " + aliceToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "A title",
                                "sourceLabel", "2026 年英语二 · 第 1 套",
                                "content", "A meaningful contribution matters."
                        ))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.annotations").isEmpty())
                .andReturn();
        long compositionId = objectMapper.readTree(created.getResponse().getContentAsString()).path("id").asLong();

        MvcResult annotation = mockMvc.perform(post("/api/compositions/{id}/annotations", compositionId)
                        .header("Authorization", "Bearer " + aliceToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "startOffset", 2,
                                "endOffset", 12,
                                "kind", "word",
                                "translationZh", "有意义的",
                                "note", "作文常用表达",
                                "contentVersion", 1
                        ))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.selectedText").value("meaningful"))
                .andReturn();
        long annotationId = objectMapper.readTree(annotation.getResponse().getContentAsString()).path("id").asLong();

        mockMvc.perform(get("/api/compositions/{id}", compositionId).header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.annotations[0].translationZh").value("有意义的"));
        mockMvc.perform(get("/api/compositions").header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].noteCount").value(1));

        String bobToken = register("bob@example.com", "Bob");
        mockMvc.perform(get("/api/compositions/{id}", compositionId).header("Authorization", "Bearer " + bobToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/compositions/{id}/annotations/{annotationId}", compositionId, annotationId)
                        .header("Authorization", "Bearer " + bobToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void phraseAnnotationKeepsTheReadersChosenLearningTextAlongsideTheSourceRange() throws Exception {
        String token = register("learning-text@example.com", "Learning Reader");
        MvcResult created = mockMvc.perform(post("/api/compositions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "A title",
                                "content", "Combining practical experience with academic study helps students."
                        ))))
                .andExpect(status().isCreated())
                .andReturn();
        long compositionId = objectMapper.readTree(created.getResponse().getContentAsString()).path("id").asLong();

        mockMvc.perform(post("/api/compositions/{id}/annotations", compositionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "startOffset", 0,
                                "endOffset", 35,
                                "kind", "phrase",
                                "translationZh", "把实践经验与学术学习结合",
                                "learningText", "Combining … with",
                                "note", "combine A with B",
                                "contentVersion", 1
                        ))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.selectedText").value("Combining practical experience with"))
                .andExpect(jsonPath("$.learningText").value("Combining … with"));

        mockMvc.perform(get("/api/compositions/{id}", compositionId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.annotations[0].selectedText").value("Combining practical experience with"))
                .andExpect(jsonPath("$.annotations[0].learningText").value("Combining … with"));
    }

    @Test
    void explanationEndpointIsExplicitlyUnavailableUntilTheServerKeyIsConfigured() throws Exception {
        String token = register("translation@example.com", "Translator");
        MvcResult created = mockMvc.perform(post("/api/compositions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "A title",
                                "content", "A meaningful contribution matters."
                        ))))
                .andExpect(status().isCreated())
                .andReturn();
        long compositionId = objectMapper.readTree(created.getResponse().getContentAsString()).path("id").asLong();

        mockMvc.perform(post("/api/compositions/{id}/explanations", compositionId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "startOffset", 2,
                                "endOffset", 12,
                                "kind", "word",
                                "contentVersion", 1
                        ))))
                .andExpect(status().isServiceUnavailable());
    }

    private String register(String email, String displayName) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", email,
                                "password", "StrongPass123",
                                "displayName", displayName
                        ))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.path("token").asText();
    }
}
