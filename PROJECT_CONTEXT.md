# VocabNote Project Context for Codex

Last reviewed: 2026-05-26

This file is the cross-repo context note for future Codex sessions. Read it before changing code in this workspace.

## Workspace Shape

The workspace root is `D:\ieda-java\vocabNote`.

It contains two sibling Git repositories:

- `vocabulary/` - Spring Boot backend, also hosts the deployed static frontend from `src/main/resources/static/`.
- `vocabulary-frontend/` - standalone vanilla HTML/CSS/JS source copy.

The workspace root itself is not a Git repository. Both child repositories are on `master` tracking `origin/master`. At the time this file was written, both child repos had an untracked `AGENTS.md` generated for Codex guidance.

## Existing Guidance Files

Claude Code previously created these guidance files:

- `vocabulary/CLAUDE.md`
- `vocabulary/AGENTS.md`
- `vocabulary-frontend/CLAUDE.md`
- `vocabulary-frontend/AGENTS.md`

Those files are useful, but some frontend details are stale. In particular, the frontend is now larger than the old notes say: `index.html` is about 3860 lines and includes search, CET-6 quiz, wordbook, admin, bulletin, feedback, profile, avatar upload, password change, and invite-code flows.

## Backend Overview

Backend path: `vocabulary/`

Tech stack:

- Java 17
- Spring Boot 3.5.11
- MyBatis-Plus 3.5.15
- Spring Security
- JWT via `jjwt` 0.12.6
- MySQL
- Lombok
- Java Mail
- Aliyun OSS SDK

Common commands:

```bash
mvn spring-boot:run
mvn package
mvn clean
```

Runtime config:

- Server port: `8086`
- Database: `jdbc:mysql://localhost:3306/vocabulary`
- Required environment variables include `DB_PASSWORD`, `JWT_SECRET`, `MAIL_PASSWORD`, `OSS_ACCESS_KEY_ID`, and `OSS_ACCESS_KEY_SECRET`.
- `application.yml` currently contains Baidu translate app configuration. Treat credentials/config in this file carefully.

Main entry point:

- `vocabulary/src/main/java/org/gduf/VocabularyApplication.java`

Important package layout:

- `controller/` - REST API endpoints.
- `service/` and `service/impl/` - business logic.
- `mapper/` - MyBatis-Plus mapper interfaces.
- `resources/mapper/` - custom SQL XML mappers.
- `entity/` - database entities using Lombok chainable setters.
- `security/` - JWT auth filter, rate limiting, security config, user context.
- `translate/` - translation chain and translator implementations.
- `sql/` - schema/data helper SQL and CET-6 import script.
- `resources/static/` - Spring Boot hosted frontend files.

## Backend API Map

All normal API responses use `R` shape:

```json
{
  "code": 200,
  "msg": "success",
  "data": {}
}
```

Authentication and account:

- Base: `/api/auth`
- `POST /register` - register with email code and invite code.
- `POST /register/send-code` - send register email code.
- `GET /check` - check username/email availability.
- `POST /login` - login with username/email and password; supports `remember`.
- `POST /forgot-password/send-code` - send reset code.
- `POST /forgot-password/reset` - reset password.

User profile:

- Base: `/api/user`
- `GET /me` - current user profile.
- `POST /avatar` - upload avatar image to Aliyun OSS.
- `PUT /password` - change password.

Words and wordbook:

- Base: `/api/words`
- `POST /api/words?word=...` - save word or increment query count.
- `GET /all?sort=count|accuracy` - list current user's words.
- `GET /relations?word=...` - related-word records.
- `GET /translate?word=...` - backend word translation/lookup.
- `DELETE /{word}` - delete one word.
- `DELETE /all` - clear wordbook.
- `GET /dict-proxy/{word}` - public proxy for dictionaryapi.dev.
- `POST /dictation?word=...&correct=true|false` - record spelling/dictation result.

Sentence translation:

- Base: `/api/translate`
- `POST /` - translate text.
- `POST /sentence` - translate full sentence, tokenize English input, save useful words, keep sentence history.
- `GET /history` - last 3 sentence queries.

CET-6 quiz:

