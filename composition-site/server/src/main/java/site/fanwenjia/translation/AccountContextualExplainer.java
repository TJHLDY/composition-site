package site.fanwenjia.translation;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.composition.SelectionContext;
import site.fanwenjia.aisettings.AiSettingsService;

@Component
public class AccountContextualExplainer implements ContextualExplainer {
    private final AiSettingsService settings;
    private final ObjectMapper mapper;
    private final site.fanwenjia.wordbookai.WordbookAiRateLimiter limiter;
    public AccountContextualExplainer(AiSettingsService settings,ObjectMapper mapper,site.fanwenjia.wordbookai.WordbookAiRateLimiter limiter) {
        this.settings=settings; this.mapper=mapper; this.limiter=limiter;
    }
    @Override public boolean isConfigured() { return false; }
    @Override public boolean isConfigured(CurrentUser user) { settings.require(user); return true; }
    @Override public ContextualExplanation explain(SelectionContext selection,CurrentUser user,boolean learning) {
        var c=settings.require(user);
        limiter.acquire(user.id());
        try {
            return new OpenAiCompatibleContextualExplainer(mapper,c.apiKey,c.provider.baseUrl,c.provider.model(),0,true,true).explain(selection,user,learning);
        } finally { limiter.release(user.id()); }
    }
}
