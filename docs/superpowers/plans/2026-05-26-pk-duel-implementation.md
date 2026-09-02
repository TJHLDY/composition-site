# CET-6 PK Duel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time CET-6 PK duel mode with strict buzz-in answering, fair PK scoring, PK leaderboards, invisibility, and faster profile/avatar loading.

**Architecture:** Add a focused `pk` backend slice next to the existing quiz module: SQL tables, entities, mappers, service logic, REST endpoints, and a WebSocket handler that authenticates JWT tokens and owns live rooms. Keep PK answer submission separate from normal quiz progress. Extend the vanilla SPA with a compact arena, match overlay, PK leaderboard, and profile preloading without restructuring the whole file.

**Tech Stack:** Java 17, Spring Boot 3.5, Spring WebSocket, MyBatis-Plus, MySQL, vanilla HTML/CSS/JS.

---

## File Structure

Backend files:

- Modify `vocabulary/pom.xml`: add `spring-boot-starter-websocket` and test dependencies if missing.
- Create `vocabulary/src/main/java/org/gduf/pk/PkScoringService.java`: pure scoring and cap logic.
- Create `vocabulary/src/test/java/org/gduf/pk/PkScoringServiceTest.java`: fast unit tests for all scoring edge cases.
- Create entities in `vocabulary/src/main/java/org/gduf/entity/`: `PkUserStats`, `PkDailyStats`, `PkMatch`, `PkMatchAnswer`, `PkUserSetting`, `PkPairDailyReward`.
- Create mappers in `vocabulary/src/main/java/org/gduf/mapper/`: mapper interfaces for each PK table.
- Create mapper XML in `vocabulary/src/main/resources/mapper/`: SQL for upserts, leaderboards, pair reward limits, and match settlement.
- Create `vocabulary/src/main/java/org/gduf/service/PkService.java`.
- Create `vocabulary/src/main/java/org/gduf/service/impl/PkServiceImpl.java`: arena users, settings, leaderboards, persistent settlement.
- Create `vocabulary/src/main/java/org/gduf/controller/PkController.java`: REST endpoints.
- Create `vocabulary/src/main/java/org/gduf/config/WebSocketConfig.java`: register `/ws/pk`.
- Create `vocabulary/src/main/java/org/gduf/pk/PkWebSocketHandler.java`: invite, room, buzz, answer, timeout, finish events.
- Create `vocabulary/src/main/java/org/gduf/pk/PkMessage.java`: simple message envelope.
- Create `vocabulary/src/main/java/org/gduf/pk/PkRoom.java`: in-memory room state.
- Modify `vocabulary/src/main/java/org/gduf/security/SecurityConfig.java`: permit `/ws/pk/**` handshake if the WebSocket handler authenticates token itself.
- Modify `vocabulary/sql/cet6_init.sql`: append PK table creation SQL.

Frontend files:

- Modify `vocabulary/src/main/resources/static/index.html`: PK UI, WebSocket client, leaderboard, profile preload.
- Copy final hosted HTML to `vocabulary-frontend/index.html`.

## Task 1: Add Scoring Tests First

**Files:**
- Create: `vocabulary/src/test/java/org/gduf/pk/PkScoringServiceTest.java`
- Production file covered in Task 2: `vocabulary/src/main/java/org/gduf/pk/PkScoringService.java`

- [ ] Write `PkScoringServiceTest` before production scoring code.

