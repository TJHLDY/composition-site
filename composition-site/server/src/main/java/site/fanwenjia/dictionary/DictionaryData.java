package site.fanwenjia.dictionary;

import java.util.List;

public record DictionaryData(String term, String ukPhonetic, String usPhonetic,
                             List<String> meanings, List<Form> wordForms) {
    public record Form(String name, String value) {
        public Form { name = bounded(name, 80); value = bounded(value, 200); }
    }
    public DictionaryData {
        term = bounded(term, 200); ukPhonetic = bounded(ukPhonetic, 200); usPhonetic = bounded(usPhonetic, 200);
        if (meanings == null || meanings.isEmpty() || meanings.size() > 40 || wordForms == null || wordForms.size() > 30)
            throw new IllegalArgumentException("Invalid dictionary data");
        meanings = meanings.stream().map(s -> bounded(s, 2000)).toList();
        wordForms = List.copyOf(wordForms);
    }
    private static String bounded(String s, int max) {
        if (s == null) return "";
        if (s.length() > max) throw new IllegalArgumentException("Dictionary field too long");
        return s.strip();
    }
}