- Base: `/api/quiz`
- `GET /generate?mode=cn2en|en2cn` - generate 20 questions.
- `POST /answer` - submit one answer.
- `GET /progress` - wrong and mastered word lists.
- `GET /stats` - last 7 days stats.
- `POST /reset` - reset quiz progress/stats.
- `GET /check-mastered` - whether all CET-6 words are mastered.
- `POST /regenerate` - generate replacement questions excluding answered words.

Bulletin:

- Base: `/api/bulletin`
- `GET /latest` - latest bulletin and whether current user has seen it.
- `POST /ack` - mark latest bulletin as seen.

Admin and tester flows:

- Base: `/api/admin`
- `GET /users` - admin user list, includes online status and invite metadata.
- `PUT /users/{id}/toggle` - enable/disable user.
- `DELETE /users/{id}` - delete non-admin user and related data.
- `POST /codes?count=N` - admin invite-code generation.
- `GET /codes` - list unused admin-created codes.
- `PUT /users/{id}/role` - set user/tester role.
- `POST /users/{id}/codes?count=N` - create tester invite codes.
- `GET /my-codes` - admin/tester own unused codes.
- `POST /feedback` - authenticated user submits feedback.
- `GET /feedback` - admin feedback list.
- `POST /bulletin` - admin publishes bulletin.

## Backend Behavior Notes

Security:

- Stateless JWT Bearer tokens.
- `SecurityConfig` permits `/api/auth/**`, `/api/words/dict-proxy/**`, `login.html`, `index.html`, `/`, CSS, and JS.
- Other `/api/**` routes require JWT.
- Role checks use Spring method security, for example `@PreAuthorize("hasRole('ADMIN')")`.
- `UserContext` stores current user id and role in a ThreadLocal during requests.
- `RateLimitFilter` limits login to 10 requests/min/IP and register to 5 requests/min/IP.
- `JwtAuthFilter` tracks last active users in memory and writes `last_active_at` for remember-login users about every 5 minutes.

Registration and invite codes:

- Registration requires email, verification code, username, password, and invite code.
- Invite codes can be admin-created or tester-created.
- Tester promotion grants role `tester` and generates 10 invite codes.

Word lookup:

- `WordServiceImpl.saveOrIncrement()` lowercases and trims the word.
- It first tries Youdao dictionary JSON API, then translation fallback.
- It stores a concise Chinese meaning into the `word` table and returns richer lookup data when available.
- Many external calls are synchronous `HttpClient` calls with no retry, cache, or circuit breaker.

Translation:

- `TranslateChain` sorts `Translator` beans by priority.
- Baidu LLM translator is first, Baidu general translator second, MyMemory last.
- If one translator returns blank/null or throws, the chain tries the next.

Quiz:

- Questions come from `cet6_word`.
- Wrong words are prioritized.
- A word is considered mastered when `consecutive_correct >= 3`.
- Daily stats are stored in `quiz_daily_stats`.
- SQL uses MySQL `INSERT ... ON DUPLICATE KEY UPDATE`.

Cleanup:

- `UserCleanupScheduler` deletes disabled non-admin users after 3 days, along with related word, quiz, feedback, sentence history, and invite-code data.

## Database and SQL Notes

Schema is not fully represented in one migration system. Current SQL helpers live under `vocabulary/sql/`:

- `cet6_init.sql` - creates `cet6_word`, `quiz_progress`, and `quiz_daily_stats`.
- `bulletin_init.sql` - creates `bulletin` and adds `user.seen_bulletin_id`.
- `tester_role.sql` - adds invite/tester relationship columns.
- `import_cet6.py` and `cet6_data.json` - CET-6 data import.

Custom MyBatis XML mappers live in `vocabulary/src/main/resources/mapper/`:

- `WordMapper.xml`
- `WordRelationMapper.xml`
- `Cet6WordMapper.xml`
- `QuizProgressMapper.xml`
- `QuizDailyStatsMapper.xml`

The implementation relies heavily on MySQL-specific upsert SQL. Do not assume portability to other databases.

## Frontend Overview

Standalone frontend path: `vocabulary-frontend/`

Hosted frontend path: `vocabulary/src/main/resources/static/`

The frontend is vanilla HTML/CSS/JS. There is no framework, no bundler, and no `package.json`.

Current important files:

