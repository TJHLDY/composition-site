package site.fanwenjia.dictionary;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.wordbookai.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DictionaryTest {
    @Test void extractsAllMeaningsAndFormsWithoutLosingSecondarySenses() throws Exception {
        var root = new ObjectMapper().readTree("""
            {"ec":{"word":[{"usphone":"test","ukphone":"test2","trs":[
              {"tr":[{"l":{"i":["n. 进步；进展","v. 前进；发展"]}}]}],
              "wfs":[{"wf":{"name":"过去式","value":"progressed"}}]}]}}
            """);
        var result = DictionaryClient.parse("progress", root).orElseThrow();
        assertThat(result.meanings()).containsExactly("n. 进步；进展", "v. 前进；发展");
        assertThat(result.wordForms().get(0).value()).isEqualTo("progressed");
        assertThat(result.ukPhonetic()).isEqualTo("test2");
        assertThat(DictionaryClient.parse("unknown", new ObjectMapper().readTree("{}"))).isEmpty();
    }

    @Test void dictionaryHitDoesNotCallAiAndMissFallsBack() {
        var dictionary = mock(DictionaryClient.class);
        var ai = mock(WordbookAiController.class);
        var controller = new DictionaryController(dictionary, ai);
        var user = mock(CurrentUser.class);
        var request = new WordbookAiModels.LookupRequest("progress");
        var data = new DictionaryData("progress", "", "", List.of("n. 进步"), List.of());
        when(dictionary.lookup("progress")).thenReturn(Optional.of(data));
        assertThat(controller.define(user, request).dictionary()).isEqualTo(data);
        verifyNoInteractions(ai);
        when(dictionary.lookup("progress")).thenReturn(Optional.empty());
        when(ai.lookup(user, request)).thenReturn(new WordbookAiModels.Lookup("progress", "word", "进步", "", List.of()));
        assertThat(controller.define(user, request).source()).isEqualTo("ai");
        verify(ai).lookup(user, request);
    }
}
