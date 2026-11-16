package app.xianwai.workplace;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class ModelSettings {
    private static final String ALIAS = "xianwai-model-key";
    private final SharedPreferences storage;

    ModelSettings(Context context) {
        storage = context.getSharedPreferences("model", Context.MODE_PRIVATE);
    }

    static final class Config {
        final String endpoint;
        final String model;
        final String format;
        final String key;
        Config(String endpoint, String model, String format, String key) {
            this.endpoint = endpoint;
            this.model = model;
            this.format = format;
            this.key = key;
        }

        JSONObject summary() throws Exception {
            return new JSONObject().put("endpoint", endpoint).put("model", model)
                .put("format", format).put("hasKey", !key.isEmpty()).put("configured", !endpoint.isEmpty());
        }
    }

    synchronized Config read() throws Exception {
        JSONObject saved = new JSONObject(storage.getString("config", "{}"));
        String encrypted = saved.optString("key");
        return new Config(saved.optString("endpoint"), saved.optString("model"),
            saved.optString("format", "auto"), encrypted.isEmpty() ? "" : decrypt(encrypted));
    }

    synchronized Config draft(JSONObject data) throws Exception {
        String endpoint = normalizeEndpoint(data.optString("endpoint"));
        String model = data.optString("model").trim();
        if (model.isEmpty() || model.length() > 160) throw new IllegalArgumentException("请输入服务商提供的模型名称。");
        String format = data.optString("format", "auto");
        if (!format.equals("auto") && !format.equals("schema") && !format.equals("json") && !format.equals("plain")) {
            throw new IllegalArgumentException("请选择可用的返回格式。");
        }
        String key = data.optString("key").trim();
        if (key.length() > 2048 || key.indexOf('\r') >= 0 || key.indexOf('\n') >= 0) {
            throw new IllegalArgumentException("请检查 API 密钥格式。");
        }
        if (data.optBoolean("clearKey")) {
            key = "";
        } else if (key.isEmpty()) {
            JSONObject saved = new JSONObject(storage.getString("config", "{}"));
            String encrypted = saved.optString("key");
            if (endpoint.equals(saved.optString("endpoint")) && !encrypted.isEmpty()) key = decrypt(encrypted);
        }
        return new Config(endpoint, model, format, key);
    }

    synchronized JSONObject save(JSONObject data) throws Exception {
        Config config = draft(data);
        JSONObject saved = new JSONObject().put("endpoint", config.endpoint).put("model", config.model)
            .put("format", config.format).put("key", config.key.isEmpty() ? "" : encrypt(config.key));
        if (!storage.edit().putString("config", saved.toString()).commit()) throw new IllegalStateException("无法保存模型设置。");
        return config.summary();
    }

    private static String normalizeEndpoint(String value) {
        String address = value.trim().replaceAll("/+$", "");
        URI uri;
        try { uri = URI.create(address); } catch (RuntimeException error) { uri = null; }
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
            || uri.getUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || address.length() > 500) {
            throw new IllegalArgumentException("请输入 HTTPS API 地址，可填 /v1 兼容地址或完整 Chat Completions 地址。");
        }
        return address.endsWith("/chat/completions")
            ? address.substring(0, address.length() - "/chat/completions".length()) : address;
    }

    private SecretKey secret() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        SecretKey existing = (SecretKey) store.getKey(ALIAS, null);
        if (existing != null) return existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    private String encrypt(String text) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, secret());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "."
            + Base64.encodeToString(cipher.doFinal(text.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    private String decrypt(String encoded) throws Exception {
        String[] parts = encoded.split("\\.", 2);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secret(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
}
