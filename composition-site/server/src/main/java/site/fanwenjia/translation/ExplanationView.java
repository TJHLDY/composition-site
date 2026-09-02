package site.fanwenjia.translation;

public record ExplanationView(
        String selectedText,
        String kind,
        String translationZh,
        String memoryHint,
        String learningText,
        int contentVersion
) {
}
