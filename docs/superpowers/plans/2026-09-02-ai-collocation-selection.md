# AI Collocation Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reader select an English phrase, preserve native selection with a 范文夹 visual treatment, explicitly ask GLM to suggest a memorable collocation for selections of three or more words, and choose whether the saved note uses the original text or that suggestion.

**Architecture:** Keep the existing server-derived-offset trust boundary. The existing explanation endpoint gains an opt-in `generateLearningText` flag and an optional `learningText` response field; a single GLM response returns translation, memory hint, and the suggestion. A nullable `learning_text` annotation column stores the reader's final editable choice while the original selection and offsets remain unchanged for context and navigation.

**Tech Stack:** Vanilla HTML/CSS/JavaScript with Node built-in assertions; Spring Boot 3.5, JPA/H2/MySQL, JUnit 5, AssertJ, Mockito.

---

## File map

- `composition-site/essay-utils.js` — pure parsing for safe phrase candidates and pure original/collocation input state.
- `composition-site/tests/essay-utils.test.js` — deterministic tests for phrase cleanup, word-count routing, and input-state switching.
- `composition-site/index.html` — accessible phrase ribbon and note-dialog controls.
- `composition-site/styles.css` — paper-ribbon styling, essay-only custom text selection, forced-colors fallback, and note-source line.
- `composition-site/app.js` — DOM integration, offset-safe candidate selection, explanation-cache capability split, and annotation rendering/save payload.
- `composition-site/tests/api-client.test.js` — same-origin enhanced explanation and annotation payload contract.
- `composition-site/tests/ui-contract.test.js` — static public UI, accessibility, and stylesheet contract.
- `composition-site/server/src/main/java/site/fanwenjia/translation/{ExplanationRequest,ContextualExplanation,ContextualExplainer,ExplanationService,ExplanationView,ZhipuContextualExplainer}.java` — opt-in GLM learning-text contract and cache scope.
- `composition-site/server/src/main/java/site/fanwenjia/composition/{CompositionAnnotation,SaveAnnotationRequest,AnnotationView,CompositionService}.java` — editable saved learning text.
- `composition-site/server/src/test/java/site/fanwenjia/{CompositionApiTest.java,composition/CompositionServiceTest.java,translation/ExplanationServiceTest.java}` — persistent/API/AI boundary behavior.

## Task 1: Make phrase candidates and switching state testable

**Files:**
- Modify: `composition-site/tests/essay-utils.test.js`
- Modify: `composition-site/essay-utils.js`

- [ ] **Step 1: Write the failing candidate and state tests**

Add tests that express the intended pure API before adding it:

```js
const {
  getEnglishPhraseCandidate,
  createLearningTextState,
  applyLearningTextSuggestion,
  applyLearningTextChoice,
  applyLearningTextEdit
} = require(utilitiesPath);

assert.deepEqual(getEnglishPhraseCandidate('  in the long run,  '), {
  selectedText: 'in the long run',
  leadingTrimLength: 2,
  trailingTrimLength: 3,
  wordCount: 4,
  action: 'collocation'
});
assert.equal(getEnglishPhraseCandidate('make progress').action, 'basic');
assert.equal(getEnglishPhraseCandidate('make meaningful progress').action, 'collocation');
assert.equal(getEnglishPhraseCandidate('make progress; 技术'), null);

let state = createLearningTextState({ sourceText: 'combining theory with practice' });
assert.deepEqual(state, { sourceText: 'combining theory with practice', value: 'combining theory with practice', mode: 'source', suggestedText: null });
state = applyLearningTextSuggestion(state, 'combining … with');
state = applyLearningTextChoice(state, 'collocation');
assert.equal(state.value, 'combining … with');
state = applyLearningTextChoice(state, 'source');
assert.equal(state.value, 'combining theory with practice');
assert.equal(applyLearningTextEdit(state, 'my own phrase').mode, 'custom');
```

- [ ] **Step 2: Run the Node test and verify RED**

Run: `node .\composition-site\tests\essay-utils.test.js`

