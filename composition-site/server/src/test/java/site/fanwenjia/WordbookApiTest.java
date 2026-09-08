package site.fanwenjia;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import site.fanwenjia.auth.*;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class WordbookApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired VerificationCodeStore codes;

    @Test void dictionarySnapshotPersistsAndEditingNotesPreservesIt() throws Exception {
        String token = user();
        var dictionary = Map.of("term", "progress", "ukPhonetic", "test", "usPhonetic", "test",
                "meanings", java.util.List.of("n. 进步", "v. 前进"), "wordForms", java.util.List.of(Map.of("name", "过去式", "value", "progressed")));
        JsonNode saved = req(post("/api/wordbook").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("term", "progress", "translationZh", "我的解释", "note", "", "dictionary", dictionary))), token);
        long id = saved.path("id").asLong();
        req(put("/api/wordbook/" + id).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("term", "progress", "translationZh", "自己记的意思", "note", "新备注"))), token);
        JsonNode loaded = req(get("/api/wordbook/" + id), token);
        assertThat(loaded.at("/dictionary/meanings").size()).isEqualTo(2);
        assertThat(loaded.path("translationZh").asText()).isEqualTo("自己记的意思");
        assertThat(loaded.at("/dictionary/wordForms/0/value").asText()).isEqualTo("progressed");
        assertThat(req(get("/api/wordbook?q=前进"), token).path("total").asInt()).isEqualTo(1);
    }

    @Test void classifiesDeduplicatesSortsAndSearchesWithoutSubstringsForSingleLetters() throws Exception {
        String token = user();
        save(token, "zebra", "斑马");
        long adapt = save(token, "Adapt", "适应").path("id").asLong();
        assertThat(save(token, " adapt ", "适应").path("id").asLong()).isEqualTo(adapt);
        assertThat(save(token, "take care of", "照顾").path("kind").asText()).isEqualTo("phrase");
        assertThat(save(token, "mother-in-law", "岳母").path("kind").asText()).isEqualTo("word");
        assertThat(req(get("/api/wordbook?kind=word"), token).path("items").get(0).path("term").asText()).isEqualTo("Adapt");
        JsonNode prefix = req(get("/api/wordbook?q=a"), token);
        assertThat(prefix.path("total").asInt()).isEqualTo(1);
        assertThat(req(get("/api/wordbook?q=照顾"), token).path("items").get(0).path("term").asText()).isEqualTo("take care of");
        assertThat(req(get("/api/wordbook").param("kind", "word").param("exact", "take care of"), token).path("total").asInt()).isEqualTo(1);
        assertThat(req(get("/api/wordbook").param("exact", "环境保护"), token).path("total").asInt()).isZero();
    }

    @Test void preservesBothEssaySensesAndDetachesSourcesWithoutLosingVocabulary() throws Exception {
        String token = user();
        long first = essay(token, "First", "issue matters.");
        long second = essay(token, "Second", "issue a statement.");
        long annotation = annotate(token, first, 0, 5, "word", "问题").path("id").asLong();
        annotate(token, second, 0, 5, "word", "发行");
        JsonNode item = req(get("/api/wordbook?exact=issue"), token).path("items").get(0);
        long id = item.path("id").asLong();
        JsonNode detail = req(get("/api/wordbook/" + id), token);
        assertThat(detail.path("senses").size()).isEqualTo(2);
        assertThat(req(get("/api/wordbook?q=发行"), token).path("total").asInt()).isEqualTo(1);
        req(delete("/api/compositions/" + first + "/annotations/" + annotation), token);
        req(delete("/api/compositions/" + second), token);
        detail = req(get("/api/wordbook/" + id), token);
        assertThat(detail.path("senses").size()).isEqualTo(2);
        for (JsonNode sense : detail.path("senses")) assertThat(sense.path("compositionId").isNull()).isTrue();
    }

    @Test void wordbookDeletionDoesNotDeleteEssaysOrPhrasesOrResurrectOnRefresh() throws Exception {
        String token = user();
        long essay = essay(token, "Source", "make a contribution.");
        annotate(token, essay, 0, 4, "word", "作出");
        long word = req(get("/api/wordbook?exact=make"), token).path("items").get(0).path("id").asLong();
        long phrase = save(token, "made a contribution", "作出贡献").path("id").asLong();
        save(token, "remarkable", "出色的");
        assertThat(req(get("/api/wordbook/" + word), token).path("related").get(0).path("id").asLong()).isEqualTo(phrase);
        req(delete("/api/wordbook/" + word), token);
        annotate(token, essay, 0, 4, "word", "制作");
        assertThat(req(get("/api/wordbook?exact=make"), token).path("items").size()).isZero();
        assertThat(req(get("/api/compositions/" + essay), token).path("annotations").size()).isEqualTo(1);
        assertThat(req(get("/api/wordbook/" + phrase), token).path("term").asText()).isEqualTo("made a contribution");
        assertThat(save(token, "make", "制作").path("senses").size()).isZero();
    }

    @Test void enforcesOwnershipAndStoresExampleIndependently() throws Exception {
        String token = user(), other = user();
        long id = save(token, "take care of", "照顾").path("id").asLong();
        mvc.perform(get("/api/wordbook")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/wordbook/" + id).header("Authorization", "Bearer " + other)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/wordbook/" + id).header("Authorization", "Bearer " + other)).andExpect(status().isNotFound());
        req(post("/api/wordbook/" + id + "/examples").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("english", "I take care of my family.", "translationZh", "我照顾家人。", "usage", "后接名词"))), token);
        JsonNode detail = req(get("/api/wordbook/" + id), token);
        assertThat(detail.path("examples").size()).isEqualTo(1);
        long example = detail.path("examples").get(0).path("id").asLong();
        mvc.perform(delete("/api/wordbook/" + id + "/examples/" + example).header("Authorization", "Bearer " + other)).andExpect(status().isNotFound());
        req(delete("/api/wordbook/" + id + "/examples/" + example), token);
        assertThat(req(get("/api/wordbook/" + id), token).path("examples").size()).isZero();
    }

    @Test void savedExamplesAcceptTypographicApostrophesButRequireTheWholePhrase() throws Exception {
        String token = user();
        long id = save(token, "don't give up", "不要放弃").path("id").asLong();
        req(post("/api/wordbook/" + id + "/examples").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("english", "We don’t give up when things get hard.", "translationZh", "遇到困难我们不放弃。"))), token);
        mvc.perform(post("/api/wordbook/" + id + "/examples").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("english", "We don't give update reports.", "translationZh", "我们不提供更新报告。")))).andExpect(status().isBadRequest());
    }

    private String user() throws Exception {
        String email = UUID.randomUUID() + "@example.com";
        String code = codes.issue(VerificationPurpose.REGISTER, email, Duration.ofMinutes(5));
        return req(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("email", email, "password", "StrongPass123", "displayName", "Reader", "code", code))), "").path("token").asText();
    }
    private JsonNode save(String token, String term, String translation) throws Exception {
        return req(post("/api/wordbook").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("term", term, "translationZh", translation, "note", ""))), token);
    }
    private long essay(String token, String title, String content) throws Exception {
        return req(post("/api/compositions").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("title", title, "content", content))), token).path("id").asLong();
    }
    private JsonNode annotate(String token, long essay, int start, int end, String kind, String meaning) throws Exception {
        return req(post("/api/compositions/" + essay + "/annotations").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("startOffset", start, "endOffset", end, "contentVersion", 1, "kind", kind, "translationZh", meaning))), token);
    }
    private JsonNode req(MockHttpServletRequestBuilder builder, String token) throws Exception {
        var response = mvc.perform(builder.header("Authorization", "Bearer " + token)).andExpect(status().is2xxSuccessful()).andReturn().getResponse();
        String body = response.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return body.isBlank() ? json.nullNode() : json.readTree(body);
    }
}
