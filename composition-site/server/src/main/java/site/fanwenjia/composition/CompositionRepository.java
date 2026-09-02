package site.fanwenjia.composition;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompositionRepository extends JpaRepository<Composition, Long> {

    List<Composition> findByOwnerIdOrderByUpdatedAtDescIdDesc(Long ownerId);

    Optional<Composition> findByIdAndOwnerId(Long id, Long ownerId);
}
