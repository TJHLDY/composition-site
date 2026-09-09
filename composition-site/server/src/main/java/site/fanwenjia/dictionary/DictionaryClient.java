package site.fanwenjia.dictionary;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.LoggerFactory;

@Component
public class DictionaryClient {
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();
    private record Cached(DictionaryData data, long expiresAt) {}
    public DictionaryClient() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build());
    }
    DictionaryClient(HttpClient http) { this.http = http; }

    public Optional<DictionaryData> lookup(String term) {
        if (term == null || term.length() > 200 || !term.matches("[\\p{IsHan}A-Za-z][\\p{IsHan}A-Za-z '\u2019-]*")) return Optional.empty();
        var saved = cache.get(term);
        if (saved != null && saved.expiresAt() > System.currentTimeMillis()) return Optional.of(saved.data());
        var request = HttpRequest.newBuilder(URI.create("https://dict.youdao.com/jsonapi?jsonversion=2&client=mobile&q="
                + URLEncoder.encode(term, StandardCharsets.UTF_8))).timeout(Duration.ofSeconds(8)).GET().build();
        for (int attempt = 0; attempt < 2; attempt++) {
            CompletableFuture<HttpResponse<byte[]>> pending = null;
            try {
                pending = http.sendAsync(request, info -> new site.fanwenjia.wordbookai.WordbookAiClient.BoundedBodySubscriber(1_048_576));
                var response = pending.get(9, TimeUnit.SECONDS);
                if (response.statusCode() != 200) {
                    if (response.statusCode() == 429 || response.statusCode() < 500) throw unavailable();
                    continue;
                }
                var root = mapper.readTree(response.body());
                if (root == null || !root.isObject()) throw new IllegalStateException("Invalid dictionary response");
                var result = parse(term, root);
                if (result.isPresent()) {
                    synchronized (cache) {
                        cache.entrySet().removeIf(e -> e.getValue().expiresAt() <= System.currentTimeMillis());
                        if (cache.size() >= 512) cache.remove(cache.keySet().iterator().next());
                        cache.put(term, new Cached(result.get(), System.currentTimeMillis() + Duration.ofMinutes(30).toMillis()));
                    }
                }
                return result;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw unavailable();
            } catch (ResponseStatusException e) {
                throw e;
            } catch (Exception e) {
                Throwable cause = e;
                while (cause.getCause() != null && cause.getCause() != cause) cause = cause.getCause();
                LoggerFactory.getLogger(DictionaryClient.class).warn("Dictionary lookup failed: attempt={}, cause={}", attempt + 1, cause.getClass().getSimpleName());
            } finally {
                if (pending != null && !pending.isDone()) pending.cancel(true);
            }
        }
        throw unavailable();
    }
    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "词典连接暂时失败，请稍后重新查询。仍可手动填写释义并收录。");
    }

    static Optional<DictionaryData> parse(String term, JsonNode root) {
        if (term.codePoints().anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN)) {
            for (JsonNode word : root.path("ce").path("word")) {
                for (JsonNode group : word.path("trs")) for (JsonNode tr : group.path("tr")) {
                    JsonNode translation = tr.path("l");
                    {
                        StringBuilder parts = new StringBuilder();
                        for (JsonNode item : translation.path("i")) {
                            parts.append(item.isObject() ? item.path("#text").asText("") : item.asText(""));
                        }
                        String english = parts.toString().strip().replaceAll("\\s+", " ");
                        if (!english.matches("[A-Za-z][A-Za-z '\u2019-]*") || english.length() > 200) continue;
                        String meaning = translation.path("#tran").asText(term).strip();
                        if (meaning.isBlank()) meaning = term;
                        String pos = translation.path("pos").asText("").strip();
                        String definition = (pos + " " + meaning).strip();
                        if (definition.length() > 2000) definition = (pos + " " + term).strip();
                        return Optional.of(new DictionaryData(english,"","",List.of(definition),List.of()));
                    }
                }
            }
            return Optional.empty();
        }
        JsonNode entry = root.path("ec").path("word").path(0);
        if (!entry.isObject()) return Optional.empty();
        List<String> meanings = new ArrayList<>();
        for (JsonNode group : entry.path("trs")) for (JsonNode tr : group.path("tr")) for (JsonNode item : tr.path("l").path("i"))
            if (item.isTextual() && !item.asText().isBlank()) meanings.add(item.asText());
        if (meanings.isEmpty()) return Optional.empty();
        List<DictionaryData.Form> forms = new ArrayList<>();
        for (JsonNode wf : entry.path("wfs")) {
            String name = wf.path("wf").path("name").asText("");
            String value = wf.path("wf").path("value").asText("");
            if (!value.isBlank()) forms.add(new DictionaryData.Form(name, value));
        }
        return Optional.of(new DictionaryData(term, entry.path("ukphone").asText(""), entry.path("usphone").asText(""), meanings, forms));
    }
}
