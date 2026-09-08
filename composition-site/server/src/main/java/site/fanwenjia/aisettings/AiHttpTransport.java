package site.fanwenjia.aisettings;

import java.net.http.HttpClient;
import java.time.Duration;

/** Shared connection pool; credentials stay in individual requests, never in this client. */
public final class AiHttpTransport {
    private AiHttpTransport() {}
    public static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(6))
            .followRedirects(HttpClient.Redirect.NEVER).build();
}
