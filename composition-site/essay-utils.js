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

  function createExplanationQueue({ pause = ms => new Promise(resolve => setTimeout(resolve, ms)), cooldown = 2100 } = {}) {
    const waiting = [];
    let running = false;
    async function drain() {
      if (running) return;
      running = true;
      try {
        while (waiting.length) {
          waiting.sort((a,b) => Number(a.background) - Number(b.background));
          const job = waiting.shift();
          if (!job.isCurrent()) {
            const error = new Error('请求已取消'); error.name = 'AbortError'; job.reject(error); continue;
          }
          try { job.resolve(await job.run()); } catch (error) { job.reject(error); }
          // Cool down even when the queue is empty: newly added work must also wait.
          await pause(cooldown);
        }
      } finally { running = false; }
    }
    return (run, { background = false, isCurrent = () => true } = {}) => new Promise((resolve,reject) => {
      waiting.push({run,background,isCurrent,resolve,reject}); void drain();
    });
  }

  function preloadStatusText({ status, done, total, message }) {
    if (status === 'complete') return total ? `释义已就绪 · ${done} / ${total} · 悬停单词即可查看` : '本篇没有需要预加载的英文单词';
    if (status === 'paused') return `预加载已暂停 · ${done} / ${total}。${message || '已完成的释义已保存，可重试未完成部分。'}`;
    if (status === 'retrying') return `正在等待自动重试 · ${done} / ${total}。${message || '已完成的释义已保存。'}`;
    return `正在预加载语境释义 · ${done} / ${total} · 可先阅读，完成后自动保存`;
  }

  return {
    preloadStatusText,
    createExplanationQueue,
    getEnglishPhraseCandidate,
    isEnglishPhraseSelection,
    scheduleHoverExplanation,
    sortEssaysByRecent
  };
});
