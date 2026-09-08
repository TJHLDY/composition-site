package site.fanwenjia.wordbook;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import site.fanwenjia.auth.CurrentUser;
import static site.fanwenjia.wordbook.WordbookViews.*;

@RestController
@RequestMapping("/api/wordbook")
public class WordbookController {
    private final WordbookService service;
    public WordbookController(WordbookService service) { this.service = service; }
    @GetMapping public Page list(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) String kind,
            @RequestParam(required=false) String q, @RequestParam(required=false) String exact,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="60") int size) { return service.list(user, kind, q, exact, page, size); }
    @GetMapping("/{id}") public Detail read(@AuthenticationPrincipal CurrentUser user, @PathVariable Long id) { return service.read(user, id); }
    @PostMapping public Detail save(@AuthenticationPrincipal CurrentUser user, @RequestBody Save request) { return service.save(user, request); }
    @PutMapping("/{id}") public Detail update(@AuthenticationPrincipal CurrentUser user, @PathVariable Long id, @RequestBody Save request) { return service.update(user, id, request); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal CurrentUser user, @PathVariable Long id) { service.delete(user, id); }
    @PostMapping("/{id}/examples") public Example saveExample(@AuthenticationPrincipal CurrentUser user, @PathVariable Long id, @RequestBody SaveExample request) { return service.saveExample(user, id, request); }
    @DeleteMapping("/{id}/examples/{exampleId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteExample(@AuthenticationPrincipal CurrentUser user, @PathVariable Long id, @PathVariable Long exampleId) { service.deleteExample(user, id, exampleId); }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", error.getReason() == null ? "请求未完成" : error.getReason()));
    }
}
