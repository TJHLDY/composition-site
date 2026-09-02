package site.fanwenjia.composition;

import java.time.Instant;

public record CompositionListItem(
        Long id,
        String title,
        String sourceLabel,
        int noteCount,
        Instant updatedAt
) {
}
