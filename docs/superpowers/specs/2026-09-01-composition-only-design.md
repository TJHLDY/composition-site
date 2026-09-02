# Composition-Only VocabNote Design

**Status:** User-approved on 2026-09-01; ready for implementation planning.

## Goal

Replace the user-facing VocabNote workspace with a focused, authenticated composition-learning experience. A user creates and reads personal model essays, records notes that belong to one essay only, looks up words and phrases in context, and can request a GLM-5.2 explanation before saving a note.

## Scope

### Included

- Keep the existing login and JWT user identity boundary.
- A composition-only home screen: left file list and right reading preview on desktop; a list-to-detail flow on mobile.
- Create a composition through a dialog with required title and content plus optional subtitle/source label.
- Read an essay with word hover definitions, click-to-note behavior, and native multi-word text selection.
- Store independent word and phrase annotations under the essay that contains them.
- Render a simple, browseable note list below the essay body. No review cards, spaced-repetition schedule, score, timer, duel, leaderboard, or quiz loop.
- Use GLM-5.2 only for an on-demand, context-aware explanation. Preserve dictionary/direct-translation fallback when the AI service is unavailable.
- Keep the two frontend copies synchronized: deployed source in `vocabulary/src/main/resources/static/index.html` and standalone source in `vocabulary-frontend/index.html`.

### Explicitly excluded from this version

- CET-6 quiz, PK/duel, rankings, quiz stats, wordbook UI, admin UI, bulletin UI, feedback UI, and the previous broad search workspace.
- Deleting the old PK/quiz backend code or database data. The current worktrees contain user changes, so legacy code stays untouched and unreachable from the new UI. It can be removed only in a separately scoped cleanup after backup/review.
- Cross-essay review schedules, automatic spaced repetition, automatic note creation while reading, full-essay AI grading, grammar correction, or essay generation.
- Sending the full account profile, other essays, or raw API secrets to an AI provider.

## Existing foundation and constraints

- The Spring Boot application already hosts the deployed frontend and provides JWT identity through `UserContext`.
- Existing word lookup can provide dictionary data; existing direct translation can translate a selected phrase.
- The existing inline `.sword` click handler auto-adds words to the global wordbook and therefore must not be reused for the composition page. Composition annotations require an explicit save action.
- Existing sentence translation writes query history and wordbook entries, so it must not be used to process a whole essay.
- The workspace root is not a Git repository. The two child repositories are dirty and must be preserved; no pre-existing user change may be overwritten.

## User experience

### 1. Composition library

The desktop home view uses the approved B layout:

```text
[ VocabNote · 我的作文                                  + ]
┌─────────────────────┬────────────────────────────────────┐
│ 我的作文              │ 环保主题范文                        │
│ ▤ 环保主题范文        │ 2026 年英语二 · 第 1 套             │
│   2026 年英语二 第 1 套│                                    │
│ ▤ 科技改变生活        │ essay body                          │
│ ▤ 成长与责任          │                                    │
│                     │ this essay's word and phrase notes  │
└─────────────────────┴────────────────────────────────────┘
```

- The header has a right-side plus button.
- The composition list shows title first and optional subtitle/source label second. Empty subtitles are not rendered.
- The reading pane shows title, optional subtitle, saved time, essay body, and its note list.
- On mobile, the library becomes a one-column list; tapping a file opens a full reading screen with a back button.

### 2. Create dialog

The dialog contains exactly these first-version fields:

| Field | Required | Validation | Display use |
|---|---:|---|---|
| `title` / 题目 | yes | trimmed, 1–200 characters | primary file name and reading title |
| `sourceLabel` / 小标题 | no | trimmed, at most 100 characters | e.g. `2026 年英语二 · 第 1 套` or `课堂范文` |
| `content` / 范文 | yes | trimmed, at most 100,000 characters | plain-text essay body |

