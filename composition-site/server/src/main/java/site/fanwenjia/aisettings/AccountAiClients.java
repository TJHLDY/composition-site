package site.fanwenjia.aisettings;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.wordbookai.WordbookAiClient;

@Service
public class AccountAiClients {
    private final AiSettingsService settings;
    private final ObjectMapper mapper;
    public AccountAiClients(AiSettingsService settings,ObjectMapper mapper) { this.settings=settings; this.mapper=mapper; }
    public WordbookAiClient wordbook(CurrentUser user) {
        var c=settings.require(user);
        return new WordbookAiClient(mapper,c.apiKey,c.provider.baseUrl,c.provider.model(),0,true,true);
    }
}
