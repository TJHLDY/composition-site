package site.fanwenjia.dictionary;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.wordbookai.*;

@RestController
@RequestMapping("/api/wordbook")
public class DictionaryController {
    private final DictionaryClient dictionary;
    private final WordbookAiController ai;
    public DictionaryController(DictionaryClient dictionary, WordbookAiController ai) { this.dictionary = dictionary; this.ai = ai; }
    public record Result(String term, String kind, String translationZh, String memoryHint,
                         List<WordbookAiModels.Collocation> collocations, DictionaryData dictionary, String source) {}

    @PostMapping("/define")
    public Result define(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody WordbookAiModels.LookupRequest request) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        String term = request.query().strip().replaceAll("\\s+", " ");
        var data = dictionary.lookup(term);
        if (data.isPresent()) {
            DictionaryData d = data.get();
            String brief = d.meanings().stream().map(s -> s.split("[；;]", 2)[0]).collect(java.util.stream.Collectors.joining(" · "));
            if (brief.length() > 500) brief = brief.substring(0, 499) + "…";
            return new Result(term, term.contains(" ") ? "phrase" : "word", brief, "", List.of(), d, "dictionary");
        }
        var result = ai.lookup(user, request);
        return new Result(result.term(), result.kind(), result.translationZh(), result.memoryHint(), result.collocations(), null, "ai");
    }
}
