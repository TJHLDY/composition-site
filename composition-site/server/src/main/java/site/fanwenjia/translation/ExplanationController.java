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

    public ExplanationController(ExplanationService explanationService) {
        this.explanationService = explanationService;
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
