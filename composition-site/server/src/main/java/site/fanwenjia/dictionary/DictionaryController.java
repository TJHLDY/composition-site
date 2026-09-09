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
    private final ChineseTranslationClient translator;
    public DictionaryController(DictionaryClient dictionary, WordbookAiController ai, ChineseTranslationClient translator) { this.dictionary = dictionary; this.ai = ai; this.translator=translator; }
    public record Result(String term, String kind, String translationZh, String memoryHint,
                         List<WordbookAiModels.Collocation> collocations, DictionaryData dictionary, String source) {}

    @PostMapping("/define")
    public Result define(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody WordbookAiModels.LookupRequest request) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        String term = request.query().strip().replaceAll("\\s+", " ");
        boolean chinese=term.codePoints().anyMatch(c->Character.UnicodeScript.of(c)==Character.UnicodeScript.HAN);
        // Phrase entries may contain several linked English fragments; the dictionary joins them in full.
        if(chinese && !term.matches("[\\p{IsHan}A-Za-z '\u2019-]+")) return translator.translate(user,term);
        var data = dictionary.lookup(term);
        if (data.isPresent()) {
            DictionaryData d = data.get();
            String brief = d.meanings().stream().map(s -> s.split("[；;]", 2)[0]).collect(java.util.stream.Collectors.joining(" · "));
            if (brief.length() > 500) brief = brief.substring(0, 499) + "…";
            return new Result(d.term(), d.term().contains(" ") ? "phrase" : "word", brief, "", List.of(), d, "dictionary");
        }
        if(chinese) return translator.translate(user,term);
        var result = ai.lookup(user, request);
        return new Result(result.term(), result.kind(), result.translationZh(), result.memoryHint(), result.collocations(), null, "ai");
    }
}
