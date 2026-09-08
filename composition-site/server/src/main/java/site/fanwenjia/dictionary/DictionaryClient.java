package site.fanwenjia.dictionary;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;
import org.slf4j.LoggerFactory;

@Component
public class DictionaryClient {
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    public Optional<DictionaryData> lookup(String term) {
        if (term == null || term.length() > 200 || !term.matches("[A-Za-z][A-Za-z '\u2019-]*")) return Optional.empty();
        var request = HttpRequest.newBuilder(URI.create("https://dict.youdao.com/jsonapi?jsonversion=2&client=mobile&q="
                + URLEncoder.encode(term, StandardCharsets.UTF_8))).timeout(Duration.ofSeconds(5)).GET().build();
        var pending = http.sendAsync(request, info -> new site.fanwenjia.wordbookai.WordbookAiClient.BoundedBodySubscriber(1_048_576));
        try {
            var response = pending.get(6, TimeUnit.SECONDS);
            if (response.statusCode() != 200) return Optional.empty();
            return parse(term, mapper.readTree(response.body()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); return Optional.empty();
        } catch (Exception e) {
            LoggerFactory.getLogger(DictionaryClient.class).warn("Dictionary lookup unavailable: {}", e.getClass().getSimpleName());
            return Optional.empty();
        } finally { if (!pending.isDone()) pending.cancel(true); }
    }

    static Optional<DictionaryData> parse(String term, JsonNode root) {
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
