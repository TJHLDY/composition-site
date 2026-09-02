package site.fanwenjia.auth;

public record AuthResult(String token, UserView user) {
}
