package site.fanwenjia.wordbookai;

import java.util.regex.Pattern;

/** Small, deterministic checks; linguistic accuracy remains the provider's responsibility. */
final class WordbookAiText {
    private static final Pattern ENGLISH_TERM = Pattern.compile("[A-Za-z]+(?:['-][A-Za-z]+)*(?: [A-Za-z]+(?:['-][A-Za-z]+)*)*");
    private static final Pattern HAN = Pattern.compile("\\p{IsHan}");
    private static final Pattern UNSAFE = Pattern.compile("[\\p{Cc}\\p{Cf}\\p{Cs}]");

    private WordbookAiText() {}

    static String text(String value, int maximum, boolean allowEmpty) {
        if (value == null || value.length() > maximum || UNSAFE.matcher(value).find()) {
            throw new IllegalArgumentException("Invalid text");
        }
        String normalized = value.strip().replaceAll("[\\p{Z}\\s]+", " ");
        if (!allowEmpty && normalized.isBlank()) throw new IllegalArgumentException("Empty text");
        return normalized;
    }

    static String canonical(String value) {
        return value.replace('\u2018', '\'').replace('\u2019', '\'')
                .replace('\u02bc', '\'').replace('\u2010', '-').replace('\u2011', '-');
    }

    static String term(String value) {
        String term = text(value, 200, false);
        if (!ENGLISH_TERM.matcher(canonical(term)).matches()) throw new IllegalArgumentException("Invalid English term");
        return term;
    }

    static String kind(String term) {
        return term.indexOf(' ') >= 0 ? "phrase" : "word";
    }

    static String chinese(String value, int maximum) {
        String text = text(value, maximum, false);
        if (!HAN.matcher(text).find()) throw new IllegalArgumentException("Missing Chinese text");
        return text;
    }

    static void sentence(String english, String term) {
        String normalized = canonical(english);
        // Apostrophes and hyphens belong to a word: "make progress-based" is not "make progress".
        String boundary = "[\\p{L}\\p{N}_'\\p{Pd}\\p{M}]";
        Pattern target = Pattern.compile("(?<!" + boundary + ")" + Pattern.quote(canonical(term))
                + "(?!" + boundary + ")", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
        if (!target.matcher(normalized).find() || HAN.matcher(english).find()
                || !english.matches(".*[.!?][\"’”']?$")
                || english.matches(".*[!?]{2,}.*")
                || normalized.split(" ").length < 4
                || normalized.replaceAll("[.!?\"']+$", "").equalsIgnoreCase(canonical(term))) {
            throw new IllegalArgumentException("Invalid example sentence");
        }
    }
}
