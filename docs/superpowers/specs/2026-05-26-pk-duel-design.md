# CET-6 PK Duel Design

## Goal

Add a real-time PK duel mode inside the CET-6 quiz tab. Users can enter a duel arena, see available online users, invite one opponent, and play a strict buzz-in quiz match where the first player to buzz gets the only answer attempt for that question.

The feature should make CET-6 practice more exciting while keeping scoring fair, preventing invite spam, and avoiding easy point farming.

## Existing Context

- Backend is Spring Boot under `vocabulary/`.
- Frontend is vanilla HTML/CSS/JS under both `vocabulary/src/main/resources/static/` and `vocabulary-frontend/`.
- CET-6 quiz generation already exists under `/api/quiz`.
- Online activity is currently tracked in memory with `JwtAuthFilter.LAST_ACTIVE`.
- The quiz tab already has a leaderboard area and mixed quiz mode.
- User profile data and avatars are loaded from `/api/user/me`.

## Gameplay

### Arena Entry

The CET-6 tab adds:

- A `决斗场` button to open the PK arena.
- An `隐身` toggle.

Visible users appear in the arena when all are true:

- They are online based on recent backend activity.
- They are not the current user.
- Their PK invisibility setting is off.
- Their account is enabled.

Invisible users can still open the arena and invite others, but they cannot be invited and should not appear in the arena list.

### Invitation Rules

- A user can send only one PK invitation every 15 seconds.
- A user can have only one pending outgoing invitation at a time.
- An invitation expires after 20 seconds.
- The invited user receives an accept/reject prompt if they are online and visible.
- If accepted, both users enter the same PK room.
- If rejected, expired, offline, invisible, or already in a PK room, the inviter sees a clear status message.

### Match Rules

- One match has 15 questions.
- Questions use mixed CET-6 mode.
- Each question has a 15-second buzz-in window.
- The backend is authoritative for who buzzed first.
- Only the first buzzer can answer the question.
- Correct answer: `+1` match score.
- Wrong answer: `-1` match score.
- Non-buzzer: `0` for that question.
- If nobody buzzes within 15 seconds, the question is skipped and both users get `0`.
- Match scores may be negative.
- The winner is the player with the higher final match score.
- Equal final score is a draw.

PK answer submission should not update normal CET-6 learning progress or normal quiz daily stats. PK should have its own records and scoring tables.

## Scoring

Scoring is split into match score, base PK points, and streak bonus points.

### Match Score

For each player:

```text
1 for each correct buzz-in answer
-1 for each wrong buzz-in answer
0 for questions not answered by that player
```

### Base PK Points

Base PK points are affected by the daily base cap.

Rules:

- Winner with positive match score: `+10` base points.
- Winner with zero or negative match score: no winner base reward, but streak bonuses can still apply.
- Loser with positive match score: `+matchScore` base points.
- Loser with zero match score: `0`.
- Loser with negative match score: deduct `abs(matchScore)` points.
- Draw: each player settles by their own match score, without winner `+10`.
- Total PK points cannot go below `0`.
- Daily base PK points cap is `60`.
- After a user reaches the daily base cap, they can keep playing, but positive base points become `0`.
- Negative base points still deduct even after the daily base cap is reached.

### Streak Bonus

Streak bonus rewards consecutive correct buzz-in answers by the same player.

- 3-streak: `+2`
- 5-streak: `+4`
- 8-streak: `+8`
- Only the highest tier in a match applies.
- Streak bonus does not count against the daily base cap.
- Daily streak bonus cap is `80`.
- A wrong answer breaks the player's streak.
- Questions skipped by both players do not break a player's streak.
- Questions answered by the opponent do not break the non-answering player's streak.

### Valid Reward Conditions

- A match must complete at least 10 questions before positive rewards are issued.
- If a user quits or disconnects for more than 20 seconds, they are treated as having forfeited.
- If at least 10 questions have been completed, the non-forfeiting opponent may receive normal settlement.
- If fewer than 10 questions have been completed, positive rewards are not issued, but negative penalties from answered wrong questions may still apply.
- The same pair of users can receive positive PK rewards for at most 3 matches per day. After that, matches still work and are recorded, but positive base and streak rewards for that pair become `0`.

## Leaderboard

PK gets its own leaderboard, separate from normal CET-6 quiz rankings.

Default tab: daily leaderboard.

Leaderboard scopes:

- Daily
- Weekly
- All-time

Rows include:

- Rank
- Avatar
- Username
- PK total points
- Wins
- Losses
- Win rate
- Highest streak
- Points gained today

Sorting:

```text
PK points DESC
wins DESC
win rate DESC
highest streak DESC
user_id ASC
```

Top-three visual treatment:

- Rank 1: gold crown above avatar, glowing effect, gold avatar border.
- Rank 2: silver crown above avatar, silver avatar border.
- Rank 3: bronze crown above avatar, bronze avatar border.
- Other ranks use normal rank numbers.

## Backend Design

### Transport

Use WebSocket for real-time events:

