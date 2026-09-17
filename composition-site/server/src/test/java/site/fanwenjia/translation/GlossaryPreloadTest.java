package site.fanwenjia.translation;

import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.*;
import site.fanwenjia.composition.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:glossary-test;MODE=MySQL;DB_CLOSE_DELAY=-1","spring.jpa.hibernate.ddl-auto=create-drop"})
@Transactional
class GlossaryPreloadTest {
    @Autowired CompositionService compositions;
    @Autowired UserAccountRepository users;
    @Autowired GlossaryStore store;
    @Autowired GlossaryJobRepository jobs;
    @Autowired StoredExplanationRepository entries;
    @Autowired ExplanationService explanations;
    @Autowired jakarta.persistence.EntityManager em;
    @MockBean ContextualExplainer ai;
    CurrentUser user() {
        var u=users.save(new UserAccount(UUID.randomUUID()+"@example.invalid","QA","!disabled"));
        return new CurrentUser(u.getId(),u.getEmail(),u.getDisplayName());
    }
    void workingAi() {
        when(ai.isConfigured(any(CurrentUser.class))).thenReturn(true);
        doAnswer(call->{
            List<SelectionContext> selections=call.getArgument(0);
            return selections.stream().map(s->new ContextualExplanation("释义："+s.selectedText(),"提示",null)).toList();
        }).when(ai).explainBatch(anyList(),any());
    }
    @Test void saveEnqueuesAndWorkerPersistsWithoutAnOpenPage() {
        var user=user();workingAi();
        var essay=compositions.create(user,new CreateCompositionRequest("Auto",null,"Good work."));
        assertThat(jobs.findById(essay.id()).orElseThrow().status).isEqualTo("queued");
        new GlossaryWorker(store,explanations).runNext();
        em.flush();em.clear();
        var result=store.progress(user,essay.id(),0);
        assertThat(result.status()).isEqualTo("complete");assertThat(result.done()).isEqualTo(2);
        assertThat(result.results()).extracting(StoredExplanation.View::translationZh).containsExactly("释义：Good","释义：work");
        assertThat(store.progress(user,essay.id(),result.cursor()).results()).isEmpty();
        when(ai.isConfigured(any(CurrentUser.class))).thenReturn(false);
        assertThat(new ExplanationService(compositions,ai,store).explain(user,essay.id(),new ExplanationRequest(0,4,"word",1)).translationZh()).isEqualTo("释义：Good");
        verify(ai,times(1)).explainBatch(anyList(),any());verify(ai,never()).explain(any(),any(),anyBoolean());
    }
    @Test void failedBatchRetainsCompletedWorkAndRetryOnlyLoadsRemainder() {
        var user=user();workingAi();
        var essay=compositions.create(user,new CreateCompositionRequest("Resume",null,"one two three four five six seven eight nine ten eleven twelve thirteen fourteen."));
        var worker=new GlossaryWorker(store,explanations);worker.runNext();
        assertThat(store.progress(user,essay.id(),0).done()).isEqualTo(12);
        when(ai.explainBatch(anyList(),any())).thenThrow(new TranslationUnavailableException());
        worker.runNext();
        assertThat(store.progress(user,essay.id(),0).status()).isEqualTo("retrying");
        assertThat(store.progress(user,essay.id(),0).results()).hasSize(12);
        store.retry(user,essay.id());workingAi();worker.runNext();
        assertThat(store.progress(user,essay.id(),0).done()).isEqualTo(14);
        verify(ai,times(2)).explainBatch(argThat(s->s.size()==2 && s.get(0).selectedText().equals("thirteen")),any());
        verify(ai,times(1)).explainBatch(argThat(s->s.size()==12),any());
    }
    @Test void incompleteLeaseCanBeReclaimedAndOldWorkerCannotFinishNewLease() {
        var user=user();var essay=compositions.create(user,new CreateCompositionRequest("Lease",null,"Good work."));
        var first=store.claim();assertThat(first).isNotNull();assertThat(store.claim()).isNull();
        jobs.findById(essay.id()).orElseThrow().nextAttempt=Instant.EPOCH;
        em.flush();em.clear();
        var resumed=store.claim();assertThat(resumed.lease()).isNotEqualTo(first.lease());
        store.finish(first,"Old failure",true);
        assertThat(jobs.findById(essay.id()).orElseThrow().status).isEqualTo("running");
    }
    @Test void editReusesUnchangedSentencesButRejectsStaleAnswers() {
        var user=user();workingAi();
        var essay=compositions.create(user,new CreateCompositionRequest("Edit",null,"Good work. We learn."));
        new GlossaryWorker(store,explanations).runNext();
        assertThat(store.progress(user,essay.id(),0).done()).isEqualTo(4);
        assertThat(entries.findByCompositionIdAndContentVersionOrderById(essay.id(),1))
                .extracting(e->e.selectedText+"|"+e.sentence).contains("We|We learn.","learn|We learn.");
        var oldSelection=GlossaryStore.words(essay.id(),1,essay.content()).get(0);
        var edited=compositions.update(user,essay.id(),new UpdateCompositionRequest("Edited",null,"Great work. We learn.",1));
        var result=store.progress(user,essay.id(),0);
        assertThat(result.done()).isEqualTo(2);assertThat(result.results()).extracting(StoredExplanation.View::selectedText).containsExactly("We","learn");
        assertThat(result.results()).allMatch(r->r.contentVersion()==edited.contentVersion());
        assertThatThrownBy(()->store.save(List.of(oldSelection),List.of(new ContextualExplanation("旧",null,null))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
    }
    @Test void progressAndRetryAreOwnerOnlyAndDeleteRemovesResultsAndJob() {
        var user=user();workingAi();var stranger=user();
        var essay=compositions.create(user,new CreateCompositionRequest("Private",null,"Good work."));
        new GlossaryWorker(store,explanations).runNext();
        assertThatThrownBy(()->store.progress(stranger,essay.id(),0)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThatThrownBy(()->store.retry(stranger,essay.id())).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThatThrownBy(()->explanations.explain(stranger,essay.id(),new ExplanationRequest(0,4,"word",1))).isInstanceOf(ResponseStatusException.class);
        compositions.deleteComposition(user,essay.id());
        assertThat(jobs.findById(essay.id())).isEmpty();assertThat(entries.findByCompositionIdAndContentVersionOrderById(essay.id(),1)).isEmpty();
    }
    @Test void repeatedFailuresPauseWithoutRetryingEveryWordForever() {
        var user=user();workingAi();var essay=compositions.create(user,new CreateCompositionRequest("Failure",null,"Good work."));
        when(ai.explainBatch(anyList(),any())).thenThrow(new TranslationUnavailableException());
        var worker=new GlossaryWorker(store,explanations);
        for(int i=0;i<3;i++) {jobs.findById(essay.id()).orElseThrow().nextAttempt=Instant.EPOCH;worker.runNext();}
        var progress=store.progress(user,essay.id(),0);
        assertThat(progress.status()).isEqualTo("paused");
        assertThat(progress.configurationRequired()).isFalse();
        worker.runNext();
        verify(ai,times(3)).explainBatch(anyList(),any());
    }
    @Test void missingAiConfigurationIsExplicitAndRetryClearsThatRequirement() {
        var user=user();
        when(ai.isConfigured(any(CurrentUser.class))).thenThrow(
                new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED, "AI 设置尚未完成")
        );
        var essay=compositions.create(user,new CreateCompositionRequest("Configure",null,"Good work."));

        new GlossaryWorker(store,explanations).runNext();
        var paused=store.progress(user,essay.id(),0);
        assertThat(paused.status()).isEqualTo("paused");
        assertThat(paused.configurationRequired()).isTrue();

        store.retry(user,essay.id());
        assertThat(store.progress(user,essay.id(),0).configurationRequired()).isFalse();
    }
    @Test void extraPartialWordResultDoesNotFalselyCompleteFullWordPreload() {
        var user=user();workingAi();
        var essay=compositions.create(user,new CreateCompositionRequest("Count",null,"one two three four five six seven eight nine ten eleven twelve thirteen."));
        store.save(List.of(new SelectionContext(essay.id(),1,"word","on",0,2,essay.content())),List.of(new ContextualExplanation("局部",null,null)));
        new GlossaryWorker(store,explanations).runNext();
        var progress=store.progress(user,essay.id(),0);
        assertThat(progress.status()).isEqualTo("queued");assertThat(progress.done()).isEqualTo(12);
        assertThat(store.claim().requests()).hasSize(1);
    }
}
