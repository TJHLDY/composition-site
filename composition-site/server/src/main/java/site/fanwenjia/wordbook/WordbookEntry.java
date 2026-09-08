package site.fanwenjia.wordbook;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "wordbook_entries", uniqueConstraints = @UniqueConstraint(name = "uk_wordbook_owner_term", columnNames = {"owner_id", "normalized_term"}), indexes = @Index(name = "idx_wordbook_owner_kind", columnList = "owner_id,kind,deleted,normalized_term"))
public class WordbookEntry {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(name = "owner_id", nullable = false) Long ownerId;
    @Column(nullable = false, length = 500) String term;
    @Column(name = "normalized_term", nullable = false, length = 500) String normalizedTerm;
    @Column(nullable = false, length = 10) String kind;
    @Column(length = 1000) String translationZh;
    @Column(length = 2000) String note;
    @Column(columnDefinition = "MEDIUMTEXT") String dictionaryJson;
    @Column(nullable = false) boolean deleted;
    @Column(nullable = false) Instant createdAt = Instant.now();
    @Column(nullable = false) Instant updatedAt = Instant.now();
    protected WordbookEntry() {}
}
