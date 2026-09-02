# Standalone Composition Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independently deployable Spring Boot service that owns user accounts, essays, and essay-local word/phrase notes for the approved composition site.

**Architecture:** `composition-site/server` is a new Spring Boot application with its own database and opaque bearer-session authentication. The existing root-level front-end files remain the only front-end source; the Maven resource configuration packages those exact files into the JAR's static root, preventing a mirrored source file. JPA entities own account, session, composition, and annotation data; controllers derive the current user only from Spring Security authentication.

**Tech Stack:** Java 17 bytecode target on the available Maven JDK, Spring Boot 3.5.11, Spring Web, Spring Security, Spring Data JPA, Bean Validation, H2 for local development, MySQL Connector/J for production, JUnit 5, MockMvc.

---

## File map

| File | Responsibility |
|---|---|
| `composition-site/server/pom.xml` | Independent Maven module; packages the one root-level front-end source directory as static resources. |
| `composition-site/server/src/main/java/site/fanwenjia/CompositionSiteApplication.java` | Spring Boot entry point. |
| `.../config/SecurityConfig.java` | Stateless HTTP security, password hashing, public route allowlist, authentication filter registration. |
| `.../auth/UserAccount.java`, `UserSession.java` | Independent account/session persistence. |
| `.../auth/UserAccountRepository.java`, `UserSessionRepository.java` | User and hashed-token lookup. |
| `.../auth/AuthService.java`, `AuthController.java`, `BearerSessionFilter.java` | Registration, login, logout, current-user response, opaque bearer-session authentication. |
| `.../composition/Composition.java`, `CompositionAnnotation.java` | Essay and essay-local annotation persistence. |
| `.../composition/CompositionRepository.java`, `CompositionAnnotationRepository.java` | Ownership-scoped reads and recent list ordering. |
| `.../composition/CompositionService.java`, `CompositionController.java` | Validated create/list/read and confirmed-note save APIs. |
| `composition-site/server/src/main/resources/application.yml` | Local standalone H2 database and server configuration. |
| `composition-site/server/src/main/resources/application-mysql.yml` | MySQL production profile using environment variables only. |
| `composition-site/server/src/test/java/site/fanwenjia/auth/AuthServiceTest.java` | Independent auth behavior tests. |
| `composition-site/server/src/test/java/site/fanwenjia/composition/CompositionServiceTest.java` | Essay ownership, ordering, range, and annotation behavior tests. |
| `composition-site/server/src/test/java/site/fanwenjia/CompositionApiTest.java` | HTTP contract tests for public/protected routes. |
| `composition-site/README.md` | Add backend startup command and explicitly mark front-end local-storage mode as temporary until API wiring. |

## Task 1: Bootstrap the independent application

**Files:**
- Create: `composition-site/server/pom.xml`
- Create: `composition-site/server/src/main/java/site/fanwenjia/CompositionSiteApplication.java`
- Create: `composition-site/server/src/main/resources/application.yml`
- Test: `composition-site/server/src/test/java/site/fanwenjia/CompositionSiteApplicationTest.java`

- [ ] **Step 1: Write the failing boot test**

```java
@SpringBootTest
class CompositionSiteApplicationTest {
  @Test
  void startsWithItsOwnLocalDatabase() {
    assertThat(context).isNotNull();
  }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `mvn -f composition-site/server/pom.xml -Dtest=CompositionSiteApplicationTest test`

Expected: Maven reports that `pom.xml` or the test application context does not exist.

- [ ] **Step 3: Add the smallest executable Spring Boot module**

```xml
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.5.11</version>
</parent>
<properties><java.version>17</java.version></properties>
<dependencies>
  <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
  <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-validation</artifactId></dependency>
  <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-security</artifactId></dependency>
  <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
  <dependency><groupId>com.h2database</groupId><artifactId>h2</artifactId><scope>runtime</scope></dependency>
  <dependency><groupId>com.mysql</groupId><artifactId>mysql-connector-j</artifactId><scope>runtime</scope></dependency>
  <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>
</dependencies>
```

`application.yml` uses `jdbc:h2:file:./data/fanwenjia;MODE=MySQL;DB_CLOSE_ON_EXIT=FALSE`, `ddl-auto: update`, `server.port: 8088`, and `spring.jpa.open-in-view: false`. `AUTO_SERVER` is intentionally absent because the standalone service is a single process and H2 does not support that option together with this shutdown setting.

- [ ] **Step 4: Verify the boot test passes**

Run: `mvn -f composition-site/server/pom.xml -Dtest=CompositionSiteApplicationTest test`

Expected: `BUILD SUCCESS`.

## Task 2: Add independent opaque-session authentication

**Files:**
- Create: `.../auth/UserAccount.java`
- Create: `.../auth/UserSession.java`
- Create: `.../auth/UserAccountRepository.java`
- Create: `.../auth/UserSessionRepository.java`
- Create: `.../auth/AuthService.java`
- Create: `.../auth/AuthController.java`
- Create: `.../auth/BearerSessionFilter.java`
- Create: `.../config/SecurityConfig.java`
- Test: `.../auth/AuthServiceTest.java`

- [ ] **Step 1: Write failing service tests**

```java
@Test
void registerHashesPasswordAndReturnsOpaqueToken() {
  AuthResult result = authService.register(new RegisterCommand("reader@example.com", "StrongPass123", "Reader"));
  assertThat(result.token()).isNotBlank();
  assertThat(userRepository.findByEmail("reader@example.com").orElseThrow().getPasswordHash()).doesNotContain("StrongPass123");
}

