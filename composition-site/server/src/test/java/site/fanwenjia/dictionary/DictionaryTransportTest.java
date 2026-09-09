package site.fanwenjia.dictionary;

import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import javax.net.ssl.SSLHandshakeException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.wordbookai.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DictionaryTransportTest {
    private static final String WORD = """
        {"ec":{"word":[{"trs":[{"tr":[{"l":{"i":["n. 单词","v. 措辞"]}}]}]}]}}
        """;

    @SuppressWarnings("unchecked")
    private HttpResponse<byte[]> response(int status, String body) {
        HttpResponse<byte[]> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(body.getBytes(StandardCharsets.UTF_8));
        return response;
    }

    @Test void retriesTransientFailureAndCachesOnlySuccessfulResult() {
        var http = mock(HttpClient.class);
        var success = response(200, WORD);
        when(http.sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any()))
            .thenReturn(CompletableFuture.failedFuture(new SSLHandshakeException("test")))
            .thenReturn(CompletableFuture.completedFuture(success));
        var client = new DictionaryClient(http);
        assertThat(client.lookup("word").orElseThrow().meanings()).containsExactly("n. 单词", "v. 措辞");
        assertThat(client.lookup("word")).isPresent();
        verify(http, times(2)).sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any());
    }

    @Test void persistentOutageDoesNotBecomeDictionaryMissOrTriggerAi() {
        var http = mock(HttpClient.class);
        when(http.sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any()))
            .thenReturn(CompletableFuture.failedFuture(new HttpTimeoutException("test")));
        var ai = mock(WordbookAiController.class);
        var translator = mock(ChineseTranslationClient.class);
        var controller = new DictionaryController(new DictionaryClient(http), ai, translator);
        assertThatThrownBy(() -> controller.define(mock(CurrentUser.class), new WordbookAiModels.LookupRequest("word")))
            .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                assertThat(e.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat(e.getReason()).contains("词典连接");
            });
        verify(http, times(2)).sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any());
        verifyNoInteractions(ai, translator);
    }

    @Test void trueMissIsNotCachedAndCanSucceedLater() {
        var http = mock(HttpClient.class);
        var miss = response(200, "{}");
        var success = response(200, WORD);
        when(http.sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any()))
            .thenReturn(CompletableFuture.completedFuture(miss))
            .thenReturn(CompletableFuture.completedFuture(success));
        var client = new DictionaryClient(http);
        assertThat(client.lookup("word")).isEmpty();
        assertThat(client.lookup("word")).isPresent();
        verify(http, times(2)).sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any());
    }

    @Test void rateLimitedUpstreamIsNotRetriedImmediately() {
        var http = mock(HttpClient.class);
        var limited = response(429, "");
        when(http.sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any()))
            .thenReturn(CompletableFuture.completedFuture(limited));
        assertThatThrownBy(() -> new DictionaryClient(http).lookup("word")).isInstanceOf(ResponseStatusException.class);
        verify(http).sendAsync(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any());
    }
}
