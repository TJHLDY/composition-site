const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const utilitiesPath = path.resolve(__dirname, '..', 'essay-utils.js');

assert.equal(
  fs.existsSync(utilitiesPath),
  true,
  'The standalone preview needs small testable utilities for ordering essays and validating phrase selections.'
);

const utilities = require(utilitiesPath);
const {
  getEnglishPhraseCandidate,
  isEnglishPhraseSelection,
  scheduleHoverExplanation,
  sortEssaysByRecent
} = utilities;

assert.equal(
  typeof getEnglishPhraseCandidate,
  'function',
  'A phrase candidate parser must remove safe terminal punctuation before calculating its source range.'
);
assert.equal('createLearningTextState' in utilities, false, 'Phrase recording must not expose a collocation-switching state machine.');
assert.equal('applyLearningTextSuggestion' in utilities, false, 'Phrase recording must not store AI collocation suggestions.');
assert.equal('applyLearningTextChoice' in utilities, false, 'Phrase recording must not switch between source text and a collocation.');
assert.equal('applyLearningTextEdit' in utilities, false, 'Phrase recording must not use a separate learning-text editor.');

assert.deepEqual(
  sortEssaysByRecent([
    { id: 'older', updatedAt: '2026-08-31T09:00:00.000Z' },
    { id: 'newest', updatedAt: '2026-09-01T10:00:00.000Z' },
    { id: 'middle', updatedAt: '2026-09-01T09:00:00.000Z' }
  ]).map((essay) => essay.id),
  ['newest', 'middle', 'older'],
  'A newly saved essay must appear before older archive entries.'
);

assert.equal(isEnglishPhraseSelection('in the long run'), true, 'An English multiword phrase should expose the phrase action.');
assert.equal(isEnglishPhraseSelection('make a meaningful contribution'), true, 'A longer English phrase should expose the phrase action.');
assert.equal(isEnglishPhraseSelection('in the long run,'), false, 'Trailing punctuation must not create a phrase range the server will reject.');
assert.equal(isEnglishPhraseSelection('technology'), false, 'A single word should keep the click-to-note path instead of the phrase action.');
assert.equal(isEnglishPhraseSelection('技术改变生活'), false, 'Chinese text should not claim to be an English phrase translation.');
assert.equal(isEnglishPhraseSelection('word '.repeat(101)), false, 'An overlong selection should not create an explanation request.');

assert.deepEqual(
  getEnglishPhraseCandidate('  in the long run,  '),
  {
    selectedText: 'in the long run',
    leadingTrimLength: 2,
    trailingTrimLength: 3,
    wordCount: 4
  },
  'A terminal comma and selection whitespace should be removed before the phrase range is saved.'
);
assert.deepEqual(
  getEnglishPhraseCandidate('make progress'),
  {
    selectedText: 'make progress',
    leadingTrimLength: 0,
    trailingTrimLength: 0,
    wordCount: 2
  },
  'A two-word phrase should be recorded through the same path as every valid phrase.'
);
assert.equal(
  'action' in getEnglishPhraseCandidate('make meaningful progress'),
  false,
  'Three English words must not opt into a separate collocation-recognition path.'
);
assert.equal(
  getEnglishPhraseCandidate("reader's well-known habit").wordCount,
  3,
  'Apostrophes and hyphens inside English words should remain valid phrase content without changing behavior.'
);
assert.equal(
  getEnglishPhraseCandidate('make progress; 技术'),
  null,
  'Mixed-language or internal punctuation selections must not become a saveable phrase.'
);

let cachedRuns = 0;
let cachedSchedules = 0;
const cachedTimer = scheduleHoverExplanation({
  cachedExplanation: Promise.resolve({ translationZh: '有意义的' }),
  onRun: () => { cachedRuns += 1; },
  setTimeoutImpl: () => { cachedSchedules += 1; return 42; }
});
assert.equal(cachedTimer, null, 'A cached explanation must not wait behind the hover dwell timer.');
assert.equal(cachedRuns, 1, 'A cached explanation should begin resolving immediately.');
assert.equal(cachedSchedules, 0, 'A cached explanation must not schedule a second network request.');

let coldRuns = 0;
let scheduledDelay = null;
const coldTimer = scheduleHoverExplanation({
  cachedExplanation: null,
  onRun: () => { coldRuns += 1; },
  setTimeoutImpl: (callback, delay) => {
    scheduledDelay = delay;
    return { callback, delay };
  }
});
assert.equal(coldRuns, 0, 'An uncached explanation should still wait briefly to avoid accidental hover requests.');
assert.equal(scheduledDelay, 150, 'The uncached hover dwell should feel responsive without triggering every flyover.');
assert.equal(typeof coldTimer.callback, 'function', 'The hover scheduler must return a cancelable timer handle.');

console.log('Essay utility behavior passed.');
