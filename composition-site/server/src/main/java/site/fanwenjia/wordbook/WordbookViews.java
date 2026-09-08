package site.fanwenjia.wordbook;

import java.util.List;
import site.fanwenjia.dictionary.DictionaryData;

public final class WordbookViews {
    private WordbookViews() {}
    public record Item(Long id, String term, String kind, String translationZh) {}
    public record Page(List<Item> items, long total, long wordCount, long phraseCount) {}
    public record Sense(Long id, String translationZh, String note, String sentence, Long compositionId, String compositionTitle, Long annotationId) {}
    public record Example(Long id, String english, String translationZh, String usage) {}
    public record Detail(Long id, String term, String kind, String translationZh, String note, List<Sense> senses, List<Item> related, List<Example> examples, DictionaryData dictionary) {}
    public record Save(String term, String translationZh, String note, DictionaryData dictionary) {
        public Save(String term, String translationZh, String note) { this(term, translationZh, note, null); }
    }
    public record SaveExample(String english, String translationZh, String usage) {}
}