- `vocabulary-frontend/index.html` - main SPA, about 3860 lines.
- `vocabulary-frontend/login.html` - login/register/forgot-password page, about 429 lines.
- `vocabulary/src/main/resources/static/index.html` - hosted copy of the main SPA, same hash as standalone copy when this file was written.
- `vocabulary/src/main/resources/static/login.html` - hosted login page, about 458 lines.

Important difference:

- The hosted backend `static/login.html` currently includes the "三天免登录" remember-login checkbox and sends `remember`.
- The standalone `vocabulary-frontend/login.html` did not match the hosted login page hash when this file was written. Check both before editing login behavior.

Frontend API constants:

```js
const API = '';
const DICT = '/api/words/dict-proxy';
```

This means the current frontend expects same-origin hosting by the Spring Boot app. Older notes saying `http://localhost:8086` are stale for the current code.

## Frontend Feature Map

Top-level tabs in `index.html`:

- `search` - "查词翻译"
- `quiz` - "刷六级"
- `book` - "我的单词本"
- `admin` - "管理", hidden unless current user role is admin

Shared frontend patterns:

- JWT token is stored in `localStorage` as `token`.
- Authenticated calls use `Authorization: Bearer <token>`.
- The client decodes JWT payload for display/role gating, but real auth remains backend-side.
- `escapeHtml()` is the main manual XSS protection when rendering server/external data.
- Toasts, modals, sidebars, and spinners are all implemented in the single HTML file.

Search and sentence translation:

- Search supports English and Chinese input. Chinese input is translated to English before lookup.
- Lookup combines backend save/translate calls, `/api/words/dict-proxy`, and Datamuse related words.
- Sentence translation calls `/api/translate/sentence`.
- Sentence words render as clickable/hoverable spans with tooltip and sidebar lookup.
- Sentence history loads from `/api/translate/history`.

Wordbook:

- Loads from `/api/words/all`.
- Supports sorting by count or dictation accuracy.
- Supports deleting one word or clearing all words.
- Includes dictation/spelling practice with `/api/words/dictation`.

Quiz:

- Uses `/api/quiz/generate`, `/api/quiz/answer`, `/api/quiz/progress`, `/api/quiz/stats`, `/api/quiz/regenerate`, `/api/quiz/check-mastered`, and `/api/quiz/reset`.
- Supports `cn2en` and `en2cn`.
- Includes keyboard shortcuts, swipe gesture, progress records, example expansion, chart rendering, result modal, and confetti.

Admin/profile/feedback:

- Admin tab loads users and codes, changes roles, toggles users, deletes users, publishes bulletins, and reads feedback.
- Profile sidebar loads `/api/user/me`, uploads avatars to `/api/user/avatar`, changes password via `/api/user/password`, and exposes invite codes for admin/tester.
- Feedback is submitted through `/api/admin/feedback`; admin reads feedback through the same base path.

## Source of Truth for Frontend Changes

Because there are two frontend copies, always decide the intended source of truth before editing:

1. For changes users will see through Spring Boot, edit `vocabulary/src/main/resources/static/*.html`.
2. If the standalone `vocabulary-frontend/` copy is meant to stay in sync, apply the same change there too.
3. After editing both, compare hashes or relevant snippets.

At the time this context was written, `index.html` was identical in both locations, but `login.html` was not.

## Known Risks and Cleanup Opportunities

- No automated tests are present (`src/test/` is absent and no test dependencies are configured).
- Existing exception handling is incomplete; many controllers manually catch runtime errors and return `R.fail()`.
- Verification codes, rate limits, online status, and some activity state are in memory, so they reset on restart and are not multi-instance safe.
- External dictionary/translation calls are synchronous and mostly unguarded.
- Token storage uses `localStorage`, which is convenient but exposed to XSS if any rendering escapes are missed.
- SQL schema is spread across helper files rather than a formal migration tool.
- Some comments and text were created by earlier tooling; always check live source instead of trusting old line counts in guidance files.

## Good Workflow for Future Changes

