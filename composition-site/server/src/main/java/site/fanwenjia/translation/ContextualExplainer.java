package site.fanwenjia.translation;

import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.composition.SelectionContext;

public interface ContextualExplainer {

    boolean isConfigured();
    default boolean isConfigured(CurrentUser user) { return isConfigured(); }

    ContextualExplanation explain(
            SelectionContext selection,
            CurrentUser currentUser,
            boolean generateLearningText
    );
}
