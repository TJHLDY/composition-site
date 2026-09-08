package site.fanwenjia.wordbookai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

class WordbookAiClientTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private HttpServer upstream;
    private final AtomicReference<JsonNode> request = new AtomicReference<>();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private final AtomicInteger requestCount = new AtomicInteger();
    private final List<String> queuedResponses = new ArrayList<>();
    private String response;
    private int status = 200;
    private long delayMillis;

    @BeforeEach
    void start() throws Exception {
        upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.createContext("/v1/chat/completions", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            request.set(mapper.readTree(exchange.getRequestBody()));
            requestCount.incrementAndGet();
            try {
                if (delayMillis > 0) Thread.sleep(delayMillis);
                String nextResponse;
                synchronized (queuedResponses) {
                    nextResponse = queuedResponses.isEmpty() ? response : queuedResponses.remove(0);
                }
                byte[] bytes = nextResponse.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        upstream.start();
    }

    @AfterEach
    void stop() {
        upstream.stop(0);
    }

    @Test
    void translatesChineseAndUsesExistingOpenAiProtocolWithoutSendingAccountData() throws Exception {
        lookupResponse("make progress", "word", List.of(Map.of("term", "make steady progress", "translationZh", "稳步进展")));
        var result = client().lookup("  取得进展  ");
        assertThat(result.term()).isEqualTo("make progress");
        assertThat(result.kind()).isEqualTo("phrase");
        assertThat(result.translationZh()).isEqualTo("取得进展");
        assertThat(result.memoryHint()).isEqualTo("注意搭配");
        assertThat(result.collocations()).hasSize(1);
        assertThat(authorization.get()).isEqualTo("Bearer test-secret");
        JsonNode body = request.get();
        assertThat(body.path("model").asText()).isEqualTo("test-model");
        assertThat(body.at("/response_format/type").asText()).isEqualTo("json_object");
        assertThat(body.at("/thinking/type").asText()).isEqualTo("disabled");
        assertThat(body.path("max_tokens").asInt()).isBetween(1, 2048);
        assertThat(body.at("/messages/1/content").asText()).contains("取得进展").doesNotContain("email", "accountId");
    }

    @ParameterizedTest
    @ValueSource(strings = {"don't", "mother-in-law", "teacher’s", "well‑known"})
    void classifiesApostrophesAndHyphensAsOneWord(String term) throws Exception {
        lookupResponse(term, "phrase", List.of());
        assertThat(client().lookup(term).kind()).isEqualTo("word");
    }

    @Test
    void supportsProvidersWithoutOptionalOutputAndThinkingFlags() throws Exception {
        lookupResponse("progress", "word", List.of());
        new WordbookAiClient(mapper, "test-secret", baseUrl(), "test-model", 0.3, false, false).lookup("progress");
        assertThat(request.get().has("response_format")).isFalse();
        assertThat(request.get().has("thinking")).isFalse();
        assertThat(request.get().path("temperature").asDouble()).isEqualTo(0.3);
    }

    @Test
    void missingAndInvalidConfigurationAreUnavailableWithoutCallingUpstream() {
        for (String[] config : List.of(new String[]{"", baseUrl(), "model"},
                new String[]{"secret", baseUrl(), ""}, new String[]{"secret", "not a URL", "model"},
                new String[]{"secret", "file:///tmp", "model"})) {
            unavailable(() -> new WordbookAiClient(mapper, config[0], config[1], config[2], 0, true, true).lookup("test"));
        }
        assertThat(request.get()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"null", "[]", "{}", "not-json", "{\"choices\":[]}",
            "{\"choices\":[{\"message\":{\"content\":42}}]}"})
    void rejectsMalformedEnvelopes(String malformed) {
        response = malformed;
        unavailable(() -> client().lookup("test"));
    }

    @Test
    void rejectsInvalidFieldsAndSingleWordCollocations() throws Exception {
        for (Object value : List.of(42, "", "x".repeat(501))) {
            content(Map.of("term", "progress", "translationZh", value, "memoryHint", "", "collocations", List.of()));
            unavailable(() -> client().lookup("progress"));
        }
        lookupResponse("进展", "word", List.of());
        unavailable(() -> client().lookup("进展"));
        lookupResponse("progress", "word", List.of(Map.of("term", "progress", "translationZh", "进展")));
        unavailable(() -> client().lookup("progress"));
        lookupResponse("progress", "word", java.util.Collections.nCopies(9, Map.of("term", "make progress", "translationZh", "进展")));
        unavailable(() -> client().lookup("progress"));
    }

    @Test
    void rejectsTruncatedOutputTrailingJsonAndOversizedBodies() throws Exception {
        response = mapper.writeValueAsString(Map.of("choices", List.of(Map.of("finish_reason", "length",
                "message", Map.of("content", "{\"term\":\"progress\",\"translationZh\":\"进展\",\"memoryHint\":\"\",\"collocations\":[]}")))));
        unavailable(() -> client().lookup("test"));
        content("{\"term\":\"progress\",\"translationZh\":\"进展\",\"memoryHint\":\"\",\"collocations\":[]} {}");
        unavailable(() -> client().lookup("test"));
        response = "x".repeat(70_000);
        unavailable(() -> client().lookup("test"));
    }

    @Test
    void upstreamFailureAndTimeoutDoNotExposeProviderDetails() {
        response = "test-secret private-provider-response";
        status = 429;
        unavailable(() -> client().lookup("test"));
        status = 200;
        delayMillis = 500;
        unavailable(() -> new WordbookAiClient(mapper, "test-secret", baseUrl(), "test-model", 0, true, true,
                Duration.ofMillis(75)).lookup("test"));
    }

    @Test
    void acceptsNaturalSentenceWithCaseInsensitiveWholePhrase() throws Exception {
        content(Map.of("english", "We MAKE steady PROGRESS when we practise every day.", "translationZh", "每天练习就能稳步进步。", "usage", "用于描述持续进步。"));
        var result = client().sentence("make steady progress", "稳步进步");
        assertThat(result.english()).startsWith("We MAKE");
        assertThat(result.usage()).isEqualTo("用于描述持续进步。");
        assertThat(request.get().at("/messages/0/content").asText()).containsIgnoringCase("natural");
    }

    @ParameterizedTest
    @ValueSource(strings = {"We make progresses every day.", "We remake progress every day.", "We make progress-based plans.", "make progress", "Make progress!!!", "We learn something else every day."})
    void rejectsMissingTargetSubstringsAndNonSentences(String english) throws Exception {
        content(Map.of("english", english, "translationZh", "我们进步。", "usage", "常见搭配"));
        unavailable(() -> client().sentence("make progress", "取得进展"));
    }

    @Test
    void sentenceMatchingNormalizesCurlyApostrophesAndSpacing() throws Exception {
        content(Map.of("english", "Please don’t give up when the work gets difficult.", "translationZh", "困难时请不要放弃。", "usage", "用于鼓励。"));
        assertThat(client().sentence("don't   give up", "不要放弃").english()).contains("don’t give up");
    }

    @Test
    void retriesSentenceWhenTheFirstProviderResultDoesNotMeetTheContract() throws Exception {
        content(Map.of("english", "She makes progress in her English studies every week.", "translationZh", "取得进步。", "usage", "常见搭配。"));
        queuedResponses.add(response);
        content(Map.of("english", "We make progress by practising a little every day.", "translationZh", "我们每天练习一点就能取得进步。", "usage", "用于描述逐步提升。"));
        queuedResponses.add(response);

        var result = client().sentence("make progress", "取得进步");

        assertThat(result.english()).contains("make progress");
        assertThat(requestCount.get()).isEqualTo(2);
        assertThat(request.get().at("/messages/0/content").asText()).contains("previous attempt", "I can make progress");
    }

    private WordbookAiClient client() {
        return new WordbookAiClient(mapper, "test-secret", baseUrl(), "test-model", 0, true, true);
    }

    private String baseUrl() {
        return "http://127.0.0.1:" + upstream.getAddress().getPort() + "/v1/";
    }

    private void lookupResponse(String term, String kind, List<?> collocations) throws Exception {
        content(Map.of("term", term, "kind", kind, "translationZh", "取得进展", "memoryHint", "注意搭配", "collocations", collocations));
    }

    private void content(Object value) throws Exception {
        String json = value instanceof String text ? text : mapper.writeValueAsString(value);
        response = mapper.writeValueAsString(Map.of("choices", List.of(Map.of("finish_reason", "stop", "message", Map.of("content", json)))));
    }

    private void unavailable(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class, exception -> {
            assertThat(exception.getStatusCode().value()).isEqualTo(503);
            assertThat(exception.getMessage()).doesNotContain("test-secret", "private-provider-response", baseUrl());
            assertThat(exception.getCause()).isNull();
        });
    }
}