```java
package org.gduf.pk;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PkScoringServiceTest {

    private final PkScoringService service = new PkScoringService();

    @Test
    void winnerGetsBaseRewardAndHighestStreakBonus() {
        PkScoringService.Settlement settlement = service.settle(new PkScoringService.Input(
                7, 3, 5, 3, 20, 10, 10, 0, false, true));

        assertThat(settlement.playerAPointsDelta()).isEqualTo(14);
        assertThat(settlement.playerBPointsDelta()).isEqualTo(5);
        assertThat(settlement.playerABaseDelta()).isEqualTo(10);
        assertThat(settlement.playerBBaseDelta()).isEqualTo(3);
        assertThat(settlement.playerAStreakDelta()).isEqualTo(4);
        assertThat(settlement.playerBStreakDelta()).isEqualTo(2);
    }

    @Test
    void loserWithNegativeScoreLosesPointsButTotalNeverDropsBelowZero() {
        PkScoringService.Settlement settlement = service.settle(new PkScoringService.Input(
                4, -6, 0, 0, 20, 4, 2, 0, false, true));

        assertThat(settlement.playerAPointsDelta()).isEqualTo(10);
        assertThat(settlement.playerBPointsDelta()).isEqualTo(-2);
    }

    @Test
    void dailyBaseCapLimitsPositiveBaseButNotNegativePenalty() {
        PkScoringService.Settlement settlement = service.settle(new PkScoringService.Input(
                5, -3, 0, 0, 20, 100, 100, 58, false, true));

        assertThat(settlement.playerABaseDelta()).isEqualTo(2);
        assertThat(settlement.playerBBaseDelta()).isEqualTo(-3);
        assertThat(settlement.playerAPointsDelta()).isEqualTo(2);
        assertThat(settlement.playerBPointsDelta()).isEqualTo(-3);
    }

    @Test
    void positiveRewardsAreBlockedWhenMatchHasTooFewQuestions() {
        PkScoringService.Settlement settlement = service.settle(new PkScoringService.Input(
                5, 2, 8, 5, 9, 0, 0, 0, false, true));

        assertThat(settlement.playerAPointsDelta()).isEqualTo(0);
        assertThat(settlement.playerBPointsDelta()).isEqualTo(0);
    }

    @Test
    void pairRewardLimitBlocksPositiveRewardsButKeepsNegativePenalty() {
        PkScoringService.Settlement settlement = service.settle(new PkScoringService.Input(
                5, -2, 8, 0, 20, 100, 100, 0, true, true));

        assertThat(settlement.playerAPointsDelta()).isEqualTo(0);
        assertThat(settlement.playerBPointsDelta()).isEqualTo(-2);
    }
}
```

- [ ] Run `mvn -q -Dtest=PkScoringServiceTest test` from `vocabulary/`.

Expected: compilation fails because `PkScoringService` does not exist.

## Task 2: Implement Pure PK Scoring

**Files:**
- Create: `vocabulary/src/main/java/org/gduf/pk/PkScoringService.java`

- [ ] Implement minimal scoring code to satisfy Task 1.

```java
package org.gduf.pk;

public class PkScoringService {
    public static final int DAILY_BASE_CAP = 60;
    public static final int DAILY_STREAK_CAP = 80;
    public static final int MIN_REWARD_QUESTIONS = 10;

    public record Input(
            int playerAScore,
            int playerBScore,
            int playerAHighestStreak,
            int playerBHighestStreak,
            int completedQuestions,
            int playerACurrentPoints,
            int playerBCurrentPoints,
            int dailyBaseAlreadyGained,
            boolean pairRewardLimitReached,
            boolean matchCompleted) {
    }

    public record Settlement(
            int playerAPointsDelta,
            int playerBPointsDelta,
            int playerABaseDelta,
            int playerBBaseDelta,
            int playerAStreakDelta,
            int playerBStreakDelta) {
    }

    public Settlement settle(Input input) {
        boolean allowPositive = input.matchCompleted()
                && input.completedQuestions() >= MIN_REWARD_QUESTIONS
                && !input.pairRewardLimitReached();

        int aBase = baseDelta(input.playerAScore(), input.playerBScore(), allowPositive);
        int bBase = baseDelta(input.playerBScore(), input.playerAScore(), allowPositive);

        if (aBase > 0) {
            aBase = Math.min(aBase, Math.max(0, DAILY_BASE_CAP - input.dailyBaseAlreadyGained()));
        }
        if (bBase > 0) {
            bBase = Math.min(bBase, Math.max(0, DAILY_BASE_CAP - input.dailyBaseAlreadyGained()));
        }

        int aStreak = allowPositive ? streakBonus(input.playerAHighestStreak()) : 0;
        int bStreak = allowPositive ? streakBonus(input.playerBHighestStreak()) : 0;

        int aDelta = floorPenalty(input.playerACurrentPoints(), aBase + aStreak);
        int bDelta = floorPenalty(input.playerBCurrentPoints(), bBase + bStreak);
        return new Settlement(aDelta, bDelta, aBase, bBase, aStreak, bStreak);
    }

    private int baseDelta(int score, int opponentScore, boolean allowPositive) {
        if (score < 0) return score;
        if (!allowPositive) return 0;
        if (score > opponentScore) return score > 0 ? 10 : 0;
        if (score == opponentScore) return score;
        return score > 0 ? score : 0;
    }

    private int streakBonus(int streak) {
        if (streak >= 8) return 8;
        if (streak >= 5) return 4;
        if (streak >= 3) return 2;
        return 0;
    }

    private int floorPenalty(int currentPoints, int delta) {
        if (delta >= 0) return delta;
        return -Math.min(currentPoints, Math.abs(delta));
    }
}
```

- [ ] Run `mvn -q -Dtest=PkScoringServiceTest test`.

Expected: tests pass.

## Task 3: Add PK Persistence

