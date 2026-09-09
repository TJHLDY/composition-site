package site.fanwenjia.translation;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.composition.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class BatchExplanationTest {
    @Test void batchUsesOneCallAndSharesCacheWithManualLookup() {
        var compositions=mock(CompositionService.class);
        var ai=mock(ContextualExplainer.class);
        var user=new CurrentUser(1L,"qa@example.com","QA");
        var first=new SelectionContext(1L,1,"word","Good",0,4,"Good work.");
        var second=new SelectionContext(1L,1,"word","work",5,9,"Good work.");
        when(compositions.resolveSelection(eq(user),eq(1L),any())).thenAnswer(call ->
                ((SelectionRequest)call.getArgument(2)).startOffset()==0?first:second);
        when(ai.isConfigured(user)).thenReturn(true);
        when(ai.explainBatch(List.of(first,second),user)).thenReturn(List.of(
                new ContextualExplanation("好的",null,null),new ContextualExplanation("工作",null,null)));
        var store=mock(GlossaryStore.class);
        var saved=new java.util.HashMap<SelectionContext,ContextualExplanation>();
        when(store.find(any())).thenAnswer(c->java.util.Optional.ofNullable(saved.get(c.getArgument(0))));
        doAnswer(c->{List<SelectionContext> ss=c.getArgument(0);List<ContextualExplanation> aa=c.getArgument(1);
            for(int i=0;i<ss.size();i++) saved.put(ss.get(i),aa.get(i));return null;}).when(store).save(anyList(),anyList());
        var service=new ExplanationService(compositions,ai,store);
        var requests=List.of(new ExplanationRequest(0,4,"word",1),new ExplanationRequest(5,9,"word",1));
        assertThat(service.batch(user,1L,requests)).extracting(ExplanationView::translationZh).containsExactly("好的","工作");
        service.batch(user,1L,requests);
        assertThat(service.explain(user,1L,requests.get(1)).translationZh()).isEqualTo("工作");
        verify(ai,times(1)).explainBatch(anyList(),eq(user));
        verify(ai,never()).explain(any(),any(),anyBoolean());
        assertThatThrownBy(()->service.batch(user,1L,java.util.Collections.nCopies(13,requests.get(0))))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }

    @Test void mapsReorderedIdsAndRejectsMissingOrDuplicateAnswers() {
        var client=new OpenAiCompatibleContextualExplainer(new ObjectMapper(),"test","https://example.invalid","test",0,true,true);
        assertThat(client.parseBatch("{\"items\":[{\"id\":1,\"translationZh\":\"工作\"},{\"id\":0,\"translationZh\":\"好的\"}]}",2))
                .extracting(ContextualExplanation::translationZh).containsExactly("好的","工作");
        assertThatThrownBy(()->client.parseBatch("{\"items\":[{\"id\":0,\"translationZh\":\"好的\"}]}",2)).isInstanceOf(TranslationUnavailableException.class);
        assertThatThrownBy(()->client.parseBatch("{\"items\":[{\"id\":0,\"translationZh\":\"好的\"},{\"id\":0,\"translationZh\":\"工作\"}]}",2)).isInstanceOf(TranslationUnavailableException.class);
    }
}
