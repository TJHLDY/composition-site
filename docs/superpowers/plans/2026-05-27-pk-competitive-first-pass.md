# PK Competitive First Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first stable pass of the PK competitive experience without taking on the full BO3 replay/declaration data model yet.

**Architecture:** Keep the current Spring Boot + vanilla HTML/JS shape. Fix the broken PK leaderboard SQL, expand the desktop CET-6 quiz layout, merge quiz and PK leaderboards into one panel, and enrich the PK invite arena with refresh/rank/crown cues using existing API data.

**Tech Stack:** Java 17, Spring Boot, MyBatis XML, vanilla HTML/CSS/JS, Node assertion tests, Maven/JUnit.

---

### Task 1: Lock Current Bugs With Tests

**Files:**
- Modify: `vocabulary/src/test/frontend/pk-invite-ui.test.js`
- Create: `vocabulary/src/test/frontend/pk-competitive-layout.test.js`
- Create: `vocabulary/src/test/java/org/gduf/pk/PkLeaderboardMapperXmlTest.java`

- [ ] Add a frontend assertion that the invite arena has a manual refresh control, renders rank/crown metadata, and does not close the websocket when an invite arrives.
- [ ] Add an HTML/CSS assertion that the quiz page uses one unified leaderboard panel, has quiz/PK leaderboard mode switching, and does not keep a separate `pk-lb-panel`.
- [ ] Add a mapper XML assertion that PK leaderboard ordering does not reference the nonexistent `win_rate` alias.
- [ ] Run `node src/test/frontend/pk-invite-ui.test.js`, `node src/test/frontend/pk-competitive-layout.test.js`, and `mvn -Dtest=PkLeaderboardMapperXmlTest test` and confirm the new tests fail before implementation.

### Task 2: Fix Backend PK Leaderboard Ordering And Match Size

**Files:**
- Modify: `vocabulary/src/main/resources/mapper/PkUserStatsMapper.xml`
- Modify: `vocabulary/src/main/java/org/gduf/pk/PkWebSocketHandler.java`

- [ ] Replace `ORDER BY ... win_rate ...` with a valid expression/alias that MySQL can execute.
- [ ] Change PK matches from 15 questions to 20 questions.
- [ ] Run the mapper and scoring tests.

### Task 3: Merge Quiz And PK Leaderboard Panel

**Files:**
- Modify: `vocabulary/src/main/resources/static/index.html`
- Mirror: `vocabulary-frontend/index.html`

- [ ] Replace the separate PK leaderboard block with a unified leaderboard panel containing top-level `刷题榜 / 决斗榜`.
- [ ] Keep quiz scopes as `日榜 / 周榜`; PK scopes as `日榜 / 周榜 / 总榜`.
- [ ] Render PK rows with rank, crown styling for top 3, avatar, username, points, and win rate.
- [ ] Keep mobile modal behavior working.

### Task 4: Improve CET-6 Desktop Layout

**Files:**
- Modify: `vocabulary/src/main/resources/static/index.html`
- Mirror: `vocabulary-frontend/index.html`

- [ ] Widen the quiz desktop content area.
- [ ] Use a stable two-column desktop layout: study/progress content on the left, unified leaderboard on the right.
- [ ] Preserve current mobile single-column behavior.

### Task 5: Improve PK Invite Arena

**Files:**
- Modify: `vocabulary/src/main/resources/static/index.html`
- Mirror: `vocabulary-frontend/index.html`

- [ ] Add a refresh button to the invite arena that reloads online users and their latest status.
- [ ] Show current user and target user rank/points/win-rate where data exists.
- [ ] Add top-three crown visual treatment for ranked users.
- [ ] Keep invite cooldown and incoming modal behavior intact.

### Task 6: Verify

**Files:**
- Test only.

- [ ] Run frontend Node tests.
- [ ] Run targeted Maven tests.
- [ ] Run `mvn test` if dependencies and local environment allow.
- [ ] Inspect the final diff for accidental unrelated changes.
