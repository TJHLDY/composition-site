(function exposeCompositionPreviewUtilities(root, factory) {
  const utilities = factory();
  if (typeof module === 'object' && module.exports) module.exports = utilities;
  if (root) root.CompositionPreviewUtils = utilities;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCompositionPreviewUtilities() {
  const MAX_PHRASE_LENGTH = 500;
  const HOVER_EXPLANATION_DELAY_MS = 150;

  function updatedTimestamp(essay) {
    const timestamp = Date.parse(essay && essay.updatedAt);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function sortEssaysByRecent(essays) {
    return [...essays]
      .map((essay, index) => ({ essay, index, timestamp: updatedTimestamp(essay) }))
      .sort((left, right) => right.timestamp - left.timestamp || left.index - right.index)
      .map(({ essay }) => essay);
  }

  function isEnglishPhraseSelection(value) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (text.length === 0 || text.length > MAX_PHRASE_LENGTH) return false;
    if (!/^[A-Za-z\s'’\-]+$/.test(text)) return false;
    const words = text.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || [];
    return words.length >= 2;
  }

  function getEnglishPhraseCandidate(value) {
    const raw = String(value || '');
    const leadingTrimLength = (raw.match(/^\s*/) || [''])[0].length;
    const withoutLeadingWhitespace = raw.slice(leadingTrimLength);
    const withoutTrailingWhitespace = withoutLeadingWhitespace.replace(/\s+$/, '');
    const selectedText = withoutTrailingWhitespace
      .replace(/[,.!?;:，。！？；："”')\]]+$/, '')
      .replace(/\s+$/, '');
    if (!isEnglishPhraseSelection(selectedText)) return null;
    const words = selectedText.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || [];
    return {
      selectedText,
      leadingTrimLength,
      trailingTrimLength: raw.length - leadingTrimLength - selectedText.length,
      wordCount: words.length
    };
  }

  function scheduleHoverExplanation({ cachedExplanation, onRun, setTimeoutImpl = globalThis.setTimeout }) {
    if (typeof onRun !== 'function') throw new Error('Hover explanation requires a callback.');
    if (cachedExplanation) {
      onRun();
      return null;
    }
    return setTimeoutImpl(onRun, HOVER_EXPLANATION_DELAY_MS);
  }

  return {
    getEnglishPhraseCandidate,
    isEnglishPhraseSelection,
    scheduleHoverExplanation,
    sortEssaysByRecent
  };
});
