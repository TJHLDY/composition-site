package site.fanwenjia.wordbook;

import java.util.*;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class EnglishTerms {
    private static final Pattern TERM = Pattern.compile("[A-Za-z]+(?:['-][A-Za-z]+)*(?: [A-Za-z]+(?:['-][A-Za-z]+)*)*");
    private static final Map<String, String> IRREGULAR = new HashMap<>();
    static {
        for (String group : List.of("make made", "take took taken", "give gave given", "go goes went gone", "be am is are was were been being", "have has had", "do does did done", "get got gotten", "write wrote written", "speak spoke spoken", "see saw seen", "think thought", "bring brought", "buy bought", "find found", "feel felt", "keep kept", "leave left", "know knew known", "grow grew grown", "run ran", "build built", "say said", "come came", "child children", "person people", "man men", "woman women", "foot feet", "tooth teeth")) {
            String[] forms = group.split(" ");
            for (String form : forms) IRREGULAR.put(form, forms[0]);
        }
    }
    private EnglishTerms() {}
    public static String canonical(String raw) {
        return raw.replace('’', '\'').replace('‘', '\'').replace('ʼ', '\'').replace('‐', '-').replace('‑', '-');
    }
    public static String display(String raw) {
        String text = raw == null ? "" : canonical(raw).trim().replaceAll("[\\p{Z}\\s]+", " ");
        if (text.length() > 500 || !TERM.matcher(text).matches()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请输入英文单词或短语（最多 500 字符）");
        return text;
    }
    public static String normalize(String raw) { return display(raw).toLowerCase(Locale.ROOT); }
    public static String kind(String term) { return term.contains(" ") ? "phrase" : "word"; }
    public static boolean containsWord(String phrase, String word) {
        String base = word.toLowerCase(Locale.ROOT);
        String lemma = IRREGULAR.getOrDefault(base, base);
        for (String token : phrase.toLowerCase(Locale.ROOT).split(" ")) {
            if (token.equals(base) || IRREGULAR.getOrDefault(token, token).equals(lemma)) return true;
            if (forms(base).contains(token) || forms(token).contains(base)) return true;
        }
        return false;
    }
    private static Set<String> forms(String base) {
        Set<String> forms = new HashSet<>(List.of(base + "s", base + "ed", base + "ing", base + "'s"));
        if (base.matches(".*(?:s|x|z|ch|sh|o)$")) forms.add(base + "es");
        if (base.matches(".*[^aeiou]y$")) {
            forms.add(base.substring(0, base.length() - 1) + "ies");
            forms.add(base.substring(0, base.length() - 1) + "ied");
        }
        if (base.endsWith("e")) {
            forms.add(base + "d");
            if (!base.endsWith("ee")) forms.add(base.substring(0, base.length() - 1) + "ing");
        }
        if (base.matches(".*[^aeiou][aeiou][^aeiouwxy]$")) {
            forms.add(base + base.charAt(base.length() - 1) + "ing");
            forms.add(base + base.charAt(base.length() - 1) + "ed");
        }
        return forms;
    }
}
