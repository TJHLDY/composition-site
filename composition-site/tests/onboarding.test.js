const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createGuideState,
  reduceGuide,
  shouldAutoStart
} = require('../onboarding.js');

const siteRoot = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(siteRoot, name), 'utf8');

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

test('the guide is driven by completed learning actions, not by timers or a meaning checkbox alone', () => {
  const app = read('app.js');
  const wordbook = read('wordbook.js');
  const aiSettings = read('ai-settings.js');

  assert.match(wordbook, /vocabnote:wordbook-saved/);
  assert.match(wordbook, /vocabnote:wordbook-meaning-selected/);
  assert.match(app, /vocabnote:composition-saved/);
  assert.match(app, /vocabnote:preload-ready/);
  assert.match(app, /vocabnote:annotation-saved/);
  assert.match(app, /vocabnote:ai-required/);
  assert.match(aiSettings, /vocabnote:ai-test-passed/);
  assert.match(app, /preloadNeedsAiSetup/);
  assert.match(app, /showCompletionTip/);
  assert.match(wordbook, /explore/);
  assert.match(read('onboarding.js'), /长按或拖动连续文字/);
});

test('AI setup requires a verified test during the tutorial and claims its automatic hint only once', () => {
  const app = read('app.js');
  const aiSettings = read('ai-settings.js');

  assert.match(aiSettings, /tutorial && !passedTest/);
  assert.match(aiSettings, /onSaved/);
  assert.match(app, /claimAiGuide/);
  assert.match(app, /if\s*\(claim\.show\)/);
  assert.match(app, /openAiSettings/);
  assert.match(app, /mode === 'auto'/);
});

test('the mobile annotation step retargets the compact word card before opening the note form', () => {
  const app = read('app.js');

  assert.match(app, /vocabnote:mobile-word-action-opened/);
  assert.match(app, /target:\s*dom\.mobileWordRecord/);
  assert.match(app, /function closeMobileWordAction/);
});

test('replays retain saved tutorial resources and recover an interrupted progress sync on the page', () => {
  const app = read('app.js');
  const guide = read('onboarding.js');

  assert.doesNotMatch(app, /resetResources:\s*mode === 'manual'/);
  assert.match(app, /function showCoreProgressRecovery/);
  assert.match(app, /retry-core-progress/);
  assert.match(app, /onboarding\.detach\(\)/);
  assert.match(guide, /function detach\(\)/);
  assert.match(guide, /\n\s*detach,\n/);
});

test('AI settings enter the onboarding spotlight before their configuration request can fail', () => {
  const app = read('app.js');
  const opening = app.indexOf('const opening = aiSettings.open(');
  const spotlight = app.indexOf("onboarding.showInstruction(aiGuideInstruction(), '#ai-settings-form');", opening);
  const awaited = app.indexOf('const opened = await opening;', opening);

  assert.ok(opening >= 0);
  assert.ok(spotlight > opening && spotlight < awaited);
});

test('the spotlight card moves above controls placed in the mobile footer', () => {
  const guide = read('onboarding.js');
  const styles = read('onboarding.css');

  assert.match(guide, /data-card-position/);
  assert.match(guide, /--onboarding-card-bottom/);
  assert.match(styles, /data-card-position="above-target"/);
});