- Presence updates for duel arena.
- Incoming invite prompt.
- Invite accepted/rejected/expired.
- Room start.
- New question.
- Buzz result.
- Answer result.
- Score update.
- Match finished.
- Opponent disconnect/forfeit.

Use REST for durable state:

- Get arena users.
- Toggle invisibility.
- Get PK leaderboard.
- Get current user PK summary.

Match history is out of scope for the first implementation.

### Suggested Endpoints

REST:

```text
GET /api/pk/arena/users
GET /api/pk/settings
PUT /api/pk/settings/invisible
GET /api/pk/leaderboard?scope=day|week|all
GET /api/pk/me
```

WebSocket events:

```text
pk.invite.send
pk.invite.incoming
pk.invite.accept
pk.invite.reject
pk.invite.expired
pk.room.started
pk.question.started
pk.buzz
pk.buzz.result
pk.answer.submit
pk.answer.result
pk.score.updated
pk.match.finished
pk.opponent.left
```

### Suggested Tables

`pk_user_stats`

- `user_id`
- `points`
- `wins`
- `losses`
- `draws`
- `matches`
- `highest_streak`
- `updated_at`

`pk_daily_stats`

- `user_id`
- `stat_date`
- `base_points_gained`
- `streak_points_gained`
- `net_points`
- `wins`
- `losses`
- `draws`
- `matches`
- `highest_streak`

`pk_match`

- `id`
- `player_a_id`
- `player_b_id`
- `winner_user_id`
- `status`
- `questions_total`
- `questions_completed`
- `player_a_score`
- `player_b_score`
- `player_a_points_delta`
- `player_b_points_delta`
- `started_at`
- `finished_at`

`pk_match_answer`

- `id`
- `match_id`
- `question_index`
- `cet_word_id`
- `buzz_user_id`
- `answer_user_id`
- `chosen`
- `correct`
- `score_delta`
- `answered_at`

`pk_user_setting`

- `user_id`
- `invisible`
- `updated_at`

`pk_pair_daily_reward`

- `user_low_id`
- `user_high_id`
- `reward_date`
- `rewarded_matches`

The pair table should store user IDs in sorted order so `(A, B)` and `(B, A)` count as the same daily pair.

## Frontend Design

### CET-6 Tab

Add a compact PK area near the existing quiz start controls:

- `决斗场` button.
- `隐身` toggle.
- Small current PK points indicator.

### Arena Modal

Arena shows:

- Online visible users.
- Avatar and username.
- Current PK points.
- Invite button.
- Cooldown state after sending an invite.

### Incoming Invite Prompt

The invited user sees:

- Inviter avatar and username.
- Accept button.
- Reject button.
- 20-second countdown.

### Match UI

Match view shows:

- Both players' avatars, names, and current match score.
- Question index and timer.
- Prompt and answer options.
- Buzz button or option-button buzz behavior.
- Status text for who buzzed first.
- Answer result and next-question transition.

The backend remains authoritative for first buzz and scoring.

### PK Leaderboard UI

Add PK leaderboard with daily scope selected by default.

- Daily, weekly, all-time tabs.
- Rank, avatar, username, points, win rate, highest streak.
- Crown visuals for rank 1, 2, and 3.

## Profile Load Optimization

The `我的` tab should feel instant after login.

Frontend initialization should:

- Fetch `/api/user/me` as soon as the main page loads with a valid token.
- Store the result in a memory cache.
- Preload `avatarUrl` with `new Image()`.
- Render top-level username/avatar from the same cache.
- When the user opens `我的`, render cached data immediately.
- Refresh `/api/user/me` in the background and update the view when it returns.
- Use a default avatar or first-letter avatar while the real avatar is loading.

This should reduce perceived delay when the slowness is caused by remote avatar loading.

## Error Handling

- If WebSocket disconnects during arena browsing, show reconnecting state.
- If WebSocket disconnects during a match, try reconnecting briefly.
- If reconnection fails for 20 seconds during a match, count as forfeit.
- If a user tries to invite an invisible/offline/busy user, show a clear message.
- If the backend rejects a buzz because another player buzzed first, disable answer options for the rejected user for that question.
- Settlement should be idempotent so refreshing or duplicate finish events cannot double-award points.

## Testing

Backend:

- Invite cooldown and expiration.
- Invisible users excluded from arena users.
- First-buzz race resolves to one user only.
- Correct/wrong scoring.
- Winner, loser, draw settlement.
- Daily base cap of 60.
- Daily streak cap of 80.
- Total points floor at 0.
- Same-pair daily reward limit.
- Idempotent match settlement.

Frontend:

- Arena list renders online users and invite states.
- Incoming invite prompt accept/reject/timeout.
- Match screen handles buzz win, buzz loss, correct answer, wrong answer, skipped question.
- Daily leaderboard is default.
- Top-three crowns render with correct color and first-place glow.
- `我的` tab renders cached profile before background refresh completes.

## Implementation Note

For large mechanical code edits, use the local Claude CLI to draft changes where possible, then review, patch, build, and verify manually before considering the task complete.
