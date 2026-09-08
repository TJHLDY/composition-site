package site.fanwenjia.aisettings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;

@Service
public class AiSettingsService {
    private final UserAiSettingsRepository repository;
    public AiSettingsService(UserAiSettingsRepository repository) { this.repository=repository; }
    public record View(boolean configured, String provider, String maskedKey, String model) {}
    public View view(CurrentUser user) {
        var row=repository.findById(owner(user));
        return row.map(s -> new View(true,s.provider,"••••••••",AiProvider.parse(s.provider).model()))
                .orElse(new View(false,"deepseek","","deepseek-v4-flash"));
    }
    public AiCredentials require(CurrentUser user) {
        var row=repository.findById(owner(user)).orElseThrow(() -> new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,"请先在右上角「AI 设置」配置自己的 API Key。"));
        if (row.apiKey == null || row.apiKey.isBlank()) throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,"请在 AI 设置中保存 API Key。");
        return new AiCredentials(AiProvider.parse(row.provider),row.apiKey);
    }
    public AiCredentials candidate(CurrentUser user, String provider, String apiKey) {
        owner(user);
        AiProvider selected=AiProvider.parse(provider);
        String key=apiKey==null?"":apiKey.strip();
        if(key.isBlank()) {
            AiCredentials stored=require(user);
            if(stored.provider!=selected) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"切换服务商时，请填写该服务商的 API Key。");
            return stored;
        }
        if(!key.matches("[!-~]{10,512}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"API Key 格式不正确，请检查是否复制完整。");
        return new AiCredentials(selected,key);
    }
    @Transactional
    public View save(CurrentUser user, String provider, String key) {
        var credentials=candidate(user,provider,key);
        var row=repository.findById(owner(user)).orElseGet(UserAiSettings::new);
        row.ownerId=user.id(); row.provider=credentials.provider.name(); row.apiKey=credentials.apiKey; row.encryptedKey="";
        repository.save(row);
        return new View(true,row.provider,"••••••••",credentials.provider.model());
    }
    @Transactional public void delete(CurrentUser user) { repository.deleteById(owner(user)); }
    private Long owner(CurrentUser user) {
        if(user==null || user.id()==null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请先登录。");
        return user.id();
    }
}
