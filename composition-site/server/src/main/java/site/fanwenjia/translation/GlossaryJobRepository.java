package site.fanwenjia.translation;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.Pageable;
public interface GlossaryJobRepository extends JpaRepository<GlossaryJob,Long> {
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from GlossaryJob j where j.compositionId = :id")
    java.util.Optional<GlossaryJob> lockById(Long id);
    @Query("select j.compositionId from GlossaryJob j where j.status in ('queued','running','retrying') and j.nextAttempt <= :now order by j.nextAttempt,j.compositionId")
    List<Long> due(Instant now,Pageable page);
}
