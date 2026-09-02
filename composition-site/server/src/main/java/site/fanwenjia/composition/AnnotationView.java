package site.fanwenjia.composition;

import java.time.Instant;

public record AnnotationView(
        Long id,
        int contentVersion,
        String selectedText,
        int startOffset,
        int endOffset,
        String kind,
        String translationZh,
        String learningText,
        String note,
        Instant createdAt,
        Instant updatedAt
) {
}
