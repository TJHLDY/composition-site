package site.fanwenjia.composition;

public record SelectionContext(
        Long compositionId,
        int contentVersion,
        String kind,
        String selectedText,
        int startOffset,
        int endOffset,
        String sentence
) {
}
