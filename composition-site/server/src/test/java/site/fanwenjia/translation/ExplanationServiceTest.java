package site.fanwenjia.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import site.fanwenjia.auth.AuthResult;
import site.fanwenjia.auth.AuthService;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.auth.RegisterRequest;
import site.fanwenjia.auth.VerificationCodeStore;
import site.fanwenjia.auth.VerificationPurpose;
import site.fanwenjia.composition.CompositionService;
import site.fanwenjia.composition.CompositionView;
import site.fanwenjia.composition.CreateCompositionRequest;
import java.time.Duration;
import java.util.Arrays;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:explanation-service-test;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Transactional
class ExplanationServiceTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private CompositionService compositionService;

    @Autowired
    private ExplanationService explanationService;
    @Autowired private GlossaryStore glossaryStore;
    @Autowired private jakarta.persistence.EntityManager entityManager;

    @Autowired
    private VerificationCodeStore verificationCodeStore;

    @MockBean
    private ContextualExplainer contextualExplainer;

    @Test
    void retainsTheLegacyLearningTextContractWithoutExposingItToNewPhraseRecording() {
        assertThat(Arrays.stream(ExplanationRequest.class.getRecordComponents())
                .map(component -> component.getName()))
                .contains("generateLearningText");
        assertThat(Arrays.stream(ContextualExplanation.class.getRecordComponents())
                .map(component -> component.getName()))
                .contains("learningText");
        assertThat(Arrays.stream(ExplanationView.class.getRecordComponents())
                .map(component -> component.getName()))
                .contains("learningText");
    }

    @Test
    void derivesTheSelectedTextServerSideAndCachesTheContextualExplanation() {
        CurrentUser reader = register("reader@example.com", "Reader");
        CompositionView composition = compositionService.create(
                reader,
                new CreateCompositionRequest("T", null, "A meaningful contribution matters.")
        );
        when(contextualExplainer.isConfigured(any(CurrentUser.class))).thenReturn(true);
        when(contextualExplainer.explain(any(), eq(reader), eq(false))).thenReturn(new ContextualExplanation(
                "有意义的；有价值的",
                "可用于强调某件事的价值或影响。"
        ));
        ExplanationRequest request = new ExplanationRequest(2, 12, "word", composition.contentVersion());

        ExplanationView first = explanationService.explain(reader, composition.id(), request);
        ExplanationView second = explanationService.explain(reader, composition.id(), request);

        assertThat(first.selectedText()).isEqualTo("meaningful");
        assertThat(first.translationZh()).isEqualTo("有意义的；有价值的");
        assertThat(second).isEqualTo(first);
        verify(contextualExplainer, times(1)).explain(any(), eq(reader), eq(false));
    }

    @Test
    void treatsLegacyEnhancedPhraseRequestsAsOrdinaryCachedTranslations() {
        CurrentUser reader = register("collocation@example.com", "Collocation Reader");
        CompositionView composition = compositionService.create(
                reader,
                new CreateCompositionRequest("T", null, "Combining practical experience with academic study helps students.")
        );
        when(contextualExplainer.isConfigured(any(CurrentUser.class))).thenReturn(true);
        when(contextualExplainer.explain(any(), eq(reader), eq(false))).thenReturn(new ContextualExplanation(
                "把实践经验与学术学习结合起来",
                "普通释义",
                null
        ));
        when(contextualExplainer.explain(any(), eq(reader), eq(true))).thenReturn(new ContextualExplanation(
                "不应返回的搭配释义",
                "不应返回的搭配提示",
                "combining … with"
        ));
        ExplanationRequest basicRequest = new ExplanationRequest(0, 35, "phrase", composition.contentVersion(), false);
        ExplanationRequest enhancedRequest = new ExplanationRequest(0, 35, "phrase", composition.contentVersion(), true);

        ExplanationView basic = explanationService.explain(reader, composition.id(), basicRequest);
        ExplanationView legacyEnhanced = explanationService.explain(reader, composition.id(), enhancedRequest);
        ExplanationView legacyEnhancedAgain = explanationService.explain(reader, composition.id(), enhancedRequest);

        assertThat(basic.learningText()).isNull();
        assertThat(legacyEnhanced).isEqualTo(basic);
        assertThat(legacyEnhancedAgain).isEqualTo(basic);
        verify(contextualExplainer, times(1)).explain(any(), eq(reader), eq(false));
    }

    @Test
    void persistsAllSelectionsBeyondTheOldMemoryLimitAndReadsWithANewServiceWithoutAi() {
        CurrentUser reader = register("cache-bound@example.com", "Cache Bound");
        String content = String.join(" ", Collections.nCopies(520, "a"));
        CompositionView composition = compositionService.create(
                reader,
                new CreateCompositionRequest("T", null, content)
        );
        when(contextualExplainer.isConfigured(any(CurrentUser.class))).thenReturn(true);
        when(contextualExplainer.explain(any(), eq(reader), eq(false))).thenReturn(new ContextualExplanation(
                "甲",
                null
        ));

        for (int index = 0; index < 520; index += 1) {
            int startOffset = index * 2;
            explanationService.explain(
                    reader,
                    composition.id(),
                    new ExplanationRequest(startOffset, startOffset + 1, "word", composition.contentVersion())
            );
        }

        entityManager.flush();entityManager.clear();
        var progress=glossaryStore.progress(reader,composition.id(),0);
        assertThat(progress.results()).hasSize(520);
        when(contextualExplainer.isConfigured(any(CurrentUser.class))).thenReturn(false);
        var restarted=new ExplanationService(compositionService,contextualExplainer,glossaryStore);
        assertThat(restarted.explain(reader,composition.id(),new ExplanationRequest(0,1,"word",1)).translationZh()).isEqualTo("甲");
        verify(contextualExplainer,times(520)).explain(any(),eq(reader),eq(false));
    }

    @Test
    void reportsARecoverableUnavailableStateWhenNoProviderKeyIsConfigured() {
        CurrentUser reader = register("reader@example.com", "Reader");
        CompositionView composition = compositionService.create(
                reader,
                new CreateCompositionRequest("T", null, "A meaningful contribution matters.")
        );
        when(contextualExplainer.isConfigured(any(CurrentUser.class))).thenReturn(false);

        assertThatThrownBy(() -> explanationService.explain(
                reader,
                composition.id(),
                new ExplanationRequest(2, 12, "word", composition.contentVersion())
        )).isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("语境翻译暂不可用");
    }

    private CurrentUser register(String email, String displayName) {
        String code = verificationCodeStore.issue(VerificationPurpose.REGISTER, email, Duration.ofMinutes(5));
        AuthResult result = authService.register(new RegisterRequest(email, "StrongPass123", displayName, code));
        return new CurrentUser(result.user().id(), result.user().email(), result.user().displayName());
    }

}
