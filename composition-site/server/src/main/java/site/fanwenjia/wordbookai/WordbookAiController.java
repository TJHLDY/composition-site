package site.fanwenjia.wordbookai;

import jakarta.validation.Valid;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;

@RestController
@RequestMapping("/api/wordbook")
public class WordbookAiController {
    private final site.fanwenjia.aisettings.AccountAiClients clients;
    private final WordbookAiRateLimiter limiter;

    public WordbookAiController(site.fanwenjia.aisettings.AccountAiClients clients, WordbookAiRateLimiter limiter) {
        this.clients = clients;
        this.limiter = limiter;
    }

    @PostMapping("/lookup")
    public WordbookAiModels.Lookup lookup(@AuthenticationPrincipal CurrentUser user,
            @Valid @RequestBody WordbookAiModels.LookupRequest request) {
        requireUser(user);
        String query;
        try {
            query = WordbookAiText.text(request.query(), 200, false);
        } catch (IllegalArgumentException exception) {
            throw badInput();
        }
        return limited(user.id(), () -> clients.wordbook(user).lookup(query));
    }

    @PostMapping("/sentence")
    public WordbookAiModels.Sentence sentence(@AuthenticationPrincipal CurrentUser user,
            @Valid @RequestBody WordbookAiModels.SentenceRequest request) {
        requireUser(user);
        String term;
        String translation;
        try {
            term = WordbookAiText.term(request.term());
            translation = WordbookAiText.text(request.translationZh(), 500, false);
        } catch (IllegalArgumentException exception) {
            throw badInput();
        }
        return limited(user.id(), () -> clients.wordbook(user).sentence(term, translation));
    }

    private <T> T limited(Long accountId, Supplier<T> operation) {
        limiter.acquire(accountId);
        try {
            return operation.get();
        } finally {
            limiter.release(accountId);
        }
    }

    private void requireUser(CurrentUser user) {
        if (user == null || user.id() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录。");
        }
    }

    private ResponseStatusException badInput() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "请输入有效且长度适当的查询或英文词条。");
    }

    // Handle locally so rejected values and parser exceptions never enter default warning logs.
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<Map<String, String>> invalidRequest() {
        return ResponseEntity.badRequest().body(Map.of("message", "请输入有效且长度适当的查询或英文词条。"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> statusError(ResponseStatusException exception) {
        var response = ResponseEntity.status(exception.getStatusCode());
        if (exception.getStatusCode().value() == 429) response.header("Retry-After", "2");
        return response.body(Map.of("message", exception.getReason() == null ? "请求失败，请稍后重试。" : exception.getReason()));
    }
}
