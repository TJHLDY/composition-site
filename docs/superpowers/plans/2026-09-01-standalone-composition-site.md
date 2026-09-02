# Standalone Composition Site: Frontend MVP Plan

> **Execution mode:** The user explicitly requested the front end first, so this plan proceeds directly with a local, dependency-free visual vertical slice. It deliberately does not choose the final backend framework or create an account database.

## Goal

Create a visually polished, interactive local preview of the independently deployable composition-learning site. The reviewer can create an essay, browse it in the B-layout reader, hover/click words, select a phrase, and save essay-local notes without any external service.

## File map

| File | Responsibility |
|---|---|
| `composition-site/tests/ui-contract.test.js` | Node `assert` contract that protects the required interaction anchors and prohibits provider-key/network code in the preview. |
| `composition-site/index.html` | Accessible page structure, create dialog, word/phrase note dialog, and reader/list/note regions. |
| `composition-site/styles.css` | Editorial dossier visual system, responsive desktop/mobile layouts, selection-safe word presentation, dialogs, and motion. |
| `composition-site/app.js` | Demo essay/local-storage state, explicit create/note persistence, delegated word interactions, native-selection phrase action, and deterministic demo explanation. |
| `composition-site/README.md` | Exact preview command, demo limitations, and the next production integration boundary. |

## Implementation tasks

### Task 1 — Establish a failing UI contract

1. Create `composition-site/tests/ui-contract.test.js` first.
2. Assert the future interface has: a `new-essay` action, title/source/content dialog inputs, list/reader/notes containers, an essay-word representation, phrase action, explicit save action, and local-only preview guardrails.
3. Run `node composition-site/tests/ui-contract.test.js`; it must fail because the frontend files are not present yet.

### Task 2 — Build the standalone reader shell

1. Create `index.html`, `styles.css`, and `app.js` only after the test is observed red.
2. Render an initial local demo essay and notes, supporting desktop two-column B layout and a small-screen list-to-reader change.
3. Make the create dialog save plain-text essay data to local storage and insert a file-like row immediately.
4. Keep all text rendering escaped and make no network request or API key reference.

### Task 3 — Implement explicit learning interactions

1. Tokenize visible English text into focusable `.essay-word` elements while preserving normal text selection.
2. Provide desktop hover definition behavior; a normal click opens an unsaved word-note dialog.
3. Detect a nonempty reader selection and show a phrase action that opens the same explicit-save dialog populated with a deterministic, visibly-demo explanation.
4. Save notes only to the selected essay's local storage record; render grouped word/phrase notes below the reader.

### Task 4 — Verify and review

1. Run the contract test again; it must pass.
2. Start a local static server and open the page at desktop and mobile widths.
3. Manually exercise: create dialog validation and save; file selection; hover/click word; phrase selection; phrase save; reload persistence; narrow-screen navigation.
4. Ask the independent frontend-review agent to inspect the resulting prototype before reporting it ready for visual feedback.

## Acceptance criteria

- The preview lives outside `vocabulary/` and `vocabulary-frontend/` and does not modify their dirty worktrees.
- A user can visually review the approved B layout and all requested front-end controls without setup beyond a static server.
- The prototype makes the boundary honest: no real auth, database, GLM, or live translation claim.
- Browser-native multiword selection remains possible in the essay body.
- Saving an essay or a word/phrase note updates the visible UI and persists across a page reload in this preview only.

## Production follow-up after visual approval

1. Initialize the standalone repository and choose hosting/auth/database together.
2. Implement the separate authenticated API and server-owned essay/note schema described in the standalone design.
3. Add server-side GLM-5.2 structured explanation, cache, rate limits, schema validation, and direct-translation fallback.
4. Replace local-only demo state with the authenticated API while keeping the approved visual/interaction contract.

