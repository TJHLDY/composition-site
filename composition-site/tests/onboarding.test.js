const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createGuideState,
  reduceGuide,
  shouldAutoStart
} = require('../onboarding.js');

test('only unfinished new-account state starts the automatic guide', () => {
  assert.equal(shouldAutoStart({ coreStatus: 'not_started', autoStart: true }), true);
  assert.equal(shouldAutoStart({ coreStatus: 'in_progress', autoStart: true }), true);
  assert.equal(shouldAutoStart({ coreStatus: 'completed', autoStart: false }), false);
  assert.equal(shouldAutoStart({ coreStatus: 'skipped', autoStart: false }), false);
  assert.equal(shouldAutoStart({ coreStatus: 'completed', autoStart: true }), false);
});

test('real learning events advance the guide and closing restarts its visible first step', () => {
  let state = createGuideState({
    tutorialVersion: 1,
    coreStatus: 'not_started',
    autoStart: true,
    aiGuideSeen: false,
    tutorialWordbookId: null,
    tutorialCompositionId: null
  });
  assert.equal(state.step, 'wordbook');
  assert.equal(state.mode, 'auto');

  state = reduceGuide(state, { type: 'meaning-selected' });
  assert.equal(state.step, 'wordbook', 'Selecting a meaning alone cannot complete collection.');
  state = reduceGuide(state, { type: 'wordbook-saved', entryId: 12 });
  assert.deepEqual(state, {
    mode: 'auto',
    step: 'composition',
    wordbookId: '12',
    compositionId: null,
    tutorialVersion: 1
  });
  state = reduceGuide(state, { type: 'composition-saved', compositionId: 34 });
  assert.equal(state.step, 'preload');
  assert.equal(state.compositionId, '34');
  state = reduceGuide(state, { type: 'preload-ready', compositionId: 34 });
  assert.equal(state.step, 'annotation');
  state = reduceGuide(state, { type: 'annotation-saved', annotationId: 56 });
  assert.equal(state.step, 'complete');

  const restarted = reduceGuide(state, { type: 'close' });
  assert.equal(restarted.step, 'wordbook');
  assert.equal(restarted.wordbookId, '12');
  assert.equal(restarted.compositionId, '34');
});

test('a restarted guide reuses its saved resources without creating replacements', () => {
  const resumed = createGuideState({
    tutorialVersion: 1,
    coreStatus: 'in_progress',
    autoStart: true,
    tutorialWordbookId: 12,
    tutorialCompositionId: 34
  });
  assert.equal(resumed.step, 'wordbook');
  assert.equal(resumed.wordbookId, '12');
  assert.equal(resumed.compositionId, '34');

  const afterWordbook = reduceGuide(resumed, { type: 'resume-saved-wordbook' });
  assert.equal(afterWordbook.step, 'composition');
  const afterComposition = reduceGuide(afterWordbook, { type: 'resume-saved-composition' });
  assert.equal(afterComposition.step, 'preload');
  assert.equal(reduceGuide(afterComposition, { type: 'wordbook-saved', entryId: 99 }).wordbookId, '12');
});

test('skip is terminal in automatic mode while manual replay stays local', () => {
  const automatic = createGuideState({ coreStatus: 'in_progress', autoStart: true });
  assert.equal(reduceGuide(automatic, { type: 'skip' }).step, 'skipped');

  const manual = createGuideState({ coreStatus: 'completed', autoStart: false }, { mode: 'manual' });
  assert.equal(manual.mode, 'manual');
  assert.equal(reduceGuide(manual, { type: 'skip' }).step, 'skipped');
});
