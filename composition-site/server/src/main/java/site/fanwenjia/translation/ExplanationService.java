package site.fanwenjia.translation;

import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.composition.CompositionService;
import site.fanwenjia.composition.SelectionContext;
import site.fanwenjia.composition.SelectionRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ExplanationService {

    private static final Duration CACHE_TTL = Duration.ofHours(24);
    private static final int CACHE_MAX_ENTRIES = 512;

    private final CompositionService compositionService;
    private final ContextualExplainer contextualExplainer;
    private final ConcurrentMap<CacheKey, CachedExplanation> cache = new ConcurrentHashMap<>();
    private final Object cacheEvictionLock = new Object();

    public ExplanationService(CompositionService compositionService, ContextualExplainer contextualExplainer) {
        this.compositionService = compositionService;
        this.contextualExplainer = contextualExplainer;
    }

    public ExplanationView explain(CurrentUser currentUser, Long compositionId, ExplanationRequest request) {
        SelectionContext selection = compositionService.resolveSelection(
                currentUser,
                compositionId,
                new SelectionRequest(request.startOffset(), request.endOffset(), request.kind(), request.contentVersion())
        );
        if (!contextualExplainer.isConfigured(currentUser)) {
            throw unavailable();
        }
        CacheKey cacheKey = new CacheKey(
                selection.compositionId(),
                selection.contentVersion(),
                selection.startOffset(),
                selection.endOffset()
        );
        Instant now = Instant.now();
        CachedExplanation cached = cache.get(cacheKey);
        if (cached != null && !isExpired(cached, now)) {
            return toView(selection, cached.explanation());
        }
        if (cached != null) cache.remove(cacheKey, cached);

        try {
            ContextualExplanation explanation = contextualExplainer.explain(
                    selection,
                    currentUser,
                    false
            );
            ContextualExplanation normalized = normalize(explanation);
            cacheExplanation(cacheKey, normalized, now);
            return toView(selection, normalized);
        } catch (TranslationUnavailableException exception) {
            throw unavailable();
        }
    }

    private ContextualExplanation normalize(ContextualExplanation explanation) {
        if (explanation == null) throw new TranslationUnavailableException();
        String translation = trimToNull(explanation.translationZh(), 500);
        if (translation == null) throw new TranslationUnavailableException();
        String hint = trimToNull(explanation.memoryHint(), 500);
        return new ContextualExplanation(translation, hint, null);
    }

    private void cacheExplanation(CacheKey cacheKey, ContextualExplanation explanation, Instant now) {
        synchronized (cacheEvictionLock) {
            cache.put(cacheKey, new CachedExplanation(explanation, now));
            cache.entrySet().removeIf(entry -> isExpired(entry.getValue(), now));
            int excess = cache.size() - CACHE_MAX_ENTRIES;
            if (excess <= 0) return;
            cache.entrySet().stream()
                    .sorted(Comparator.comparing(entry -> entry.getValue().createdAt()))
                    .limit(excess)
                    .forEach(entry -> cache.remove(entry.getKey(), entry.getValue()));
        }
    }

    private boolean isExpired(CachedExplanation cachedExplanation, Instant now) {
        return !cachedExplanation.createdAt().plus(CACHE_TTL).isAfter(now);
    }

    private String trimToNull(String value, int maximumLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) return null;
        if (normalized.length() > maximumLength) {
            throw new TranslationUnavailableException();
        }
        return normalized;
    }

    private ExplanationView toView(SelectionContext selection, ContextualExplanation explanation) {
        return new ExplanationView(
                selection.selectedText(),
                selection.kind(),
                explanation.translationZh(),
                explanation.memoryHint(),
                explanation.learningText(),
                selection.contentVersion()
        );
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "语境翻译暂不可用，请稍后再试或手动填写。"
        );
    }

    private record CacheKey(
            Long compositionId,
            int contentVersion,
            int startOffset,
            int endOffset
    ) {
    }

    private record CachedExplanation(ContextualExplanation explanation, Instant createdAt) {
    }
}
