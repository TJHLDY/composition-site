package site.fanwenjia.wordbook;

import jakarta.persistence.*;

@Entity
@Table(name = "wordbook_examples", indexes = @Index(name = "idx_wordbook_example_entry", columnList = "entry_id"))
public class WordbookExample {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(name = "entry_id", nullable = false) Long entryId;
    @Column(nullable = false, length = 2000) String english;
    @Column(nullable = false, length = 2000) String translationZh;
    @Column(name = "usage_hint", length = 2000) String usage;
    protected WordbookExample() {}
}
