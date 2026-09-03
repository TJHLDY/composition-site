package site.fanwenjia.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank @Email @Size(max = 320) String email,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "验证码应为 6 位数字") String code,
        @NotBlank @Size(min = 8, max = 72, message = "新密码至少 8 位") String newPassword
) {
}
