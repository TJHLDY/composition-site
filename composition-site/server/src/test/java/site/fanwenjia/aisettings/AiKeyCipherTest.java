package site.fanwenjia.aisettings;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class AiKeyCipherTest {
    @TempDir Path folder;
    @Test void persistsMasterKeyAndBindsCiphertextToAccountAndProvider() {
        String file=folder.resolve("key").toString();
        var cipher=new AiKeyCipher("",file);
        String first=cipher.encrypt(1L,"taotoken","test-personal-key");
        assertThat(first).doesNotContain("test-personal-key");
        assertThat(cipher.encrypt(1L,"taotoken","test-personal-key")).isNotEqualTo(first);
        assertThat(new AiKeyCipher("",file).decrypt(1L,"taotoken",first)).isEqualTo("test-personal-key");
        assertThatThrownBy(() -> cipher.decrypt(2L,"taotoken",first)).hasMessageContaining("密钥存储");
        assertThatThrownBy(() -> cipher.decrypt(1L,"deepseek",first)).hasMessageContaining("密钥存储");
    }
}
