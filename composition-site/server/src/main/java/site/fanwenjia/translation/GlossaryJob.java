package site.fanwenjia.translation;
import jakarta.persistence.*;
import java.time.Instant;
@Entity
@Table(name="composition_glossary_jobs", indexes=@Index(name="idx_glossary_due",columnList="status,nextAttempt"))
public class GlossaryJob {
    @Id Long compositionId;
    @Column(nullable=false) Long ownerId;
    @Column(nullable=false) int contentVersion;
    @Column(nullable=false,length=20) String status;
    @Column(nullable=false) int total;
    @Column(nullable=false) int done;
    @Column(nullable=false) int attempts;
    @Column(nullable=false) Instant nextAttempt;
    @Column(length=80) String lease;
    @Column(length=300) String message;
    protected GlossaryJob() {}
}
