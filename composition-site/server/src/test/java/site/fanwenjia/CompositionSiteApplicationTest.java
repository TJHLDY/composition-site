package site.fanwenjia;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class CompositionSiteApplicationTest {

    @Autowired
    private ApplicationContext context;

    @Test
    void startsWithItsOwnLocalDatabase() {
        assertThat(context).isNotNull();
        assertThat(context.getEnvironment().getProperty("spring.datasource.url"))
                .contains("jdbc:h2:file:./data/fanwenjia");
    }
}