Expected: failure because the newly required utility exports do not exist.

- [ ] **Step 3: Implement the smallest pure helpers**

In `essay-utils.js`, preserve exact internal whitespace for source offsets while trimming only leading whitespace and final sentence punctuation. Use this shape:

```js
function getEnglishPhraseCandidate(value) {
  const raw = String(value || '');
  const leading = (raw.match(/^\s*/) || [''])[0].length;
  const withoutLeading = raw.slice(leading);
  const withoutTrailingWhitespace = withoutLeading.replace(/\s+$/, '');
  const normalized = withoutTrailingWhitespace.replace(/[,.!?;:，。！？；："”')\]]+$/, '').replace(/\s+$/, '');
  const selectedText = normalized;
  if (!isEnglishPhraseSelection(selectedText)) return null;
  const words = selectedText.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || [];
  return {
    selectedText,
    leadingTrimLength: leading,
    trailingTrimLength: raw.length - leading - selectedText.length,
    wordCount: words.length,
    action: words.length >= 3 ? 'collocation' : 'basic'
  };
}
```

Add small immutable state helpers. `applyLearningTextChoice(..., 'collocation')` must leave state unchanged when no distinct suggestion exists; `applyLearningTextEdit` must mark `mode: 'custom'`.

- [ ] **Step 4: Run the Node test and verify GREEN**

Run: `node .\composition-site\tests\essay-utils.test.js`

Expected: `Essay utility behavior passed.`

- [ ] **Step 5: Check scope**

Run: `git -C . status --short`

Expected: this workspace root is not a Git repository; do not create or touch the legacy child repositories. Record the changed independent-site files in the final handoff instead of committing.

## Task 2: Add server-side learning-text contract and persistence

**Files:**
- Modify: `composition-site/server/src/test/java/site/fanwenjia/CompositionApiTest.java`
- Modify: `composition-site/server/src/test/java/site/fanwenjia/composition/CompositionServiceTest.java`
- Modify: `composition-site/server/src/test/java/site/fanwenjia/translation/ExplanationServiceTest.java`
- Modify: `composition-site/server/src/main/java/site/fanwenjia/translation/{ExplanationRequest,ContextualExplanation,ContextualExplainer,ExplanationService,ExplanationView,ZhipuContextualExplainer}.java`
- Modify: `composition-site/server/src/main/java/site/fanwenjia/composition/{CompositionAnnotation,SaveAnnotationRequest,AnnotationView,CompositionService}.java`

- [ ] **Step 1: Write failing HTTP and service tests**

First add an authenticated phrase annotation request that sends only trusted offsets plus editable `learningText`, then assert the response and later detail endpoint preserve it:

```java
.content(objectMapper.writeValueAsString(Map.of(
    "startOffset", 0,
    "endOffset", 36,
    "kind", "phrase",
    "translationZh", "把实践经验与学术学习结合",
    "learningText", "combining … with",
    "note", "A 与 B 结合",
    "contentVersion", 1
)))
.andExpect(status().isCreated())
.andExpect(jsonPath("$.selectedText").value("Combining practical experience with"))
.andExpect(jsonPath("$.learningText").value("combining … with"));
```

Add a repeat-save service test that supplies a different `learningText` for the same range and asserts that the id remains identical but `learningText` changes. Add an explanation service/API contract test for `generateLearningText: true` and an AI result of `combining … with`, plus an invalid/missing suggestion test that still returns a successful translation and falls back to the exact selected text.

- [ ] **Step 2: Run focused Maven tests and verify RED**

Run: `mvn -f .\composition-site\server\pom.xml -Dtest=CompositionApiTest,CompositionServiceTest,ExplanationServiceTest test`

Expected: response JSON lacks `learningText` and enhanced explanation lacks the new contract; no production source is changed yet.

- [ ] **Step 3: Implement the minimal server contract**

Make `generateLearningText` nullable/optional in `ExplanationRequest`, normalize it to a boolean in `ExplanationService`, and add it to the cache key:

