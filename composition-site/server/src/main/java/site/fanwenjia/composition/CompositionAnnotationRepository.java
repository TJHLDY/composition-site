package site.fanwenjia.composition;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompositionAnnotationRepository extends JpaRepository<CompositionAnnotation, Long> {

    List<CompositionAnnotation> findByCompositionIdAndOwnerIdOrderByStartOffsetAscIdAsc(Long compositionId, Long ownerId);

    Optional<CompositionAnnotation> findByCompositionIdAndOwnerIdAndContentVersionAndStartOffsetAndEndOffset(
            Long compositionId,
            Long ownerId,
            int contentVersion,
            int startOffset,
            int endOffset
    );

    Optional<CompositionAnnotation> findByIdAndCompositionIdAndOwnerId(Long id, Long compositionId, Long ownerId);

    long countByCompositionIdAndOwnerId(Long compositionId, Long ownerId);
}
