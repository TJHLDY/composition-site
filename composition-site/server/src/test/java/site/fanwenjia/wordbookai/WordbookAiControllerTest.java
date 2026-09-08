package site.fanwenjia.wordbookai;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;

class WordbookAiControllerTest {
    private final WordbookAiClient client = mock(WordbookAiClient.class);
    private final AtomicLong now = new AtomicLong();
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        var clients = mock(site.fanwenjia.aisettings.AccountAiClients.class);
        when(clients.wordbook(org.mockito.ArgumentMatchers.any())).thenReturn(client);
        mvc = MockMvcBuilders.standaloneSetup(new WordbookAiController(clients,
                        new WordbookAiRateLimiter(now::get, Duration.ofSeconds(2), 8, 4)))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();
        signIn(1L);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void lookupReturnsApprovedContractAndNormalizesChineseInput() throws Exception {
        when(client.lookup("取得进展")).thenReturn(new WordbookAiModels.Lookup("make progress", "phrase", "取得进展",
                "常用搭配", List.of(new WordbookAiModels.Collocation("make steady progress", "稳步进展"))));
        mvc.perform(post("/api/wordbook/lookup").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\" 取得进展 \"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.term").value("make progress"))
                .andExpect(jsonPath("$.kind").value("phrase"))
                .andExpect(jsonPath("$.translationZh").value("取得进展"))
                .andExpect(jsonPath("$.memoryHint").value("常用搭配"))
                .andExpect(jsonPath("$.collocations[0].term").value("make steady progress"))
                .andExpect(jsonPath("$.collocations[0].translationZh").value("稳步进展"));
    }

    @Test
    void sentenceReturnsApprovedContract() throws Exception {
        when(client.sentence("make progress", "进步")).thenReturn(new WordbookAiModels.Sentence(
                "We make progress every day.", "我们每天都进步。", "用于描述进步。"));
        mvc.perform(post("/api/wordbook/sentence").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":\" make  progress \",\"translationZh\":\" 进步 \"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.english").value("We make progress every day."))
                .andExpect(jsonPath("$.translationZh").value("我们每天都进步。"))
                .andExpect(jsonPath("$.usage").value("用于描述进步。"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "{", "{\"query\":null}", "{\"query\":\"   \"}", "{\"query\":[]}",
            "{\"query\":\"a\\u0000b\"}"})
    void invalidQueriesReturn400WithoutProviderCall(String body) throws Exception {
        mvc.perform(post("/api/wordbook/lookup").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        verify(client, never()).lookup(anyString());
    }

    @Test
    void rejectsOversizedInputsWithoutConsumingCooldown() throws Exception {
        mvc.perform(post("/api/wordbook/lookup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"" + "a".repeat(201) + "\"}"))
                .andExpect(status().isBadRequest());
        when(client.lookup("word")).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI 暂不可用"));
        mvc.perform(post("/api/wordbook/lookup").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"word\"}"))
                .andExpect(status().isServiceUnavailable());
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"term\":\"进步\",\"translationZh\":\"进步\"}",
            "{\"term\":\"make progress\",\"translationZh\":\"\"}", "{\"term\":\"hello!\",\"translationZh\":\"你好\"}"})
    void rejectsInvalidSentenceInput(String body) throws Exception {
        mvc.perform(post("/api/wordbook/sentence").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        verify(client, never()).sentence(anyString(), anyString());
    }

    @Test
    void requiresCurrentUserForBothEndpoints() throws Exception {
        SecurityContextHolder.clearContext();
        mvc.perform(post("/api/wordbook/lookup").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"word\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/wordbook/sentence").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":\"make progress\",\"translationZh\":\"进步\"}"))
                .andExpect(status().isUnauthorized());
        verify(client, never()).lookup(anyString());
        verify(client, never()).sentence(anyString(), anyString());
    }

    @Test
    void cooldownSpansBothEndpointsIsAccountScopedAndReleasesAfterFailure() throws Exception {
        when(client.lookup(anyString())).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI 暂不可用"));
        when(client.sentence(anyString(), anyString())).thenReturn(new WordbookAiModels.Sentence(
                "We make progress every day.", "我们每天进步。", "用于描述进步。"));
        mvc.perform(post("/api/wordbook/lookup").contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"word\"}"))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(post("/api/wordbook/sentence").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":\"make progress\",\"translationZh\":\"进步\"}"))
                .andExpect(status().isTooManyRequests());
        signIn(2L);
        mvc.perform(post("/api/wordbook/sentence").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":\"make progress\",\"translationZh\":\"进步\"}"))
                .andExpect(status().isOk());
        signIn(1L);
        now.addAndGet(Duration.ofSeconds(2).toNanos());
        mvc.perform(post("/api/wordbook/sentence").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":\"make progress\",\"translationZh\":\"进步\"}"))
                .andExpect(status().isOk());
    }

    private void signIn(Long id) {
        var user = new CurrentUser(id, "reader@example.com", "Reader");
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(user, null, List.of()));
    }
}
