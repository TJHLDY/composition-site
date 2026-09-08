package site.fanwenjia.auth;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/** Never echo or log rejected password/code values through default validation handlers. */
@RestControllerAdvice(basePackageClasses = AuthController.class)
public class AuthErrors {
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<Map<String,String>> invalidInput() {
        return ResponseEntity.badRequest().body(Map.of("message", "请检查邮箱、密码及验证码的格式和长度。"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String,String>> statusError(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message",
                error.getReason() == null ? "操作未完成，请稍后重试。" : error.getReason()));
    }
}
