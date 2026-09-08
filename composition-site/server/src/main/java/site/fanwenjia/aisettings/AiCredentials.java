package site.fanwenjia.aisettings;

/** Request-scoped credentials; never serialize or log this object. */
public final class AiCredentials {
    public final AiProvider provider;
    public final String apiKey;
    public AiCredentials(AiProvider provider, String apiKey) { this.provider=provider; this.apiKey=apiKey; }
    @Override public String toString() { return "AiCredentials[redacted]"; }
}
