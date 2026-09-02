package site.fanwenjia.composition;

public record SelectionRequest(
        Integer startOffset,
        Integer endOffset,
        String kind,
        Integer contentVersion
) {
}
