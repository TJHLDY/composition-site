package site.fanwenjia;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {
        "spring.datasource.url=jdbc:h2:mem:composition-site-local-test;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password="
        })
class CompositionSiteApplicationTest {

    @Autowired
    private ApplicationContext context;

    @Test
    void startsWithConfigurableTestDatabase() {
        assertThat(context).isNotNull();
        assertThat(context.getEnvironment().getProperty("spring.datasource.url"))
                .contains("jdbc:h2:mem:composition-site-local-test");
    }
}
