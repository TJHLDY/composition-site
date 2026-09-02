package site.fanwenjia.composition;

import site.fanwenjia.auth.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/compositions")
public class CompositionController {

    private final CompositionService compositionService;

    public CompositionController(CompositionService compositionService) {
        this.compositionService = compositionService;
    }

    @GetMapping
    public List<CompositionListItem> list(@AuthenticationPrincipal CurrentUser currentUser) {
        return compositionService.list(currentUser);
    }

    @PostMapping
    public ResponseEntity<CompositionView> create(
            @AuthenticationPrincipal CurrentUser currentUser,
            @Valid @RequestBody CreateCompositionRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(compositionService.create(currentUser, request));
    }

    @GetMapping("/{compositionId}")
    public CompositionView read(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable Long compositionId
    ) {
        return compositionService.read(currentUser, compositionId);
    }

    @PostMapping("/{compositionId}/annotations")
    public ResponseEntity<AnnotationView> saveAnnotation(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable Long compositionId,
            @Valid @RequestBody SaveAnnotationRequest request
    ) {
        AnnotationSaveResult result = compositionService.saveAnnotation(currentUser, compositionId, request);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.annotation());
    }

    @DeleteMapping("/{compositionId}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable Long compositionId
    ) {
        compositionService.deleteComposition(currentUser, compositionId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{compositionId}/annotations/{annotationId}")
    public ResponseEntity<Void> deleteAnnotation(
            @AuthenticationPrincipal CurrentUser currentUser,
            @PathVariable Long compositionId,
            @PathVariable Long annotationId
    ) {
        compositionService.deleteAnnotation(currentUser, compositionId, annotationId);
        return ResponseEntity.noContent().build();
    }
}