@Test
void loginRejectsWrongPassword() {
  authService.register(new RegisterCommand("reader@example.com", "StrongPass123", "Reader"));
  assertThatThrownBy(() -> authService.login(new LoginCommand("reader@example.com", "wrong-pass")))
      .isInstanceOf(UnauthorizedException.class);
}
```

- [ ] **Step 2: Run only auth tests and verify red**

Run: `mvn -f composition-site/server/pom.xml -Dtest=AuthServiceTest test`

Expected: compilation failure because `AuthService`, commands, and repositories do not exist.

- [ ] **Step 3: Implement the limited auth contract**

`UserAccount` holds `id`, normalized lowercase `email`, `displayName`, `passwordHash`, and timestamps. `UserSession` holds a SHA-256 token hash, owning user, creation timestamp, and expiration timestamp. `AuthService` uses `BCryptPasswordEncoder`, a 32-byte `SecureRandom` token encoded with URL-safe Base64 without padding, and a 30-day expiry. It stores only the SHA-256 hash, never the raw bearer token.

```java
public record AuthResult(String token, UserView user) {}
public record CurrentUser(Long id, String email, String displayName) {}
```

`BearerSessionFilter` accepts only `Authorization: Bearer <token>`, hashes the token, rejects expired sessions, and places `CurrentUser` into a `UsernamePasswordAuthenticationToken`. `SecurityConfig` allows `POST /api/auth/register`, `POST /api/auth/login`, and static files; all other `/api/**` endpoints require authentication. `POST /api/auth/logout` deletes only the current token hash.

- [ ] **Step 4: Verify green**

Run: `mvn -f composition-site/server/pom.xml -Dtest=AuthServiceTest test`

Expected: `BUILD SUCCESS` and no plaintext password in persisted user test data.

## Task 3: Add owned composition CRUD

**Files:**
- Create: `.../composition/Composition.java`
- Create: `.../composition/CompositionRepository.java`
- Create: `.../composition/CompositionService.java`
- Create: `.../composition/CompositionController.java`
- Test: `.../composition/CompositionServiceTest.java`

- [ ] **Step 1: Write failing ownership and ordering tests**

```java
@Test
void listReturnsOnlyTheCurrentUsersEssaysNewestFirst() {
  compositionService.create(ownerA, new CreateCompositionCommand("Older", null, "One"));
  compositionService.create(ownerB, new CreateCompositionCommand("Private", null, "Two"));
  CompositionView newest = compositionService.create(ownerA, new CreateCompositionCommand("Newest", "2026 年英语二 · 第 1 套", "Three"));

  assertThat(compositionService.list(ownerA)).extracting(CompositionListItem::title).containsExactly(newest.title(), "Older");
}

@Test
void readDoesNotDiscloseAnotherUsersComposition() {
  CompositionView privateEssay = compositionService.create(ownerB, new CreateCompositionCommand("Private", null, "Text"));
  assertThatThrownBy(() -> compositionService.read(ownerA, privateEssay.id())).isInstanceOf(NotFoundException.class);
}
```

- [ ] **Step 2: Verify red**

Run: `mvn -f composition-site/server/pom.xml -Dtest=CompositionServiceTest test`

Expected: compilation failure because the composition service API does not exist.

- [ ] **Step 3: Implement exact fields and routes**

`Composition` has `id`, `owner`, `title` (1–200 chars), nullable `sourceLabel` (0–100), `content` (1–100000), `contentVersion` defaulting to 1, and audit timestamps. Repository lookup methods always include `ownerId`.

```text
GET  /api/compositions                 -> [CompositionListItem]
POST /api/compositions                 -> CompositionView (201)
GET  /api/compositions/{compositionId} -> CompositionView
```

The controller gets `CurrentUser` through `@AuthenticationPrincipal`; request JSON has no `userId` field. Invalid title/content returns a validation 400; an unowned id returns the same 404 as a missing id.

- [ ] **Step 4: Verify green**

Run: `mvn -f composition-site/server/pom.xml -Dtest=CompositionServiceTest test`

Expected: `BUILD SUCCESS` with ownership and newest-first ordering assertions passing.

## Task 4: Add confirmed essay-local notes

**Files:**
- Create: `.../composition/CompositionAnnotation.java`
- Create: `.../composition/CompositionAnnotationRepository.java`
- Modify: `.../composition/CompositionService.java`
- Modify: `.../composition/CompositionController.java`
- Test: `.../composition/CompositionServiceTest.java`

- [ ] **Step 1: Add failing range and ownership cases**

```java
@Test
void annotationMustMatchTheStoredRangeAndBelongToTheCurrentUser() {
  CompositionView composition = compositionService.create(ownerA, new CreateCompositionCommand("T", null, "A meaningful contribution matters."));
  SaveAnnotationCommand valid = new SaveAnnotationCommand(2, 12, "phrase", "有意义的", "搭配记忆", composition.contentVersion());

  assertThat(compositionService.saveAnnotation(ownerA, composition.id(), valid).selectedText()).isEqualTo("meaningful");
  assertThatThrownBy(() -> compositionService.saveAnnotation(ownerB, composition.id(), valid)).isInstanceOf(NotFoundException.class);
}
```

- [ ] **Step 2: Verify red**

Run: `mvn -f composition-site/server/pom.xml -Dtest=CompositionServiceTest test`

Expected: compilation failure because annotation types and `saveAnnotation` do not exist.

- [ ] **Step 3: Implement explicit note persistence**

`CompositionAnnotation` contains `composition`, `owner`, `contentVersion`, derived `selectedText`, `startOffset`, `endOffset`, enum-like `kind` (`word` or `phrase`), optional `translationZh`, optional user `note`, and timestamps. `CompositionService` rejects stale versions, invalid bounds, ranges whose substring differs from the expected derived text, and kinds outside the two allowed values. The unique constraint is `(composition_id, content_version, start_offset, end_offset)`; a repeat save updates the existing annotation rather than duplicating it.

```text
POST /api/compositions/{compositionId}/annotations -> AnnotationView (201 or 200 when same range is updated)
DELETE /api/compositions/{compositionId}/annotations/{annotationId} -> 204
```

- [ ] **Step 4: Verify green**

Run: `mvn -f composition-site/server/pom.xml -Dtest=CompositionServiceTest test`

Expected: `BUILD SUCCESS`; a note cannot be created for another account's essay and all stored selected text is server-derived.

## Task 5: Package the one front-end source and verify HTTP boundaries

**Files:**
- Modify: `composition-site/server/pom.xml`
- Modify: `composition-site/README.md`
- Test: `composition-site/server/src/test/java/site/fanwenjia/CompositionApiTest.java`

- [ ] **Step 1: Write failing MockMvc security/static-resource tests**

```java
@Test
void servesTheOnlyFrontendSourceAndProtectsEssayApi() throws Exception {
  mockMvc.perform(get("/")).andExpect(status().isOk()).andExpect(content().string(containsString("范文夹")));
  mockMvc.perform(get("/api/compositions")).andExpect(status().isUnauthorized());
}
```

- [ ] **Step 2: Verify red**

Run: `mvn -f composition-site/server/pom.xml -Dtest=CompositionApiTest test`

Expected: static page cannot yet be served from the standalone JAR or API security is incomplete.

- [ ] **Step 3: Configure resource packaging and production profile**

The `pom.xml` resource block includes only `../index.html`, `../styles.css`, `../app.js`, and `../essay-utils.js` with target path `static`, so the source remains singular. `application-mysql.yml` accepts only `COMPOSITION_DB_URL`, `COMPOSITION_DB_USERNAME`, and `COMPOSITION_DB_PASSWORD` environment variables. It never embeds a password, model credential, or an existing VocabNote datasource.

- [ ] **Step 4: Verify green and package**

Run: `mvn -f composition-site/server/pom.xml test`

Expected: `BUILD SUCCESS`.

Run: `mvn -f composition-site/server/pom.xml package`

Expected: a standalone executable JAR under `composition-site/server/target/`.

## Deferred after this plan

- Wire the approved front-end local-storage adapter to the authenticated API once the server endpoints pass.
- Add the GLM-5.2 contextual explainer behind a provider interface, environment-only key, strict JSON parsing, rate limits, caching, and direct-translation fallback.
- Add password reset/email verification and production rate-limit persistence before public launch.

## Self-review

- Spec coverage: independent source/deployment (Tasks 1 and 5), independent accounts (Task 2), owned essays (Task 3), essay-local word/phrase notes (Task 4), and no credential leakage (Tasks 2 and 5).
- Intentional gap: live translation/GLM is deferred because the front-end is still in review and the provider key must stay server-side; the product contract for it is already recorded in the standalone design.
- Type consistency: `CurrentUser`, `CompositionView`, `CompositionListItem`, `CreateCompositionCommand`, `SaveAnnotationCommand`, and `AnnotationView` are introduced in the task that owns their service/controller use.
- Placeholder scan: no unbounded implementation placeholders or client-supplied ownership fields are permitted by this plan.
