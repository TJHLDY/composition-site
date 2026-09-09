package site.fanwenjia.translation;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.LoggerFactory;

@Component
@EnableScheduling
@ConditionalOnProperty(name="composition.glossary.worker-enabled",havingValue="true",matchIfMissing=true)
public class GlossaryWorker {
    private final GlossaryStore store;
    private final ExplanationService explanations;
    public GlossaryWorker(GlossaryStore store,ExplanationService explanations) {this.store=store;this.explanations=explanations;}
    @Scheduled(fixedDelay=2200,initialDelay=5000)
    public void runNext() {
        var work=store.claim();
        if(work==null) return;
        try {
            explanations.batch(work.user(),work.id(),work.requests());
            store.finish(work,null,false);
        } catch(Exception e) {
            boolean missing=e instanceof ResponseStatusException s && s.getStatusCode().value()==428;
            String message=missing?"请先在 AI 设置保存密钥，再重试未完成部分。":"AI 连接暂不可用，已完成的释义已保存。";
            if(e instanceof ResponseStatusException s && s.getStatusCode().value()==429) message="AI 请求较频繁，稍后继续；已完成的释义已保存。";
            LoggerFactory.getLogger(GlossaryWorker.class).warn("Glossary batch unavailable: {}",e.getClass().getSimpleName());
            store.finish(work,message,missing);
        }
    }
}
