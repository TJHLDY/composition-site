package site.fanwenjia.composition;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;

import site.fanwenjia.auth.AuthResult;
import site.fanwenjia.auth.AuthService;
import site.fanwenjia.auth.CurrentUser;
import site.fanwenjia.auth.RegisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:composition-service-test;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@Transactional
class CompositionServiceTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private CompositionService compositionService;

    @Test
    void listReturnsOnlyTheCurrentUsersEssaysNewestFirst() {
        CurrentUser ownerA = register("a@example.com", "Owner A");
        CurrentUser ownerB = register("b@example.com", "Owner B");

        compositionService.create(ownerA, new CreateCompositionRequest("Older", null, "One."));
        compositionService.create(ownerB, new CreateCompositionRequest("Private", null, "Two."));
        CompositionView newest = compositionService.create(ownerA, new CreateCompositionRequest(
                "Newest", "2026 年英语二 · 第 1 套", "Three."
        ));

        assertThat(compositionService.list(ownerA))
                .extracting(CompositionListItem::title)
                .containsExactly(newest.title(), "Older");
    }

    @Test
    void readDoesNotDiscloseAnotherUsersComposition() {
        CurrentUser ownerA = register("a@example.com", "Owner A");
        CurrentUser ownerB = register("b@example.com", "Owner B");
        CompositionView privateEssay = compositionService.create(ownerB, new CreateCompositionRequest("Private", null, "Text."));

        assertThatThrownBy(() -> compositionService.read(ownerA, privateEssay.id()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("范文不存在");
    }

    @Test
    void annotationUsesTheStoredTextRangeAndNeverCrossesAccountBoundaries() {
        CurrentUser ownerA = register("a@example.com", "Owner A");
        CurrentUser ownerB = register("b@example.com", "Owner B");
        CompositionView composition = compositionService.create(
                ownerA,
                new CreateCompositionRequest("T", null, "A meaningful contribution matters.")
        );
        SaveAnnotationRequest request = new SaveAnnotationRequest(
                2,
                12,
                "word",
                "有意义的",
                "搭配记忆",
                composition.contentVersion()
        );

        assertThat(compositionService.saveAnnotation(ownerA, composition.id(), request).annotation().selectedText())
                .isEqualTo("meaningful");
        assertThatThrownBy(() -> compositionService.saveAnnotation(ownerB, composition.id(), request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("范文不存在");
        assertThatThrownBy(() -> compositionService.saveAnnotation(
                ownerA,
                composition.id(),
                new SaveAnnotationRequest(0, 999, "word", null, null, composition.contentVersion())
        )).isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("笔记范围格式不正确");
    }

    @Test
    void repeatSaveUpdatesOneAnnotationAndTheEssayDetailShowsItsNotes() {
        CurrentUser owner = register("reader@example.com", "Reader");
        CompositionView composition = compositionService.create(
                owner,
                new CreateCompositionRequest("T", null, "Make a meaningful contribution every day.")
        );
        SaveAnnotationRequest first = new SaveAnnotationRequest(
                0,
                4,
                "word",
                "做出",
                "make a contribution",
                composition.contentVersion()
        );
        SaveAnnotationRequest replacement = new SaveAnnotationRequest(
                0,
                4,
                "word",
                "作出",
                "固定搭配",
                composition.contentVersion()
        );

        AnnotationSaveResult created = compositionService.saveAnnotation(owner, composition.id(), first);
        AnnotationSaveResult updated = compositionService.saveAnnotation(owner, composition.id(), replacement);

        assertThat(created.created()).isTrue();
        assertThat(updated.created()).isFalse();
        assertThat(updated.annotation().id()).isEqualTo(created.annotation().id());
        assertThat(compositionService.read(owner, composition.id()).annotations())
                .extracting(AnnotationView::selectedText, AnnotationView::translationZh, AnnotationView::note)
                .containsExactly(tuple("Make", "作出", "固定搭配"));
        assertThat(compositionService.list(owner).get(0).noteCount()).isEqualTo(1);

        compositionService.deleteAnnotation(owner, composition.id(), created.annotation().id());

        assertThat(compositionService.read(owner, composition.id()).annotations()).isEmpty();
        assertThat(compositionService.list(owner).get(0).noteCount()).isZero();
    }

    @Test
    void ordinaryPhraseUpdatePreservesHistoricalLearningTextWhenTheNewClientOmitsIt() {
        CurrentUser owner = register("phrase-reader@example.com", "Phrase Reader");
        CompositionView composition = compositionService.create(
                owner,
                new CreateCompositionRequest("T", null, "Combining practical experience with academic study helps students.")
        );
        SaveAnnotationRequest first = new SaveAnnotationRequest(
                0,
                35,
                "phrase",
                "把实践经验与学术学习结合",
                "combining … with",
                "历史搭配笔记",
                composition.contentVersion()
        );
        SaveAnnotationRequest replacement = new SaveAnnotationRequest(
                0,
                35,
                "phrase",
                "把实践经验与学术学习结合",
                null,
                "改写普通释义",
                composition.contentVersion()
        );

        AnnotationSaveResult created = compositionService.saveAnnotation(owner, composition.id(), first);
        AnnotationSaveResult updated = compositionService.saveAnnotation(owner, composition.id(), replacement);

        assertThat(updated.created()).isFalse();
        assertThat(updated.annotation().id()).isEqualTo(created.annotation().id());
        assertThat(updated.annotation().selectedText()).isEqualTo("Combining practical experience with");
        assertThat(updated.annotation().learningText()).isEqualTo("combining … with");
        assertThat(compositionService.read(owner, composition.id()).annotations())
                .extracting(AnnotationView::selectedText, AnnotationView::learningText, AnnotationView::note)
                .containsExactly(tuple(
                        "Combining practical experience with",
                        "combining … with",
                        "改写普通释义"
                ));
    }

    @Test
    void deletingAnEssayRemovesItsNotesAndCannotCrossAccountBoundaries() {
        CurrentUser ownerA = register("delete-a@example.com", "Delete A");
        CurrentUser ownerB = register("delete-b@example.com", "Delete B");
        CompositionView essayToDelete = compositionService.create(
                ownerA,
                new CreateCompositionRequest("Delete me", null, "A meaningful contribution matters.")
        );
        CompositionView otherUsersEssay = compositionService.create(
                ownerB,
                new CreateCompositionRequest("Keep me", null, "Another private essay.")
        );
        compositionService.saveAnnotation(ownerA, essayToDelete.id(), new SaveAnnotationRequest(
                2,
                12,
                "word",
                "有意义的",
                "删除时一并清理",
                essayToDelete.contentVersion()
        ));

        assertThatThrownBy(() -> compositionService.deleteComposition(ownerB, essayToDelete.id()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("范文不存在");

        compositionService.deleteComposition(ownerA, essayToDelete.id());

        assertThat(compositionService.list(ownerA)).isEmpty();
        assertThatThrownBy(() -> compositionService.read(ownerA, essayToDelete.id()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("范文不存在");
        assertThat(compositionService.read(ownerB, otherUsersEssay.id()).title()).isEqualTo("Keep me");
    }

    private CurrentUser register(String email, String displayName) {
        AuthResult result = authService.register(new RegisterRequest(email, "StrongPass123", displayName));
        return new CurrentUser(result.user().id(), result.user().email(), result.user().displayName());
    }
}