**Files:**
- Create PK entities, mappers, and XML listed in File Structure.
- Modify: `vocabulary/sql/cet6_init.sql`

- [ ] Add SQL tables with unique keys for user stats, daily stats, settings, pair rewards, matches, and answers.
- [ ] Add mapper methods for upsert stats, select arena users, select leaderboard by `day|week|all`, insert match, insert answer, and idempotent settlement.
- [ ] Run `mvn -q -DskipTests package`.

Expected: Java and mapper XML compile successfully.

## Task 4: Add PK REST API

**Files:**
- Create: `vocabulary/src/main/java/org/gduf/service/PkService.java`
- Create: `vocabulary/src/main/java/org/gduf/service/impl/PkServiceImpl.java`
- Create: `vocabulary/src/main/java/org/gduf/controller/PkController.java`

- [ ] Implement `GET /api/pk/arena/users`.
- [ ] Implement `GET /api/pk/settings`.
- [ ] Implement `PUT /api/pk/settings/invisible`.
- [ ] Implement `GET /api/pk/leaderboard?scope=day|week|all`, defaulting to `day`.
- [ ] Implement `GET /api/pk/me`.
- [ ] Run `mvn -q -DskipTests package`.

Expected: build succeeds and REST routes require normal JWT authentication.

## Task 5: Add WebSocket PK Runtime

**Files:**
- Modify: `vocabulary/pom.xml`
- Create: `vocabulary/src/main/java/org/gduf/config/WebSocketConfig.java`
- Create: `vocabulary/src/main/java/org/gduf/pk/PkWebSocketHandler.java`
- Create: `vocabulary/src/main/java/org/gduf/pk/PkMessage.java`
- Create: `vocabulary/src/main/java/org/gduf/pk/PkRoom.java`
- Modify: `vocabulary/src/main/java/org/gduf/security/SecurityConfig.java`

- [ ] Register `/ws/pk`.
- [ ] Authenticate the socket from a `token` query parameter using `JwtUtils`.
- [ ] Track connected users, pending invitations, and active rooms in memory.
- [ ] Enforce 15-second invite cooldown, one pending outgoing invite, 20-second invite expiry, invisibility, offline, and busy checks.
- [ ] Generate 15 mixed CET-6 questions for each room.
- [ ] Make buzz acceptance atomic per question.
- [ ] Submit answer through PK-only logic, not `/api/quiz/answer`.
- [ ] Finish and persist settlement once per match.
- [ ] Run `mvn -q -Dtest=PkScoringServiceTest test` and `mvn -q -DskipTests package`.

Expected: tests and package pass.

## Task 6: Add Frontend PK UI

**Files:**
- Modify: `vocabulary/src/main/resources/static/index.html`
- Copy to: `vocabulary-frontend/index.html`

- [ ] Add `决斗场` button, `隐身` toggle, and PK summary in the CET-6 tab.
- [ ] Add arena modal with online visible users and invite buttons.
- [ ] Add incoming invite modal with accept/reject and countdown.
- [ ] Add match overlay with scores, timer, buzz/answer states, and result transition.
- [ ] Add PK leaderboard tabs with daily selected by default.
- [ ] Add rank 1 gold glowing crown, rank 2 silver crown, and rank 3 bronze crown above avatars.
- [ ] Add JavaScript WebSocket client and handlers for all PK events.
- [ ] Add profile preload: fetch `/api/user/me` on page init, cache it, preload avatar image, render cached data immediately in `我的`.
- [ ] Compare hosted and standalone HTML hashes after copy.

Expected: both frontend files match and no horizontal overflow is introduced.

## Task 7: Validation

**Files:**
- No new files.

- [ ] Run `mvn -q -Dtest=PkScoringServiceTest test` from `vocabulary/`.
- [ ] Run `mvn -q -DskipTests package` from `vocabulary/`.
- [ ] Inspect `git status --short` in both child repositories.
- [ ] If the app can run with local environment variables, start `mvn spring-boot:run` and smoke test login, CET-6 tab, PK leaderboard default daily tab, and `我的` cached rendering.

Expected: tests pass, build passes, changed files are limited to PK/backend/frontend work plus existing untracked `AGENTS.md`.

## Notes For Claude CLI

When delegating large edits to Claude, give it this plan and the design spec. Tell it to:

- Preserve unrelated changes.
- Do not touch `AGENTS.md`.
- Use TDD for `PkScoringService` first.
- Keep PK quiz settlement separate from normal quiz progress.
- Keep daily PK leaderboard as the default.
- Use ASCII in code where possible, but preserve existing Chinese UI text in HTML.
- Run Maven verification before reporting done.
