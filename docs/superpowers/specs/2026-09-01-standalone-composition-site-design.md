# Standalone Composition Site Design

**Status:** User-confirmed MVP direction on 2026-09-01. This supersedes the deployment boundary in `2026-09-01-composition-only-design.md`; the interaction design remains the same.

## Product boundary

This is a new independently published website, not a replacement for either existing VocabNote frontend. It owns a separate account system, database, deployment, API namespace, and source directory. The existing application is reference-only and must not be modified for this MVP preview.

The first deliverable is a clickable front-end vertical slice in `composition-site/`. It uses local demo data only so the approved experience can be reviewed before a backend, authentication, database, or GLM key is connected.

## Approved experience

- Desktop uses the approved B layout: a narrow personal essay file list on the left and the selected essay reading pane on the right.
- The header has a prominent `+` button. Its dialog has required `题目` and `范文` fields and an optional `小标题 / 来源` field such as `2026 年英语二 · 第 1 套`.
- The reading pane shows the essay, then an independent static note list for that essay. Notes are grouped into `单词` and `短语`, not active-recall cards.
- Hovering an English word shows a concise meaning. Clicking an unselected word opens a confirm-before-save note sheet. Dragging or long-pressing a multiword phrase preserves native browser selection and opens a phrase action bar.
- The prototype may show deterministic example explanations, but labels them as `演示解释`; it does not call a translation provider or claim that GLM is connected.
- In the production backend, a user explicitly requests contextual explanation. The server sends only the selected text plus bounded essay context to GLM-5.2 and validates structured JSON before showing it. No API key or credential enters front-end source.

## Visual direction

**Editorial study dossier.** The page should feel like a carefully kept English-study binder rather than a dashboard: warm paper ground, ink-black text, rich forest-green focus color, vermilion proof marks, a serif editorial display face paired with a highly readable CJK body face, file-tab metadata, lightly ruled reading paper, and restrained motion.

The most memorable element is the reader: the active essay looks like a tangible marked-up sheet, with word underlines and note anchors that make language study visible without obscuring selection or reading.

## Data and integration boundary after review approval

| Layer | MVP preview | Production independent site |
|---|---|---|
| Identity | A visible demo identity only | Separate email/password or chosen provider auth, separate user table/session boundary |
| Essays and notes | Browser local storage | Separate database scoped by current independent user |
| Word/phrase explanation | Fixed, clearly marked demo results | Server-side dictionary/direct translation plus GLM-5.2 contextual provider adapter and fallback |
| Deployment | Local static preview | Independently hosted frontend and API, no VocabNote runtime dependency |

## Non-goals for the preview

- No real sign-up/login persistence, database writes, network request, API key, GLM call, or hidden legacy VocabNote route.
- No PK, quiz, ranking, wordbook, administrator, profile, bulk import, full-essay grading, or spaced-repetition feature.
- No use of external images or a permanent brand name. `范文夹` is only a working interface label.

## Reuse decision

- **Adapt:** a zero-dependency DOM contract test for this standalone UI; a later multi-provider fallback pattern for contextual explanation; a later responsive browser QA harness.
- **Reference only:** the legacy VocabNote reader behavior and the lesson that duplicate frontend copies drift.
- **Reject:** copying either legacy application as the new site source, because its feature surface, automatic wordbook writes, and deployment/data boundary contradict the independent product.

