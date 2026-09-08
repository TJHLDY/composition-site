package site.fanwenjia.wordbook;

import jakarta.persistence.*;

@Entity
@Table(name = "wordbook_senses", uniqueConstraints = @UniqueConstraint(name = "uk_wordbook_annotation", columnNames = {"annotation_id"}), indexes = @Index(name = "idx_wordbook_sense_entry", columnList = "entry_id"))
public class WordbookSense {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(name = "entry_id", nullable = false) Long entryId;
    @Column(name = "owner_id", nullable = false) Long ownerId;
    @Column(name = "annotation_id") Long annotationId;
    Long compositionId;
    @Column(length = 200) String compositionTitle;
    @Column(length = 1000) String translationZh;
    @Column(length = 2000) String note;
    @Lob @Column(columnDefinition = "LONGTEXT") String sentence;
    protected WordbookSense() {}
}
