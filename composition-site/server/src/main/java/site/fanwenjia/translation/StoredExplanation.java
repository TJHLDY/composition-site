package site.fanwenjia.translation;

import jakarta.persistence.*;
import site.fanwenjia.composition.SelectionContext;

@Entity
@Table(name="composition_explanations", uniqueConstraints=@UniqueConstraint(name="uk_explanation_position",columnNames={"compositionId","contentVersion","startOffset","endOffset"}))
public class StoredExplanation {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) Long id;
    @Column(nullable=false) Long compositionId;
    @Column(nullable=false) int contentVersion;
    @Column(nullable=false) int startOffset;
    @Column(nullable=false) int endOffset;
    @Column(nullable=false,length=500) String selectedText;
    @Column(nullable=false,length=10) String kind;
    @Lob @Column(nullable=false,columnDefinition="LONGTEXT") String sentence;
    @Column(nullable=false,length=500) String translationZh;
    @Column(length=500) String memoryHint;
    protected StoredExplanation() {}
    StoredExplanation(SelectionContext s, ContextualExplanation answer) {
        compositionId=s.compositionId();contentVersion=s.contentVersion();startOffset=s.startOffset();endOffset=s.endOffset();
        selectedText=s.selectedText();kind=s.kind();sentence=s.sentence();translationZh=answer.translationZh();memoryHint=answer.memoryHint();
    }
    ContextualExplanation answer() {return new ContextualExplanation(translationZh,memoryHint,null);}
    public record View(long id,int startOffset,int endOffset,String selectedText,String kind,String translationZh,String memoryHint,int contentVersion) {}
    View view() {return new View(id,startOffset,endOffset,selectedText,kind,translationZh,memoryHint,contentVersion);}
}
