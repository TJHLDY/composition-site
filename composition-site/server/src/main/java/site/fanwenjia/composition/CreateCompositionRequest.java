package site.fanwenjia.composition;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateCompositionRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 100) String sourceLabel,
        @NotBlank @Size(max = 100_000) String content
) {
}
