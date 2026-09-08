package site.fanwenjia.aisettings;

import jakarta.persistence.*;

@Entity
@Table(name="user_ai_settings")
public class UserAiSettings {
    @Id Long ownerId;
    @Column(nullable=false, length=20) String provider;
    @Column(length=512) String apiKey;
    // Legacy migration source; cleared after migration and left empty for new rows.
    @Column(nullable=false, length=2048) String encryptedKey;
    protected UserAiSettings() {}
}
