package site.fanwenjia.translation;

import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.composition.*;

@Service
public class ExplanationService {
    private final CompositionService compositions;
    private final ContextualExplainer ai;
    private final GlossaryStore store;
    public ExplanationService(CompositionService compositions,ContextualExplainer ai,GlossaryStore store) {
        this.compositions=compositions;this.ai=ai;this.store=store;
    }
    public ExplanationView explain(CurrentUser user,Long id,ExplanationRequest request) {
        var selection=resolve(user,id,request);
        var saved=store.find(selection);
        if(saved.isPresent()) return toView(selection,saved.get());
        if(!ai.isConfigured(user)) throw unavailable();
        try {
            var result=normalize(ai.explain(selection,user,false));
            store.save(List.of(selection),List.of(result));
            return toView(selection,result);
        } catch(TranslationUnavailableException e) {throw unavailable();}
    }
    public List<ExplanationView> batch(CurrentUser user,Long id,List<ExplanationRequest> requests) {
        if(requests==null || requests.isEmpty() || requests.size()>12 || requests.stream().anyMatch(Objects::isNull))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"每批最多查询 12 个词。");
        var selections=requests.stream().map(r->resolve(user,id,r)).toList();
        var results=new HashMap<SelectionContext,ContextualExplanation>();
        var missing=new ArrayList<SelectionContext>();
        for(var s:selections) {
            var saved=store.find(s);
            if(saved.isPresent()) results.put(s,saved.get());
            else if(!missing.contains(s)) missing.add(s);
        }
        try {
            if(!missing.isEmpty()) {
                if(!ai.isConfigured(user)) throw unavailable();
                var answers=ai.explainBatch(missing,user);
                if(answers==null || answers.size()!=missing.size()) throw new TranslationUnavailableException();
                var normalized=answers.stream().map(this::normalize).toList();
                store.save(missing,normalized);
                for(int i=0;i<missing.size();i++) results.put(missing.get(i),normalized.get(i));
            }
            return selections.stream().map(s->toView(s,results.get(s))).toList();
        } catch(TranslationUnavailableException e) {throw unavailable();}
    }
    private SelectionContext resolve(CurrentUser user,Long id,ExplanationRequest r) {
        return compositions.resolveSelection(user,id,new SelectionRequest(r.startOffset(),r.endOffset(),r.kind(),r.contentVersion()));
    }
    private ContextualExplanation normalize(ContextualExplanation e) {
        if(e==null) throw new TranslationUnavailableException();
        String translation=trim(e.translationZh()),hint=trim(e.memoryHint());
        if(translation==null) throw new TranslationUnavailableException();
        return new ContextualExplanation(translation,hint,null);
    }
    private String trim(String value) {
        String text=value==null?"":value.trim();
        if(text.length()>500) throw new TranslationUnavailableException();
        return text.isEmpty()?null:text;
    }
    private ExplanationView toView(SelectionContext s,ContextualExplanation e) {
        return new ExplanationView(s.selectedText(),s.kind(),e.translationZh(),e.memoryHint(),e.learningText(),s.contentVersion());
    }
    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"语境翻译暂不可用，请稍后再试或手动填写。");
    }
}
