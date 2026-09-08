package site.fanwenjia.wordbook;

import jakarta.persistence.*;

@Entity
@Table(name = "wordbook_imports")
public class WordbookImport {
    @Id Long ownerId;
    protected WordbookImport() {}
    WordbookImport(Long ownerId) { this.ownerId = ownerId; }
}
