package site.fanwenjia.translation;

public record ContextualExplanation(String translationZh, String memoryHint, String learningText) {

    public ContextualExplanation(String translationZh, String memoryHint) {
        this(translationZh, memoryHint, null);
    }
}
