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
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "compositions", indexes = @Index(
        name = "idx_compositions_owner_updated",
        columnList = "owner_id, updatedAt, id"
))
public class Composition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private UserAccount owner;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 100)
    private String sourceLabel;

    @Lob
    @Column(nullable = false, length = 100_000, columnDefinition = "LONGTEXT")
    private String content;

    @Column(nullable = false)
    private int contentVersion = 1;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected Composition() {
    }

    public Composition(UserAccount owner, String title, String sourceLabel, String content) {
        this.owner = owner;
        this.title = title;
        this.sourceLabel = sourceLabel;
        this.content = content;
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

    public String getTitle() {
        return title;
    }

    public String getSourceLabel() {
        return sourceLabel;
    }

    public String getContent() {
        return content;
    }

    public int getContentVersion() {
        return contentVersion;
    }

    public void touch() {
        updatedAt = Instant.now();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
