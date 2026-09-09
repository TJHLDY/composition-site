package site.fanwenjia.composition;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompositionRepository extends JpaRepository<Composition, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from Composition c where c.id = :id")
    Optional<Composition> lockById(Long id);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from Composition c where c.id = :id and c.owner.id = :ownerId")
    Optional<Composition> lockOwned(Long id,Long ownerId);

    List<Composition> findByOwnerIdOrderByUpdatedAtDescIdDesc(Long ownerId);

    Optional<Composition> findByIdAndOwnerId(Long id, Long ownerId);
}
