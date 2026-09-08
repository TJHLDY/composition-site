package site.fanwenjia.aisettings;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(basePackages={"site.fanwenjia.aisettings","site.fanwenjia.dictionary","site.fanwenjia.translation"})
public class AiErrors {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String,String>> error(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(Map.of("message",e.getReason()==null?"请求未完成，请稍后再试。":e.getReason()));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String,String>> invalid() { return ResponseEntity.badRequest().body(Map.of("message","请检查输入格式。")); }
}
