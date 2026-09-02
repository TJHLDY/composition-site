package site.fanwenjia.translation;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ExplanationRequest(
        @NotNull @Min(0) Integer startOffset,
        @NotNull @Min(1) Integer endOffset,
        @NotBlank @Size(max = 20) String kind,
        @NotNull @Min(1) Integer contentVersion,
        Boolean generateLearningText
) {

    public ExplanationRequest(
            Integer startOffset,
            Integer endOffset,
            String kind,
            Integer contentVersion
    ) {
        this(startOffset, endOffset, kind, contentVersion, false);
    }
}
