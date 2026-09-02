# Quiz Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add daily and weekly CET-6 quiz leaderboards with once-per-day likes.

**Architecture:** Reuse `quiz_daily_stats` for ranking data and add a small `quiz_leaderboard_like` table for daily per-target likes. Expose leaderboard and like endpoints under `/api/quiz`, then render a desktop right-side panel and a mobile button-driven modal in the existing vanilla SPA.

**Tech Stack:** Spring Boot 3.5, MyBatis-Plus mapper XML, MySQL SQL helpers, vanilla HTML/CSS/JS.

---

### Task 1: Backend Ranking API

**Files:**
- Modify: `vocabulary/src/main/java/org/gduf/service/QuizService.java`
- Modify: `vocabulary/src/main/java/org/gduf/service/impl/QuizServiceImpl.java`
- Modify: `vocabulary/src/main/java/org/gduf/controller/QuizController.java`
- Modify: `vocabulary/src/main/java/org/gduf/mapper/QuizDailyStatsMapper.java`
- Modify: `vocabulary/src/main/resources/mapper/QuizDailyStatsMapper.xml`

- [ ] Add `getLeaderboard(Long viewerId, String scope)` to `QuizService`.
- [ ] Implement `scope=day` using today’s `quiz_daily_stats`.
- [ ] Implement `scope=week` using Monday-to-today aggregation.
- [ ] Return top 10 plus `myRank` if the viewer has data.
- [ ] Each row returns `userId`, `username`, `avatarUrl`, `correct`, `total`, `accuracy`, `likes`, `likedByMe`, and `rank`.
- [ ] Sort by `correct DESC`, `accuracy DESC`, `last_quiz_at ASC`, `user_id ASC`.
- [ ] Add `GET /api/quiz/leaderboard?scope=day|week`.

### Task 2: Daily Like API

**Files:**
- Create: `vocabulary/src/main/java/org/gduf/entity/QuizLeaderboardLike.java`
- Create: `vocabulary/src/main/java/org/gduf/mapper/QuizLeaderboardLikeMapper.java`
- Create: `vocabulary/src/main/resources/mapper/QuizLeaderboardLikeMapper.xml`
- Modify: `vocabulary/src/main/java/org/gduf/service/QuizService.java`
- Modify: `vocabulary/src/main/java/org/gduf/service/impl/QuizServiceImpl.java`
- Modify: `vocabulary/src/main/java/org/gduf/controller/QuizController.java`
- Modify: `vocabulary/sql/cet6_init.sql`

- [ ] Create table `quiz_leaderboard_like` with `id`, `from_user_id`, `to_user_id`, `like_date`, and `created_at`.
- [ ] Add unique key `(from_user_id, to_user_id, like_date)` and indexes for date/target lookup.
- [ ] Add `POST /api/quiz/leaderboard/like` with JSON `{ "targetUserId": 123 }`.
- [ ] Reject self-like with a clear failed `R`.
- [ ] Repeated same-day likes should not duplicate rows and should return already-liked state.
- [ ] Likes count for the active leaderboard scope is the likes received today.

### Task 3: Frontend Leaderboard UI

**Files:**
- Modify: `vocabulary/src/main/resources/static/index.html`
- Copy synced result to: `vocabulary-frontend/index.html`

- [ ] Add desktop leaderboard panel beside the existing quiz default content.
- [ ] Add mobile leaderboard button that opens a modal/drawer instead of lengthening the page.
- [ ] Add day/week segmented tabs.
- [ ] Render rows with rank, username/avatar initial, correct count, accuracy, and like button.
- [ ] Disable like button for self and for rows already liked today.
- [ ] Refresh leaderboard when opening quiz page, finishing a quiz, switching leaderboard scope, and liking a row.
- [ ] Keep mobile content compact and avoid horizontal overflow.

### Task 4: Validation

**Files:**
- Build command: `mvn -q -DskipTests package`
- Frontend source sync: compare `vocabulary/src/main/resources/static/index.html` and `vocabulary-frontend/index.html` hashes.

- [ ] Run backend build.
- [ ] Inspect SQL and mapper XML for MySQL syntax.
- [ ] Verify no unrelated files are staged.
- [ ] Leave `AGENTS.md` untouched.