```java
private record CacheKey(
        Long compositionId,
        int contentVersion,
        int startOffset,
        int endOffset,
        boolean generateLearningText
) {}
```

Extend `ContextualExplainer.explain` with the boolean flag. For enhanced phrase calls, request exactly one JSON object with `translationZh`, optional `memoryHint`, and `learningText`; basic calls retain only the ordinary explanation fields. In `ExplanationService`, accept learning text only if the selection is a phrase with at least three English words, normalize whitespace and `...` to `…`, require its fixed English words to occur in the server-derived source selection, cap it at 500 characters, and otherwise use `selection.selectedText()` as the safe fallback. A bad suggestion must never turn a successful translation into 503.

Add `learningText` to annotation entity/request/view and pass it through both the insert and upsert paths:

```java
String learningText = optionalText(request.learningText(), 500, "学习内容格式不正确");
existing.update(selection.kind(), translationZh, learningText, note);
```

Keep `selectedText`, range, version, ownership checks, and the unique range constraint unchanged. Do not call GLM inside `saveAnnotation`.

- [ ] **Step 4: Run focused Maven tests and verify GREEN**

Run: `mvn -f .\composition-site\server\pom.xml -Dtest=CompositionApiTest,CompositionServiceTest,ExplanationServiceTest test`

Expected: all targeted tests pass; the mock provider is called once per distinct cache capability, and a same-range save updates instead of inserts.

- [ ] **Step 5: Compile the packaged static site**

Run: `mvn -f .\composition-site\server\pom.xml package -DskipTests`

Expected: `BUILD SUCCESS` and the current frontend files are copied into the Spring Boot static resources.

## Task 3: Wire the ribbon, selectable appearance, and note-dialog choice

**Files:**
- Modify: `composition-site/tests/api-client.test.js`
- Modify: `composition-site/tests/ui-contract.test.js`
- Modify: `composition-site/index.html`
- Modify: `composition-site/styles.css`
- Modify: `composition-site/app.js`

- [ ] **Step 1: Write failing frontend contract tests**

Add explicit anchors and source contract checks:

```js
[
  'id="note-learning-text"',
  'id="use-source-text-button"',
  'id="use-learning-text-button"',
  'role="toolbar"',
  'aria-label="短语摘录操作"'
].forEach((anchor) => assert.ok(html.includes(anchor), `Expected interface anchor: ${anchor}`));

assert.match(styles, /\.essay-body::selection\s*\{[^}]*background[^}]*color/s);
assert.match(styles, /@media\s*\(forced-colors:\s*active\)/);
assert.match(script, /getClientRects\(\)/);
assert.match(script, /generateLearningText/);
assert.match(script, /learningText/);
```

Add API-client test assertions that a three-word phrase explanation payload contains `generateLearningText: true`, basic word payload omits it, and a saved annotation carries `learningText` but never `selectedText`.

- [ ] **Step 2: Run Node contracts and verify RED**

Run:

```powershell
node .\composition-site\tests\api-client.test.js
node .\composition-site\tests\ui-contract.test.js
```

Expected: failing assertions for missing controls, selection style, final-line positioning, and enhanced payload behavior.

- [ ] **Step 3: Implement the smallest DOM and CSS changes**

Change the phrase action from status to a labelled toolbar. Add the original/collocation buttons and input without making either a submit button:

```html
<div class="learning-choice" role="group" aria-label="保存的学习内容">
  <button id="use-source-text-button" type="button" aria-pressed="true">保存原文</button>
  <button id="use-learning-text-button" type="button" aria-pressed="false" disabled>保存搭配</button>
</div>
<label class="field-label" for="note-learning-text">学习内容</label>
<input id="note-learning-text" name="learningText" maxlength="500" />
```

Style only the reader text selection, and let forced-colors keep the platform treatment:

```css
.essay-body::selection { color: #15392d; background: rgba(216,171,80,.58); }
.essay-body::-moz-selection { color: #15392d; background: rgba(216,171,80,.58); }
@media (forced-colors: active) {
  .essay-body::selection, .essay-body::-moz-selection { color: revert; background: revert; }
}
```

