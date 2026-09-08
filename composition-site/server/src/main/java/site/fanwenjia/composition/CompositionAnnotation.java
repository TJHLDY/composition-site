package site.fanwenjia.composition;

import site.fanwenjia.auth.UserAccount;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

@Entity
@Table(
        name = "composition_annotations",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_annotation_composition_range",
                columnNames = {"composition_id", "content_version", "start_offset", "end_offset"}
        ),
        indexes = @Index(
                name = "idx_annotations_composition_owner",
                columnList = "composition_id, owner_id, start_offset, id"
        )
)
public class CompositionAnnotation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "composition_id", nullable = false)
    private Composition composition;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private UserAccount owner;

    @Column(name = "content_version", nullable = false)
    private int contentVersion;

    @Column(name = "selected_text", nullable = false, length = 500)
    private String selectedText;

    @Column(name = "start_offset", nullable = false)
    private int startOffset;

    @Column(name = "end_offset", nullable = false)
    private int endOffset;

    @Column(nullable = false, length = 20)
    private String kind;

    @Column(name = "translation_zh", length = 1000)
    private String translationZh;

    @Column(name = "learning_text", length = 500)
    private String learningText;

    @Column(length = 2000)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CompositionAnnotation() {
    }

    public CompositionAnnotation(
            Composition composition,
            UserAccount owner,
            int contentVersion,
            String selectedText,
            int startOffset,
            int endOffset,
            String kind,
            String translationZh,
            String learningText,
            String note
    ) {
        this.composition = composition;
        this.owner = owner;
        this.contentVersion = contentVersion;
        this.selectedText = selectedText;
        this.startOffset = startOffset;
        this.endOffset = endOffset;
        update(kind, translationZh, learningText, note);
    }

    public void update(String kind, String translationZh, String learningText, String note) {
        this.kind = kind;
        this.translationZh = translationZh;
        this.learningText = learningText;
        this.note = note;
    }

    @PrePersist
    void setCreatedAuditFields() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void setUpdatedAt() {
        updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Composition getComposition() {
        return composition;
    }

    public int getContentVersion() {
        return contentVersion;
    }

    public String getSelectedText() {
        return selectedText;
    }

    public int getStartOffset() {
        return startOffset;
    }

    public int getEndOffset() {
        return endOffset;
    }

    public String getKind() {
        return kind;
    }

    public String getTranslationZh() {
        return translationZh;
    }

    public String getLearningText() {
        return learningText;
    }

    public String getNote() {
        return note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
