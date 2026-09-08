package site.fanwenjia.aisettings;

import com.fasterxml.jackson.databind.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import site.fanwenjia.auth.*;
import site.fanwenjia.dictionary.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"vocabnote.ai.master-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "composition.translation.provider.api-key=must-never-be-used-server-key", "composition.translation.provider.model=legacy-server-model"})
@AutoConfigureMockMvc
@Transactional
class AiSettingsApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired VerificationCodeStore codes;
    @Autowired UserAiSettingsRepository repository;
    @Autowired AiSettingsService service;
    @Autowired AccountAiClients clients;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired AiKeyCipher cipher;
    @Autowired LegacyAiKeyMigration migration;
    @MockBean DictionaryClient dictionary;

    private record Account(String token,Long id) {}
    private Account account() throws Exception {
        String email=UUID.randomUUID()+"@example.com";
        String code=codes.issue(VerificationPurpose.REGISTER,email,Duration.ofMinutes(5));
        var response=mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                Map.of("email",email,"password","StrongPass123","displayName","Reader","code",code))))
                .andExpect(status().isCreated()).andReturn().getResponse();
        JsonNode result=json.readTree(response.getContentAsString());
        return new Account(result.path("token").asText(),result.at("/user/id").asLong());
    }
    private String auth(Account a) { return "Bearer "+a.token(); }
    @Test void migratesLegacyKeyOnceAndReadsAdministratorUpdates() throws Exception {
        var a=account();
        var row=new UserAiSettings();
        row.ownerId=a.id(); row.provider="taotoken";
        row.encryptedKey=cipher.encrypt(a.id(),row.provider,"sk-legacy-test-key");
        row=repository.saveAndFlush(row);
        migration.run(null);
        repository.flush();
        var user=new CurrentUser(a.id(),"qa@example.com","QA");
        assertThat(service.require(user).apiKey).isEqualTo("sk-legacy-test-key");
        assertThat(row.encryptedKey).isEmpty();
        row.apiKey="sk-admin-replacement";
        repository.saveAndFlush(row);
        migration.run(null);
        assertThat(service.require(user).apiKey).isEqualTo("sk-admin-replacement");
        mvc.perform(get("/api/ai-settings").header("Authorization",auth(a)))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("sk-admin-replacement"))));
    }
    @Test void isolatesAccountsMasksSecretsAndNeverFallsBackToServerKey() throws Exception {
        var a=account(); var b=account();
        mvc.perform(put("/api/ai-settings").header("Authorization",auth(a)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"provider\":\"taotoken\",\"apiKey\":\"sk-personal-secret-a\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.configured").value(true))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("sk-personal-secret-a"))));
        var row=repository.findById(a.id()).orElseThrow();
        repository.flush();
        assertThat(jdbc.queryForObject("select api_key from user_ai_settings where owner_id = ?",String.class,a.id())).isEqualTo("sk-personal-secret-a");
        assertThat(row.encryptedKey).isEmpty();
        mvc.perform(get("/api/ai-settings").header("Authorization",auth(b))).andExpect(status().isOk()).andExpect(jsonPath("$.configured").value(false));
        mvc.perform(post("/api/wordbook/lookup").header("Authorization",auth(b)).contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"word\"}"))
                .andExpect(status().is(428));
        var user=new CurrentUser(a.id(),"qa@example.com","QA");
        assertThat(service.require(user).apiKey).isEqualTo("sk-personal-secret-a");
        var client=clients.wordbook(user);
        var keyField=client.getClass().getDeclaredField("apiKey"); keyField.setAccessible(true);
        assertThat(keyField.get(client)).isEqualTo("sk-personal-secret-a");
        mvc.perform(put("/api/ai-settings").header("Authorization",auth(a)).contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"deepseek\",\"apiKey\":\"\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/ai-settings").header("Authorization",auth(a))).andExpect(status().isNoContent());
        assertThat(repository.findById(a.id())).isEmpty();
        assertThatThrownBy(() -> service.require(user)).hasMessageContaining("AI 设置");
    }
    @Test void dictionaryAndLibraryWorkWithoutKeyAndSettingsRequireLogin() throws Exception {
        mvc.perform(get("/api/ai-settings")).andExpect(status().isUnauthorized());
        var a=account();
        when(dictionary.lookup("word")).thenReturn(Optional.of(new DictionaryData("word","","",List.of("n. 单词"),List.of())));
        mvc.perform(post("/api/wordbook/define").header("Authorization",auth(a)).contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"word\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.source").value("dictionary"));
        mvc.perform(get("/api/wordbook").header("Authorization",auth(a))).andExpect(status().isOk());
        mvc.perform(put("/api/ai-settings").header("Authorization",auth(a)).contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"http://localhost\",\"apiKey\":\"sk-invalid-test\"}"))
                .andExpect(status().isBadRequest());
    }
}
