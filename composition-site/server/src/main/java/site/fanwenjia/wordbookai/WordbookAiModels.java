package site.fanwenjia.wordbookai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class WordbookAiModels {
    private WordbookAiModels() {}

    public record LookupRequest(@NotBlank @Size(max = 200) String query) {}

    public record SentenceRequest(@NotBlank @Size(max = 200) String term,
                                  @NotBlank @Size(max = 500) String translationZh) {}

    public record Collocation(String term, String translationZh) {}

    public record Lookup(String term, String kind, String translationZh, String memoryHint,
                         List<Collocation> collocations) {
        public Lookup {
            collocations = List.copyOf(collocations);
        }
    }

    public record Sentence(String english, String translationZh, String usage) {}
}
