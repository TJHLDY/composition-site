package site.fanwenjia.translation;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import site.fanwenjia.aisettings.*;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.wordbookai.WordbookAiRateLimiter;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountContextualExplainerTest {
    @Test void releasesSharedLimitAfterAnUpstreamFailure() {
        var settings=mock(AiSettingsService.class);
        var limiter=mock(WordbookAiRateLimiter.class);
        var user=new CurrentUser(1L,"qa@example.com","QA");
        when(settings.require(user)).thenReturn(new AiCredentials(AiProvider.taotoken,"sk-test-only"));
        try (var clients=mockConstruction(OpenAiCompatibleContextualExplainer.class,
                (client, context) -> when(client.explain(null,user,false)).thenThrow(new TranslationUnavailableException()))) {
            var explainer=new AccountContextualExplainer(settings,new ObjectMapper(),limiter);
            assertThatThrownBy(() -> explainer.explain(null,user,false)).isInstanceOf(TranslationUnavailableException.class);
            verify(limiter).acquire(1L);
            verify(limiter).release(1L);
            assertThat(clients.constructed()).hasSize(1);
        }
    }
}
