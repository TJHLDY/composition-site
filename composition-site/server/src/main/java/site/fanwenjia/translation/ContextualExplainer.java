package site.fanwenjia.translation;

import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.composition.SelectionContext;

public interface ContextualExplainer {

    boolean isConfigured();
    default boolean isConfigured(CurrentUser user) { return isConfigured(); }
    default java.util.List<ContextualExplanation> explainBatch(java.util.List<SelectionContext> selections, CurrentUser user) {
        throw new TranslationUnavailableException();
    }

    ContextualExplanation explain(
            SelectionContext selection,
            CurrentUser currentUser,
            boolean generateLearningText
    );
}
