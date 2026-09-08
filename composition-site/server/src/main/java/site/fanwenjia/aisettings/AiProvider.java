package site.fanwenjia.aisettings;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public enum AiProvider {
    deepseek("DeepSeek 官方", "https://api.deepseek.com", "https://platform.deepseek.com/"),
    taotoken("Taotoken", "https://api.taotoken.net/v1", "https://taotoken.net/?u=inv_j24g5dtpokbj4s2n&utm_source=tt_invite");
    public final String label, baseUrl, signupUrl;
    AiProvider(String label, String baseUrl, String signupUrl) { this.label=label; this.baseUrl=baseUrl; this.signupUrl=signupUrl; }
    public String model() { return "deepseek-v4-flash"; }
    public static AiProvider parse(String raw) {
        try { return valueOf(raw); }
        catch (RuntimeException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择 DeepSeek 官方或 Taotoken。"); }
    }
}
