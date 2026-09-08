package site.fanwenjia.aisettings;

import java.nio.file.*;
import java.nio.file.attribute.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Component
public class AiKeyCipher {
    private final String masterKey;
    private final Path keyFile;
    private final SecureRandom random = new SecureRandom();
    public AiKeyCipher(@Value("${vocabnote.ai.master-key:${VOCABNOTE_AI_MASTER_KEY:}}") String masterKey,
                       @Value("${vocabnote.ai.key-file:./data/ai-key-encryption.key}") String keyFile) {
        this.masterKey=masterKey; this.keyFile=Path.of(keyFile);
    }
    private synchronized byte[] key(boolean create) throws Exception {
        if (!masterKey.isBlank()) return decodeKey(masterKey.strip());
        if (!Files.exists(keyFile)) {
            if (!create) throw new IllegalStateException("Missing encryption key");
            Files.createDirectories(keyFile.toAbsolutePath().getParent());
            byte[] generated = new byte[32]; random.nextBytes(generated);
            try { Files.writeString(keyFile, Base64.getEncoder().encodeToString(generated), StandardOpenOption.CREATE_NEW); }
            catch (FileAlreadyExistsException ignored) { return decodeKey(Files.readString(keyFile).strip()); }
            var acl = Files.getFileAttributeView(keyFile, AclFileAttributeView.class);
            if (acl != null) acl.setAcl(List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW)
                    .setPrincipal(Files.getOwner(keyFile)).setPermissions(EnumSet.allOf(AclEntryPermission.class)).build()));
            else Files.setPosixFilePermissions(keyFile, PosixFilePermissions.fromString("rw-------"));
        }
        return decodeKey(Files.readString(keyFile).strip());
    }
    private byte[] decodeKey(String encoded) {
        byte[] bytes=Base64.getDecoder().decode(encoded);
        if(bytes.length!=32) throw new IllegalArgumentException("Invalid encryption key");
        return bytes;
    }
    public String encrypt(Long owner, String provider, String plain) { return crypt(true, owner, provider, plain); }
    public String decrypt(Long owner, String provider, String sealed) { return crypt(false, owner, provider, sealed); }
    private String crypt(boolean encrypt, Long owner, String provider, String input) {
        try {
            byte[] nonce = new byte[12], payload;
            if(encrypt) { random.nextBytes(nonce); payload=input.getBytes(StandardCharsets.UTF_8); }
            else {
                byte[] all=Base64.getDecoder().decode(input);
                if(all.length<29) throw new IllegalArgumentException("Invalid ciphertext");
                System.arraycopy(all,0,nonce,0,12); payload=Arrays.copyOfRange(all,12,all.length);
            }
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(encrypt?Cipher.ENCRYPT_MODE:Cipher.DECRYPT_MODE,new SecretKeySpec(key(encrypt),"AES"),new GCMParameterSpec(128,nonce));
            cipher.updateAAD((owner+":"+provider).getBytes(StandardCharsets.UTF_8));
            byte[] output=cipher.doFinal(payload);
            if(!encrypt) return new String(output,StandardCharsets.UTF_8);
            byte[] sealed=new byte[12+output.length]; System.arraycopy(nonce,0,sealed,0,12); System.arraycopy(output,0,sealed,12,output.length);
            return Base64.getEncoder().encodeToString(sealed);
        } catch(Exception e) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"AI 密钥存储暂不可用，请联系网站管理员。"); }
    }
}