Saving uses plain text only. The frontend escapes every stored or AI-supplied string before rendering it into HTML.

### 3. Reading, lookup, and annotation flow

The essay body keeps native text selection enabled.

| User action | Result | Persisted? |
|---|---|---:|
| Hover an English word on desktop | Show a concise cached definition tooltip. Fetch lazily on the first hover when needed. | No |
| Click one English word without an active selection | Open a composition-specific word-note panel with definition, source sentence, AI explanation action, editable note, and save button. | Only after save |
| Drag-select or long-press select several words | Preserve native selection; show a phrase action bar. | No |
| Click `解释短语` / `高级解释` | Request a contextual explanation for the exact selected range. | No |
| Confirm `保存到本篇笔记` | Create or edit an annotation and refresh the list below the essay. | Yes |

Interaction safeguards:

- The composition renderer uses an `essay-word` event delegate rather than the existing global `.sword` listener.
- It never calls `preventDefault` on pointer-down or touch-start, so drag selection and long press remain usable.
- It ignores a word click if a non-empty browser selection exists, if the pointer moved more than a small drag threshold, or immediately after a selection change.
- On mobile, a single tap opens a bottom sheet; a long press invokes native selection and a bottom phrase action bar. The old double-tap tooltip handler is not applied inside `.essay-body`.
- Every note list row can scroll/focus the reader at its saved range. The current range is highlighted only while focused.

### 4. Notes for memory

The approved A option is a clear static list beneath the essay. Notes are grouped as `单词` and `短语`; each row exposes:

- selected English text;
- saved Chinese translation;
- concise contextual meaning/collocation when available;
- the user's editable personal note;
- a link back to the original position in the essay.

The user intentionally chose this over review cards or a spaced-repetition system. It remains a focused composition feature rather than another quiz subsystem.

## Data design

### `composition`

```text
id                BIGINT PK
user_id           BIGINT NOT NULL
title             VARCHAR(200) NOT NULL
source_label      VARCHAR(100) NULL
content           LONGTEXT NOT NULL
content_version   INT NOT NULL DEFAULT 1
created_at        DATETIME NOT NULL
updated_at        DATETIME NOT NULL
INDEX (user_id, updated_at)
```

`content` is normalized to `\n` at write time. `contentVersion` allows the server to reject annotations that no longer match a subsequently edited body. The first UI does not expose essay editing, but this protection prevents incorrect range attachment if editing is added later.

### `composition_annotation`

```text
id                 BIGINT PK
composition_id     BIGINT NOT NULL
user_id            BIGINT NOT NULL
content_version    INT NOT NULL
selected_text      VARCHAR(500) NOT NULL
start_offset       INT NOT NULL
end_offset         INT NOT NULL
kind               VARCHAR(16) NOT NULL       -- word | phrase
translation_zh     VARCHAR(1000) NULL
explanation_json   MEDIUMTEXT NULL            -- validated GLM result snapshot
note               TEXT NULL                  -- user-authored note
created_at         DATETIME NOT NULL
updated_at         DATETIME NOT NULL
UNIQUE (composition_id, content_version, start_offset, end_offset)
INDEX (user_id, composition_id)
```

Offsets are zero-based, end-exclusive UTF-16 indexes. JavaScript strings and Java `String` use compatible UTF-16 indexing. The server validates that the selected range is within the stored content and that `content.substring(startOffset, endOffset)` matches the server-derived selected text.

Two identical phrases in different locations are separate annotations. A repeat save for the same range opens/updates the existing annotation instead of creating a duplicate.

### `composition_ai_explanation_cache`

```text
id                 BIGINT PK
user_id            BIGINT NOT NULL
request_hash       CHAR(64) NOT NULL
provider           VARCHAR(40) NOT NULL
model              VARCHAR(80) NOT NULL
result_json        MEDIUMTEXT NOT NULL
expires_at         DATETIME NOT NULL
created_at         DATETIME NOT NULL
UNIQUE (user_id, request_hash)
INDEX (expires_at)
```

