package site.fanwenjia.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:auth-service-test;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Transactional
class AuthServiceTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Test
    void registerHashesPasswordAndReturnsOpaqueToken() {
        AuthResult result = authService.register(new RegisterRequest(
                "reader@example.com",
                "StrongPass123",
                "Reader"
        ));

        UserAccount user = userAccountRepository.findByEmail("reader@example.com").orElseThrow();
        assertThat(result.token()).isNotBlank();
        assertThat(user.getPasswordHash()).doesNotContain("StrongPass123");
        assertThat(authService.currentUser(result.token()))
                .contains(new CurrentUser(user.getId(), "reader@example.com", "Reader"));
    }

    @Test
    void loginRejectsWrongPassword() {
        authService.register(new RegisterRequest("reader@example.com", "StrongPass123", "Reader"));

        assertThatThrownBy(() -> authService.login(new LoginRequest("reader@example.com", "wrong-password")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("邮箱或密码不正确");
    }
}
