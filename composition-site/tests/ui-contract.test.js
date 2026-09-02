const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const siteRoot = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(siteRoot, name), 'utf8');

assert.equal(
  fs.existsSync(path.join(siteRoot, 'index.html')),
  true,
  'The standalone composition preview must have its own index.html.'
);

assert.equal(
  fs.existsSync(path.join(siteRoot, 'styles.css')),
  true,
  'The composition preview must keep its visual system in an independent stylesheet.'
);

assert.equal(
  fs.existsSync(path.join(siteRoot, 'app.js')),
  true,
  'The composition preview must keep its interactive behavior in an independent script.'
);

assert.equal(
  fs.existsSync(path.join(siteRoot, 'api-client.js')),
  true,
  'The independent site must keep authenticated API access in its own client module.'
);

const html = read('index.html');
const script = read('app.js');
const apiClient = read('api-client.js');
const styles = read('styles.css');

[
  'id="new-essay-button"',
  'id="essay-dialog"',
  'id="essay-title"',
  'id="essay-source-label"',
  'id="essay-content"',
  'id="essay-list"',
  'id="essay-reader"',
  'id="essay-notes"',
  'id="phrase-action"',
  'id="note-dialog"',
  'id="save-note-button"',
  'id="preload-glossary-button"',
  'id="auth-gate"',
  'id="auth-form"',
  'id="remember-me"',
  'id="logout-button"',
  'src="api-client.js"'
].forEach((requiredAnchor) => {
  assert.ok(html.includes(requiredAnchor), `Expected interface anchor: ${requiredAnchor}`);
});

assert.ok(html.includes('role="toolbar"'), 'The phrase ribbon must identify itself as an interactive toolbar, not a live status message.');
assert.ok(html.includes('aria-label="短语摘录操作"'), 'The phrase ribbon needs an accessible purpose label.');
assert.ok(html.includes('id="phrase-action-label" aria-live="polite"'), 'The phrase ribbon must announce a newly recognized selection.');
assert.match(
  html,
  /id="explanation-status"[^>]*data-loading="false"[^>]*role="status"[^>]*aria-live="polite"/,
  'The explanation status must expose its loading state to the interface and assistive technology.'
);
assert.ok(html.includes('>记录短语</button>'), 'Every valid phrase selection must use the simple record-phrase action.');
assert.equal(html.includes('id="note-learning-text"'), false, 'The note dialog must not expose a separate AI learning-text editor.');
assert.equal(html.includes('保存搭配'), false, 'The interface must not expose collocation recognition controls.');
assert.match(
  html,
  /id="explanation-status"[^>]*role="status"[^>]*aria-live="polite"/,
  'The explanation status must announce when an AI suggestion becomes available.'
);

[
  'essay-word',
  'window.getSelection',
  'saveEssay',
  'saveNote',
  'removeEssay',
  'openNoteDialog',
  'CompositionApiClient',
  'loadEssays',
  'requestExplanation',
  'preloadCurrentEssayExplanations',
  'getEnglishPhraseCandidate',
  'getClientRects()',
  'function setExplanationLoading',
  "dom.explainPhraseButton.textContent = '记录短语'",
  "style.removeProperty('top')",
  "style.removeProperty('bottom')",
  "event.key === 'Escape'"
].forEach((requiredBehavior) => {
  assert.ok(script.includes(requiredBehavior), `Expected preview behavior: ${requiredBehavior}`);
});
assert.ok(apiClient.includes('deleteComposition'), 'The browser client must be able to delete a composition.');
assert.ok(script.includes('data-delete-essay'), 'Each composition list item must expose a delete action.');
assert.ok(script.includes('范文及本篇摘录都会一起删除'), 'Deleting a composition must clearly warn that its notes are removed too.');
assert.match(styles, /\.essay-delete-button/, 'The composition delete action needs its own visual treatment.');
assert.equal(script.includes('generateLearningText'), false, 'The browser must never request AI collocation recognition.');
assert.equal(script.includes("pending.kind !== 'phrase'"), false, 'Phrase notes must follow the same save-content guard as all note kinds.');
assert.match(
  script,
  /if \(!translationZh && !note\)/,
  'Saving a note should require at least one of translation or personal note for every kind.'
);
assert.ok(
  script.includes('dom.explanationStatus.dataset.loading = String(Boolean(isLoading));'),
  'The explanation status area must reflect loading state through an explicit data attribute.'
);

assert.match(
  styles,
  /\.explanation-status\[data-loading="true"\]/,
  'The active translation state must be visually distinct from ordinary helper text.'
);
assert.match(
  styles,
  /@keyframes explanation-status-pulse/,
  'The active translation state should use a restrained, noticeable motion cue.'
);

assert.match(
  styles,
  /\.essay-body::selection\s*\{[^}]*background[^}]*color/s,
  'The essay reader must use a 范文夹 selection treatment instead of the default blue highlight.'
);
assert.match(
  styles,
  /@media\s*\(forced-colors:\s*active\)/,
  'Forced-colors mode must retain the operating system selection treatment.'
);

assert.equal(/localStorage/.test(`${html}\n${script}`), false, 'The page markup and app shell must not touch localStorage directly; persistence goes through the API client only.');
assert.equal(/localStorage/.test(apiClient), true, 'The optional remember-me persistence is owned by the API client.');
assert.equal(
  /password/i.test((apiClient.match(/localStorage[\s\S]{0,140}/g) || []).join(' ')),
  false,
  'Passwords must never be written to localStorage; only the revocable session token and email may persist.'
);
assert.ok(apiClient.includes('REMEMBER_MS'), 'The remembered login must have an explicit local validity window.');
assert.ok(script.includes('getRememberedEmail'), 'The login form should prefill the remembered email through the API client.');
assert.ok(/sessionStorage/.test(apiClient), 'The opaque session token should be session-scoped in the API client.');
assert.ok(/fetchImpl\s*\(/.test(apiClient), 'The API client must make same-origin API requests.');
assert.equal(/api[-_]?key|glm|zhipu/i.test(`${html}\n${script}\n${apiClient}`), false, 'The browser source must not contain model-provider credentials or provider calls.');
assert.equal(
  /wordGlossary|phraseGlossary|演示解释/.test(`${html}\n${script}`),
  false,
  'The authenticated site must not present local demo text as a real translation.'
);

console.log('Standalone composition UI contract passed.');