The cache stores a validated result and hash, not the full essay/context. It expires after 30 days. A short in-process cache may reduce repeat requests before the database cache is read.

## Backend API design

All endpoints remain authenticated under the existing JWT security configuration. The server obtains `userId` only from `UserContext`; it never accepts a client-supplied user id.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/compositions` | List current user's compositions with title, subtitle, note count, and timestamps. |
| `POST` | `/api/compositions` | Create one composition from title, optional source label, and content. |
| `GET` | `/api/compositions/{id}` | Read one owned composition plus its annotations. |
| `POST` | `/api/compositions/{id}/contextual-explanations` | Return an unsaved contextual explanation for a validated selection. |
| `POST` | `/api/compositions/{id}/annotations` | Save a confirmed word or phrase annotation. |
| `PUT` | `/api/compositions/{id}/annotations/{annotationId}` | Edit the personal note or accepted explanation snapshot for an owned annotation. |
| `DELETE` | `/api/compositions/{id}/annotations/{annotationId}` | Remove one owned annotation. |

The contextual explanation request only accepts `startOffset`, `endOffset`, `kind`, and `contentVersion`. The server reads the owned composition, validates range/version, derives `selectedText`, extracts the containing sentence plus limited adjacent context, and constructs the provider request itself.

The annotation save request accepts only bounded editable fields and a range/version. It cannot create an annotation for another user or another composition.

## GLM-5.2 contextual explanation

### Provider boundary

Create a provider-agnostic backend port:

```java
interface ContextualExplainer {
    ExplanationResult explain(ExplanationRequest request);
    String providerName();
}
```

The first production adapter is `ZhipuContextualExplainer`, configured for `glm-5.2`. The rest of the composition module depends on the interface rather than a provider SDK, so a later provider change does not alter controllers, annotations, or frontend behavior.

### Configuration and secret handling

```yaml
context-explainer:
  provider: zhipu
  api-key: ${CONTEXT_EXPLAINER_API_KEY:}
  model: ${CONTEXT_EXPLAINER_MODEL:glm-5.2}
  endpoint: ${CONTEXT_EXPLAINER_ENDPOINT:}
  timeout-ms: ${CONTEXT_EXPLAINER_TIMEOUT_MS:8000}
