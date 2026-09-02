package site.fanwenjia.composition;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SaveAnnotationRequest(
        @NotNull @Min(0) Integer startOffset,
        @NotNull @Min(1) Integer endOffset,
        @NotBlank @Size(max = 20) String kind,
        @Size(max = 1000) String translationZh,
        @Size(max = 500) String learningText,
        @Size(max = 2000) String note,
        @NotNull @Min(1) Integer contentVersion
) {

    public SaveAnnotationRequest(
            Integer startOffset,
            Integer endOffset,
            String kind,
            String translationZh,
            String note,
            Integer contentVersion
    ) {
        this(startOffset, endOffset, kind, translationZh, null, note, contentVersion);
    }
}
