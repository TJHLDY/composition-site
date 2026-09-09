package site.fanwenjia.translation;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;
public interface StoredExplanationRepository extends JpaRepository<StoredExplanation,Long> {
    List<StoredExplanation> findByCompositionIdAndContentVersionOrderById(Long id,int version);
    List<StoredExplanation> findByCompositionIdAndContentVersionAndIdGreaterThanOrderById(Long id,int version,long cursor);
    Optional<StoredExplanation> findByCompositionIdAndContentVersionAndStartOffsetAndEndOffset(Long id,int version,int start,int end);
    void deleteByCompositionId(Long id);
}