```

No real key is written to source, test fixtures, documentation, frontend JavaScript, logs, or Git. The production environment supplies the key. The endpoint stays configurable rather than being hard-coded from an unverified deployment assumption.

### Requested structured result

The provider is instructed to return JSON only. The backend parses, validates, trims, and length-limits every field before sending it to the browser:

```json
{
  "translationZh": "有意义的贡献",
  "contextualMeaningZh": "此处指对环保的实际贡献。",
  "partOfSpeech": "名词短语",
  "collocation": "make a meaningful contribution to ...",
  "grammarNoteZh": "make 后接名词短语；to 后接贡献的对象。",
  "alternatives": [
    {"text": "play a meaningful role in", "differenceZh": "强调发挥作用"}
  ],
  "confidence": "high"
}
```

The UI labels this as an AI suggestion, not an unquestionable fact. The user may edit the translation and note before saving.

### Quality, safety, and fallback rules

- Input is limited to a 500-character selection and at most 1,200 characters of contextual essay text.
- User-controlled essay content is treated as data inside the provider prompt, never as system instructions.
- The service sends no login token, email, other user data, or unrelated essays to the provider.
- Validate JSON server-side; never render raw provider response as HTML.
- Rate-limit contextual requests separately from login limits: initial target is 20 requests per 10 minutes and 120 requests per day per user.
- Deduplicate concurrent equivalent requests and serve a matching cache entry before a provider call.
- On provider timeout, malformed JSON, rate limit, or unavailable key: return a clearly marked fallback. For a single word, use existing dictionary lookup; for a phrase, use existing direct translation. Do not claim a fallback is contextual AI explanation.
- Log provider name, duration, status, anonymous cache key, and fallback reason only. Do not log the essay, selection context, API key, or unvalidated provider content.

## Frontend implementation boundaries

Replace the old broad SPA contents in both `index.html` copies with a clean composition-only page. Reuse only these safe shared foundations:

- JWT local-storage login guard and authenticated fetch wrapper;
- theme/header shell as appropriate;
- `escapeHtml()` and generic toast/spinner patterns;
- visual styling and dictionary lookup data contracts.

Do not retain or initialize the old search, quiz, PK, wordbook, admin, bulletin, feedback, profile, chart, swipe, or audio flows. Do not copy the old inline word `onclick` logic because it silently writes to the wordbook.

The new frontend modules are logically separated even if delivered inside the existing vanilla HTML file:

```text
composition-library      list / select / empty state
composition-dialog       create form and validation
composition-reader       plain-text render, range calculation, focus highlights
word-lookup-controller   hover cache and single-word panel
phrase-selection         browser Selection/Range handling and action bar
annotation-panel         AI result, user edits, create/update/delete
notes-list               grouped independent annotations below reader
```

## Error behavior

- A failed composition list/detail request shows a retryable inline state rather than a blank pane.
- A failed dictionary lookup leaves the word selectable and offers manual note entry.
- A failed contextual explanation preserves the selected range and offers direct translation/manual note fallback.
- Saving prevents double submission and retains the entered note text on failure.
- An annotation whose `contentVersion` is stale returns a clear refresh message; the browser reloads the essay before a user saves again.
- 401 responses follow the existing login redirect behavior; 403/404 ownership failures never disclose another user's title or content.

## Acceptance and verification

### Backend tests

- Composition ownership: every read/create/annotation route uses the current JWT user and rejects other users' ids.
- Range validation: valid word range, phrase range, punctuation/newline boundaries, invalid range, stale version, and duplicate same-range save.
- Context extraction: exact containing sentence plus bounded neighboring context.
- Explanation service: valid JSON parsing, field limit enforcement, user-content isolation in prompts, cache hit, provider timeout, malformed JSON, and fallback labeling.
- Configuration: absent API key never starts a provider call and exercises fallback safely.

### Frontend tests and browser QA

- Creation dialog validates title/content, treats source label as optional, and immediately shows a saved composition in the list.
- Desktop hover only reads a definition; it creates no annotation or global wordbook entry.
- Single click opens a word-note flow; drag selection does not accidentally open that flow.
- Multi-word selection invokes contextual explanation, supports manual edits, and creates a phrase note in the correct section.
- Mobile tap/long-press flows do not conflict with native text selection.
- Note list focus returns to the intended word/phrase occurrence when the same text appears multiple times.
- Test at 1366×768, 1024×768, and 390×844 with no horizontal overflow.

### GLM quality evaluation

Before treating the explanation prompt as complete, run a private 20–30 sample acceptance set drawn from typical essay words and phrases. Review literal correctness, contextual sense, collocation usefulness, grammar advice, response latency, and malformed/empty JSON handling. Tune the prompt/schema based on failures; do not expose test essays or API keys in source control.

## Delivery order

1. Add schema/entities/mappers/service/controller tests for compositions and annotations.
2. Add GLM-5.2 provider adapter, strict result parser, cache/fallback, and tests.
3. Replace the hosted composition UI and synchronize the standalone frontend copy.
4. Run backend tests/build and browser QA with a controlled API-key environment.
5. Verify only intended files changed and preserve existing user modifications.

## Deferred decisions

- Add composition editing/deletion only after the create/read/note flow is accepted in real use.
- Add a global review queue or spaced repetition only as a separate feature, not as a hidden extension of this release.
- Remove legacy PK/quiz code only through a separate cleanup plan after confirming no deployment/runtime dependency remains.
