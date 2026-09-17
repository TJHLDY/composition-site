(function exposeOnboardingGuide(root, factory) {
  const guide = factory();
  if (typeof module === 'object' && module.exports) module.exports = guide;
  if (root) root.VocabNoteOnboarding = guide;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOnboardingGuideModule() {
  const AUTO_STATUSES = new Set(['not_started', 'in_progress']);

  function identifier(value) {
    return value === undefined || value === null || value === '' ? null : String(value);
  }

  function shouldAutoStart(view) {
    return Boolean(view && view.autoStart === true && AUTO_STATUSES.has(view.coreStatus));
  }

  function createGuideState(view = {}, options = {}) {
    return {
      mode: options.mode === 'manual' ? 'manual' : 'auto',
      step: 'wordbook',
      wordbookId: identifier(view.tutorialWordbookId),
      compositionId: identifier(view.tutorialCompositionId),
      tutorialVersion: Number.isInteger(Number(view.tutorialVersion)) ? Number(view.tutorialVersion) : 1
    };
  }

  function reduceGuide(state, event = {}) {
    const current = state || createGuideState();
    const type = event.type;
    if (type === 'close') return { ...current, step: 'wordbook' };
    if (type === 'skip') return { ...current, step: 'skipped' };

    if (current.step === 'wordbook') {
      if (type === 'resume-saved-wordbook' && current.wordbookId) {
        return { ...current, step: 'composition' };
      }
      if (type === 'wordbook-saved' && !current.wordbookId) {
        const entryId = identifier(event.entryId);
        return entryId ? { ...current, step: 'composition', wordbookId: entryId } : current;
      }
    }

    if (current.step === 'composition') {
      if (type === 'resume-saved-composition' && current.compositionId) {
        return { ...current, step: 'preload' };
      }
      if (type === 'composition-saved' && !current.compositionId) {
        const compositionId = identifier(event.compositionId);
        return compositionId ? { ...current, step: 'preload', compositionId } : current;
      }
    }

    if (current.step === 'preload' && type === 'preload-ready') {
      const compositionId = identifier(event.compositionId);
      if (!compositionId || !current.compositionId || compositionId === current.compositionId) {
        return { ...current, step: 'annotation' };
      }
    }

    if (current.step === 'annotation' && type === 'annotation-saved' && identifier(event.annotationId)) {
      return { ...current, step: 'complete' };
    }
    return current;
  }

  return { createGuideState, reduceGuide, shouldAutoStart };
});
