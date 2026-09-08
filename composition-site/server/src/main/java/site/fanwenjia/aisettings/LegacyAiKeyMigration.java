package site.fanwenjia.aisettings;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Converts existing encrypted settings once; subsequent starts need no encryption key. */
@Component
public class LegacyAiKeyMigration implements ApplicationRunner {
    private final UserAiSettingsRepository repository;
    private final AiKeyCipher cipher;

    public LegacyAiKeyMigration(UserAiSettingsRepository repository, AiKeyCipher cipher) {
        this.repository = repository;
        this.cipher = cipher;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (UserAiSettings row : repository.findAll()) {
            if (row.apiKey == null && row.encryptedKey != null && !row.encryptedKey.isBlank()) {
                row.apiKey = cipher.decrypt(row.ownerId, row.provider, row.encryptedKey);
                row.encryptedKey = "";
                repository.save(row);
            }
        }
    }
}