1. Read this file first.
2. Read `CLAUDE.md` or `AGENTS.md` inside the specific child repo you will touch.
3. Check `git status --short --branch` in both child repos.
4. Identify whether the change touches backend, hosted frontend, standalone frontend, or all of them.
5. For backend changes, follow controller -> service -> mapper/entity/XML flow.
6. For frontend changes, search within the single HTML file for the function names and API path involved.
7. If editing both frontend copies, keep them intentionally synchronized unless the user asks otherwise.
8. Verify with `mvn package` when backend code changes. For frontend-only changes, run or open through Spring Boot if the behavior depends on authenticated APIs.

## Preferred Agent Collaboration Mode

For this vocabNote project, prefer a split workflow when the requested change is more than a tiny edit:

1. Codex reads the request, thinks through the product/architecture implications, and writes a concise implementation plan.
2. Codex turns that plan into a precise editing prompt for Claude Code, which is configured by the user to use the lower-cost DeepSeek API.
3. Claude Code performs the mechanical file edits, large HTML changes, repeated CRUD wiring, or two-copy frontend synchronization.
4. Claude Code should keep its output short: changed files, key decisions, and any errors. Avoid long explanations.
5. Codex then reviews the diff, checks behavior and risks, and asks Claude for another small patch only when needed.
6. Codex remains responsible for final judgment, especially for security, auth, database schema, data-loss risk, and cross-module behavior.

Use this mode especially for:

- Large edits in `index.html` or `login.html`.
- Synchronizing `vocabulary/src/main/resources/static/*.html` with `vocabulary-frontend/*.html`.
- Repetitive backend CRUD or mapper/controller/service wiring.
- Mechanical refactors and text/UI copy changes.

Use Codex directly, or at least have Codex fully specify and review the change, for:

- Authentication, authorization, JWT, roles, invite codes, and admin behavior.
- Database schema changes or destructive data operations.
- Security-sensitive rendering, file upload, OSS, mail, and external API credential handling.
- Any change where a wrong assumption could corrupt user data or lock users out.

Claude CLI note:

- On this machine, `claude.ps1` is available under the user's npm roaming directory.
- `claude --version` works and returned Claude Code 2.1.150 on 2026-05-26.
- The user said Claude Code is already connected to the DeepSeek API. For vocabNote delegated edits, Codex can call `claude` directly from the command line; do not stop to ask how to start it unless the command fails.
- Do not run broad autonomous Claude edits without a tight prompt, explicit target files, and a clear verification checklist.

## Quick File Landmarks

Backend:

- `vocabulary/pom.xml`
- `vocabulary/src/main/resources/application.yml`
- `vocabulary/src/main/java/org/gduf/VocabularyApplication.java`
- `vocabulary/src/main/java/org/gduf/controller/AuthController.java`
- `vocabulary/src/main/java/org/gduf/controller/WordController.java`
- `vocabulary/src/main/java/org/gduf/controller/TranslateController.java`
- `vocabulary/src/main/java/org/gduf/controller/QuizController.java`
- `vocabulary/src/main/java/org/gduf/controller/UserController.java`
- `vocabulary/src/main/java/org/gduf/controller/AdminController.java`
- `vocabulary/src/main/java/org/gduf/controller/BulletinController.java`
- `vocabulary/src/main/java/org/gduf/service/impl/UserServiceImpl.java`
- `vocabulary/src/main/java/org/gduf/service/impl/WordServiceImpl.java`
- `vocabulary/src/main/java/org/gduf/service/impl/QuizServiceImpl.java`
- `vocabulary/src/main/java/org/gduf/security/SecurityConfig.java`
- `vocabulary/src/main/java/org/gduf/security/JwtAuthFilter.java`

Frontend:

- `vocabulary/src/main/resources/static/index.html`
- `vocabulary/src/main/resources/static/login.html`
- `vocabulary-frontend/index.html`
- `vocabulary-frontend/login.html`

## Session Memory Summary

The project is a vocabulary learning app named VocabNote. It combines dictionary lookup, sentence translation, personal wordbook, dictation practice, CET-6 quiz, invite-code registration, tester/admin management, feedback, bulletins, profile sidebar, avatar upload, and password management.

The backend is a single Spring Boot app that owns auth, persistence, translation, quiz logic, admin logic, and static hosting. The frontend is a large vanilla SPA, currently best treated as a pair of HTML files embedded into the backend, with a separate sibling copy that may or may not be fully synchronized.
