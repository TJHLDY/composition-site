package site.fanwenjia.dictionary;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.wordbookai.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChineseTranslationTest {
    @Test void missingPhrasesFallBackToCompleteTranslation() {
        var dictionary=mock(DictionaryClient.class);var ai=mock(WordbookAiController.class);var translator=mock(ChineseTranslationClient.class);
        var user=mock(CurrentUser.class);
        new DictionaryController(dictionary,ai,translator).define(user,new WordbookAiModels.LookupRequest("解决问题"));
        verify(dictionary).lookup("解决问题");
        verify(translator).translate(user,"解决问题");verifyNoInteractions(ai);
    }
    @Test void preservesCompletePhraseAndSentence() throws Exception {
        var translator=new ChineseTranslationClient(null,null,new ObjectMapper());
        assertThat(translator.parse("解决问题","{\"english\":\"solve a problem\",\"kind\":\"phrase\"}").term()).isEqualTo("solve a problem");
        var result=translator.parse("我想学习。","{\"english\":\"I want to learn.\",\"kind\":\"sentence\"}");
        assertThat(result.kind()).isEqualTo("sentence");assertThat(result.term()).isEqualTo("I want to learn.");
        assertThatThrownBy(()->translator.parse("学习","{\"english\":\"学习\",\"kind\":\"word\"}")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
