package site.fanwenjia.translation;

import site.fanwenjia.auth.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/compositions")
public class ExplanationController {

    private final ExplanationService explanationService;
    private final GlossaryStore glossary;
    @org.springframework.web.bind.annotation.GetMapping("/{compositionId}/preload")
    public GlossaryStore.Progress progress(@AuthenticationPrincipal CurrentUser user,@PathVariable Long compositionId,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue="0") long after) {
        return glossary.progress(user,compositionId,after);
    }
    @PostMapping("/{compositionId}/preload/retry")
    public void retry(@AuthenticationPrincipal CurrentUser user,@PathVariable Long compositionId) {glossary.retry(user,compositionId);}
    public record BatchRequest(java.util.List<ExplanationRequest> selections) {}
    @PostMapping("/{compositionId}/explanations/batch")
    public java.util.List<ExplanationView> batch(@AuthenticationPrincipal CurrentUser user,
            @PathVariable Long compositionId,@RequestBody BatchRequest request) {
        return explanationService.batch(user,compositionId,request.selections());
    }

    public ExplanationController(ExplanationService explanationService,GlossaryStore glossary) {
        this.explanationService = explanationService;
        this.glossary = glossary;
    }

    @PostMapping("/{compositionId}/explanations")
    public ExplanationView explain(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable Long compositionId,
            @Valid @RequestBody ExplanationRequest request
    ) {
        return explanationService.explain(currentUser, compositionId, request);
    }
}
