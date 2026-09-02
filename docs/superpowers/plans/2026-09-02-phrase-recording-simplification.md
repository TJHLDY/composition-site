# Phrase Recording Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove AI collocation recognition while keeping warm native selection, ordinary phrase translation, and source-text phrase notes.

**Architecture:** The browser removes all collocation-only controls and always opens a normal phrase-note dialog. The explanation API retains its legacy opt-in field for wire compatibility but ignores it in `ExplanationService`, so both old and new clients receive ordinary translation. Existing `learning_text` persistence remains read-compatible and is preserved when a newer client updates an old note without that field.

**Tech Stack:** Vanilla HTML/CSS/JavaScript with Node assertions; Spring Boot, JPA, H2/MySQL, JUnit 5, Mockito.

---

## File map

- `composition-site/{index.html,styles.css,app.js,essay-utils.js}` — remove collocation-only visual/state paths while keeping selection, normal phrase save, and an accessible active-translation state.
- `composition-site/tests/{essay-utils.test.js,api-client.test.js,ui-contract.test.js}` — describe the simplified browser contract before implementation.
- `composition-site/server/src/main/java/site/fanwenjia/{translation/ExplanationService.java,composition/CompositionService.java}` — ignore legacy enhanced requests and preserve historic learning text on ordinary saves.
- `composition-site/server/src/test/java/site/fanwenjia/{translation/ExplanationServiceTest.java,composition/CompositionServiceTest.java}` — verify the compatibility behavior.
- `composition-site/README.md` — remove the outdated collocation-recognition promise.

### Task 1: Make the simplified browser contract fail first

- [ ] Add Node assertions that candidates have no collocation action, the HTML lacks learning-text/toggle controls, the script contains `记录短语` and no `generateLearningText`, and phrase save payloads have no `learningText`.
- [ ] Run the three Node tests and verify the affected tests fail because the old collocation UI and request branch still exist.

### Task 2: Make legacy enhanced requests ordinary translations

- [ ] Add an `ExplanationServiceTest` where a three-word phrase request carries `generateLearningText: true` but must call the ordinary provider path and return no suggestion; also assert it shares the ordinary cache entry.
- [ ] Run the targeted Maven test and verify it fails under the old enhanced branch.
- [ ] Remove the `generateLearningText` decision from `ExplanationService` and its cache key, preserving the request field only as ignored compatibility input.
- [ ] Re-run the targeted Maven test until it passes.

### Task 3: Preserve historical learning text while simplifying new saves

- [ ] Add a `CompositionServiceTest` that creates a historical phrase note with `learningText`, then saves a normal update with `learningText: null` and expects the historic value to remain.
- [ ] Run the targeted Maven test and verify it fails because the current update clears the field.
- [ ] Change only the update path to retain the existing value when the request omits it; new notes remain nullable.
- [ ] Re-run the targeted Maven test until it passes.

### Task 4: Remove collocation-only frontend paths

- [ ] Delete learning-text controls and state helpers, make the ribbon wording unconditional, and make phrase explanation requests ordinary.
- [ ] Give `正在按本篇语境生成释义…` an explicit `data-loading` state, a restrained warm visual cue, and a reduced-motion fallback.
- [ ] Keep range cleanup, warm `::selection`, last-line desktop positioning, mobile bottom positioning, and old-note rendering.
- [ ] Run all Node tests and `node --check .\\composition-site\\app.js` until green.

### Task 5: Regression and live acceptance

- [ ] Update README behavior text.
- [ ] Stop the local 8088 server before the full Maven test to release H2, then run `mvn -f .\\composition-site\\server\\pom.xml test` and package it.
- [ ] Restart the independent server using the existing secure environment variables without printing them.
- [ ] In a real browser, verify two and three-plus word selections use the same wording, no collocation controls appear, ordinary translation loads, a new saved note uses the source phrase, and the warm selection remains on desktop and mobile.
