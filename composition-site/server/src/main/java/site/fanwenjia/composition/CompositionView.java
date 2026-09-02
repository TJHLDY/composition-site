package site.fanwenjia.composition;

import java.time.Instant;
import java.util.List;

public record CompositionView(
        Long id,
        String title,
        String sourceLabel,
        String content,
        int contentVersion,
        List<AnnotationView> annotations,
        Instant createdAt,
        Instant updatedAt
) {
}
