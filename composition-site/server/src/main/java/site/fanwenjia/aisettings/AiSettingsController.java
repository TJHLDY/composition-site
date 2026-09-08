package site.fanwenjia.aisettings;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.wordbookai.*;

@RestController
@RequestMapping("/api/ai-settings")
public class AiSettingsController {
    private final AiSettingsService settings;
    private final ObjectMapper mapper;
    private final WordbookAiRateLimiter limiter;
    private final HttpClient http=AiHttpTransport.CLIENT;
    public AiSettingsController(AiSettingsService settings,ObjectMapper mapper,WordbookAiRateLimiter limiter) { this.settings=settings; this.mapper=mapper; this.limiter=limiter; }
    public record Input(String provider,String apiKey) { @Override public String toString() { return "AiSettingsInput[redacted]"; } }
    @GetMapping public AiSettingsService.View read(@AuthenticationPrincipal CurrentUser user) { return settings.view(user); }
    @PutMapping public AiSettingsService.View save(@AuthenticationPrincipal CurrentUser user,@RequestBody Input body) { return settings.save(user,body.provider(),body.apiKey()); }
    @DeleteMapping @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@AuthenticationPrincipal CurrentUser user) { settings.delete(user); }
    @PostMapping("/test") public Map<String,String> test(@AuthenticationPrincipal CurrentUser user,@RequestBody Input body) {
        AiCredentials c=settings.candidate(user,body.provider(),body.apiKey());
        limiter.acquire(user.id());
        try {
            var payload=Map.of("model",c.provider.model(),"max_tokens",64,"thinking",Map.of("type","disabled"),
                    "messages",List.of(Map.of("role","user","content","Reply with OK only.")));
            var request=HttpRequest.newBuilder(URI.create(c.provider.baseUrl+"/chat/completions"))
                    .timeout(Duration.ofSeconds(18)).header("Authorization","Bearer "+c.apiKey).header("Content-Type","application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload))).build();
            var pending=http.sendAsync(request,ignored -> new WordbookAiClient.BoundedBodySubscriber());
            try {
                var result=pending.get(18,TimeUnit.SECONDS);
                if(result.statusCode()==401 || result.statusCode()==403) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"密钥无效或没有模型权限，请核对服务商与 Key。");
                if(result.statusCode()==402) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"服务商账户余额不足，请到官网检查。");
                if(result.statusCode()==429) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"服务商暂时限流，请稍后再试。");
                if(result.statusCode()!=200 || mapper.readTree(result.body()).at("/choices/0/message/content").asText("").isBlank())
                    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"服务商暂时无法完成测试，请检查额度、模型权限或稍后再试。");
                return Map.of("message","连接成功，可以保存配置。", "model",c.provider.model());
            } finally { if(!pending.isDone()) pending.cancel(true); }
        } catch(ResponseStatusException e) { throw e; }
        catch(InterruptedException e) { Thread.currentThread().interrupt(); throw unavailable(); }
        catch(Exception e) { throw unavailable(); }
        finally { limiter.release(user.id()); }
    }
    private ResponseStatusException unavailable() { return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"连接未成功，请检查网络或稍后重试。"); }
}
