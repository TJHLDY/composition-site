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

test('an interrupted tutorial can restart from the first step without discarding its saved wordbook entry', () => {
  const resumed = createGuideState({
    coreStatus: 'in_progress',
    autoStart: true,
    tutorialWordbookId: 12,
    tutorialCompositionId: 34
  });

  const restarted = reduceGuide(resumed, { type: 'restart-wordbook' });
  assert.equal(restarted.step, 'wordbook');
  assert.equal(restarted.wordbookId, null);
  assert.equal(restarted.compositionId, null);
  assert.match(read('onboarding.js'), /restart-wordbook/);
  assert.match(read('app.js'), /action === 'restart-wordbook'/);
});

test('restarting forces a fresh dictionary preview instead of skipping a saved term', () => {
  const app = read('app.js');
  const wordbook = read('wordbook.js');

  assert.match(wordbook, /forcePreview/);
  assert.match(app, /wordbook\.beginGuidedSearch\('explore', \{ forcePreview: true \}\)/);
  assert.doesNotMatch(app, /vocabnote:wordbook-existing-entry-opened/);
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
  const spotlight = app.indexOf("onboarding.showInstruction({ ...aiGuideInstruction(), cardPlacement: 'above' }, '#ai-key');", opening);
  const awaited = app.indexOf('const opened = await opening;', opening);

  assert.ok(opening >= 0);
  assert.ok(spotlight > opening && spotlight < awaited);
});

test('the guide rail reserves the top safe area so targets stay clear on mobile', () => {
  const guide = read('onboarding.js');
  const styles = read('onboarding.css');

  assert.match(guide, /function ensureTargetVisible\(\)/);
  assert.match(guide, /guidebar\.getBoundingClientRect\(\)/);
  assert.match(styles, /top: var\(--onboarding-guidebar-top/);
});

test('the guided composition step emphasizes saving while leaving its sample form editable', () => {
  const app = read('app.js');
  const start = app.indexOf('function openEssayDialog()');
  const end = app.indexOf('function openEditEssayDialog()', start);
  const openEssayDialog = app.slice(start, end);

  assert.match(openEssayDialog, /const submitButton = dom\.essayForm\.querySelector\('button\[type="submit"\]'\);/);
  assert.match(openEssayDialog, /cue: '确认后点击保存范文'/);
  assert.match(openEssayDialog, /\}, submitButton, \{\s*interactiveTargets: \[dom\.essayForm\]\s*\}\);/s);
  assert.doesNotMatch(openEssayDialog, /\}, dom\.essayTitle\);/);
});

test('the meaning tutorial highlights an entire part-of-speech group instead of one checkbox', () => {
  const app = read('app.js');

  assert.match(app, /#wb-editor \.wb-meaning-picker fieldset/);
  assert.doesNotMatch(app, /const target = document\.querySelector\('#wb-editor \[data-meaning-choice\]'\)/);
});

test('selecting a meaning hands the tutorial save button to the guided scroll', () => {
  const app = read('app.js');
  const eventStart = app.indexOf("document.addEventListener('vocabnote:wordbook-meaning-selected'");
  const eventEnd = app.indexOf("document.addEventListener('vocabnote:wordbook-editor-closed'", eventStart);
  const handler = app.slice(eventStart, eventEnd);

  assert.match(handler, /guideWordbookSaveButton\(saveButton\)/);
  assert.match(handler, /onboarding\.showInstruction\(/);
});

test('the save cue keeps every dictionary meaning selectable until the entry is collected', () => {
  const app = read('app.js');
  const guide = read('onboarding.js');
  const eventStart = app.indexOf("document.addEventListener('vocabnote:wordbook-meaning-selected'");
  const eventEnd = app.indexOf("document.addEventListener('vocabnote:wordbook-editor-closed'", eventStart);
  const handler = app.slice(eventStart, eventEnd);

  assert.match(handler, /interactiveTargets/);
  assert.match(handler, /#wb-editor \.wb-meaning-picker/);
  assert.match(handler, /#wb-save/);
  assert.match(guide, /interactiveTargets/);
  assert.match(guide, /allowedTargets/);
});

test('the wordbook save cue scrolls slowly and shows a downward hint only when the button is below the dialog', () => {
  const app = read('app.js');
  const guide = read('onboarding.js');

  assert.match(app, /function guideWordbookSaveButton\(saveButton\)/);
  assert.match(app, /const duration = 900;/);
  assert.match(app, /onboarding\.setScrollHint\(buttonRect\.top > dialogRect\.bottom - 12\)/);
  assert.match(guide, /function setScrollHint\(visible/);
});

test('the first-step spotlight exposes a clear target hole and emphasizes it without background blur', () => {
  const guide = read('onboarding.js');
  const styles = read('onboarding.css');

  assert.match(guide, /data-onboarding-scrim="top"/);
  assert.match(guide, /function positionScrimPanels\(rect\)/);
  assert.match(styles, /\.onboarding-scrim\[data-onboarding-scrim\]/);
  assert.doesNotMatch(styles, /backdrop-filter/);
  assert.match(styles, /animation: onboarding-target-pulse/);
  assert.match(styles, /@keyframes onboarding-target-pulse/);
  assert.doesNotMatch(guide, /scrim\.hidden/);
});

test('tutorial guidance stays in the fixed rail while target cues follow the active control', () => {
  const app = read('app.js');
  const guide = read('onboarding.js');
  const styles = read('onboarding.css');

  assert.match(guide, /function positionTargetNote\(rect\)/);
  assert.match(guide, /targetNote\.hidden = false/);
  assert.match(styles, /\.onboarding-guide-details/);
  assert.match(styles, /data-guidebar-expanded="true"/);
  assert.match(app, /cue: '可多选，选完再收录'/);
});

test('the redesigned guide uses a non-blocking top rail and a small target cue without dimming the page', () => {
  const app = read('app.js');
  const guide = read('onboarding.js');
  const styles = read('onboarding.css');

  assert.match(guide, /onboarding-guidebar/);
  assert.match(guide, /onboarding-target-note/);
  assert.match(guide, /function ensureTargetVisible\(\)/);
  assert.match(guide, /toggle-details/);
  assert.match(styles, /\.onboarding-guidebar/);
  assert.match(styles, /\.onboarding-target-note/);
  assert.match(styles, /\.onboarding-scrim\s*\{[^}]*display:\s*none/s);
  assert.match(app, /cue: '可多选，选完再收录'/);
});

test('a target in the fixed page header moves the guide rail below that header instead of covering it', () => {
  const guide = read('onboarding.js');
  const styles = read('onboarding.css');

  assert.match(guide, /function positionGuidebarForTarget\(rect\)/);
  assert.match(guide, /guidebarPlacement = 'below-target'/);
  assert.match(guide, /--onboarding-guidebar-top/);
  assert.match(styles, /top: var\(--onboarding-guidebar-top/);
  assert.match(styles, /width: min\(680px, calc\(100vw - 24px\)\)/);
});

test('a fixed-header target suppresses its nearby cue because the guide rail already explains the action', () => {
  const guide = read('onboarding.js');
  const start = guide.indexOf('function positionTargetNote(rect)');
  const end = guide.indexOf('function ensureTargetVisible()', start);
  const positionTargetNote = guide.slice(start, end);

  assert.match(
    positionTargetNote,
    /if \(layer\.dataset\.guidebarPlacement === 'below-target'\) \{\s*targetNote\.hidden = true;\s*return;\s*\}/s
  );
});