In `app.js`, use `getEnglishPhraseCandidate` inside `selectionOffsets` so its adjusted offsets match the punctuation-trimmed substring. Keep the default UI state at source text. Route only `candidate.action === 'collocation'` to `requestExplanation(..., { generateLearningText: true })`; include the flag in the cache key. When the AI result arrives, store/enable its suggestion but do not change the current source input. Button clicks intentionally swap the value; manual input changes mode to custom. Render `annotation.learningText || annotation.selectedText` as the short note title, adding `原文：…` only when the values differ. Position desktop ribbon from the last `range.getClientRects()` rectangle; on mobile retain the stable bottom bar. Add Escape handling that hides the ribbon but leaves the native selection intact.

- [ ] **Step 4: Run all Node frontend tests and verify GREEN**

Run:

```powershell
node .\composition-site\tests\essay-utils.test.js
node .\composition-site\tests\api-client.test.js
node .\composition-site\tests\ui-contract.test.js
```

Expected: all three scripts print their existing success messages with no provider credential in browser source.

- [ ] **Step 5: Package after static assets change**

Run: `mvn -f .\composition-site\server\pom.xml package -DskipTests`

Expected: `BUILD SUCCESS`.

## Task 4: Regression and browser acceptance

**Files:**
- Modify: `composition-site/README.md` only if behavior or verification instructions materially diverge from its current claims.

- [ ] **Step 1: Run full automated regression**

Before Maven's full suite, stop any local process listening on 8088 so it cannot lock the file-backed local H2 database. Then run:

```powershell
mvn -f .\composition-site\server\pom.xml test
node .\composition-site\tests\essay-utils.test.js
node .\composition-site\tests\api-client.test.js
node .\composition-site\tests\ui-contract.test.js
```

Expected: all Java and Node tests pass. Treat the known global Maven mirror warning separately from project test status.

- [ ] **Step 2: Start the independent server without exposing the key**

Run in a new PowerShell process:

```powershell
$env:ZHIPU_API_KEY = [Environment]::GetEnvironmentVariable('ZHIPU_API_KEY', 'User')
$env:ZHIPU_BASE_URL = [Environment]::GetEnvironmentVariable('ZHIPU_BASE_URL', 'User')
if ([string]::IsNullOrWhiteSpace($env:ZHIPU_API_KEY) -or [string]::IsNullOrWhiteSpace($env:ZHIPU_BASE_URL)) { throw 'Translation environment is incomplete.' }
mvn -f .\composition-site\server\pom.xml spring-boot:run
```

Never print either environment value.

- [ ] **Step 3: Browser acceptance at `http://localhost:8088/`**

Verify each actual interaction using a fresh test account and one essay containing `Combining practical experience with academic study helps students.`:

1. A native desktop selection is warm gold, not default blue, and Ctrl/Cmd+C still copies it.
2. Two selected words show the basic ribbon; three or more show “识别搭配并记下”.
3. Multi-line selection places the desktop ribbon by its last rendered line; Escape hides the ribbon.
4. Opening a 3+ word phrase starts on “保存原文”; when GLM returns, “保存搭配” enables without overwriting the input.
5. Switching twice restores source then suggestion; manual typing makes a custom saved value.
6. Saved note shows the chosen learning content plus source auxiliary line when different, and its locate action still focuses the original text.
7. With an unavailable translation request, original/manual content and note still save.

- [ ] **Step 4: Audit scope and secrets**

Run:

```powershell
rg -n -i --glob '!server/target/**' --glob '!server/data/**' 'api[_-]?key|zhipu.*(key|secret)' .\composition-site
rg -n 'TODO|TBD|FIXME' .\composition-site
```

Expected: no literal credentials, and no new unfinished markers in edited source. Inspect any hits before reporting.

- [ ] **Step 5: Prepare handoff facts**

List exact changed files, checks run and outcomes, browser evidence, known limitations (model latency/availability), and a compact Obsidian-ready update. Do not claim deployment or database migration completion unless those actions were actually performed.
