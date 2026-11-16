package app.xianwai.workplace;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

final class ModelClient {
    static final class ApiError extends IOException {
        final boolean badFormat;
        ApiError(String message, boolean badFormat) {
            super(message);
            this.badFormat = badFormat;
        }
    }

    static String complete(ModelSettings.Config config, JSONObject request) throws Exception {
        if (config.endpoint.isEmpty()) throw new IllegalArgumentException("请先在「设置」里接入模型 API。");
        JSONArray messages = request.getJSONArray("messages");
        if (messages.toString().length() > 22_000) throw new IllegalArgumentException("单次解读的文字太长。");
        boolean test = request.optBoolean("test");
        String[] choices = test ? new String[]{"plain"} : "auto".equals(config.format)
            ? new String[]{"schema", "json", "plain"} : new String[]{config.format};
        for (int attempt = 0; attempt < choices.length; attempt++) {
            try {
                return send(config, request, messages, choices[attempt], test);
            } catch (ApiError error) {
                if (!error.badFormat || attempt == choices.length - 1) throw error;
            }
        }
        throw new IllegalStateException("模型请求未完成。");
    }

    private static String send(ModelSettings.Config config, JSONObject request, JSONArray messages, String format, boolean test) throws Exception {
        URL endpoint = new URL(config.endpoint + "/chat/completions");
        HttpURLConnection connection = (HttpURLConnection) endpoint.openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(16_000);
            connection.setReadTimeout(85_000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            if (!config.key.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + config.key);
            JSONObject body = new JSONObject().put("model", config.model).put("messages", messages)
                .put("stream", false).put("max_tokens", test ? 32 : 1700);
            if ("schema".equals(format)) {
                JSONObject definition = new JSONObject().put("name", request.optString("name", "workplace"))
                    .put("strict", true).put("schema", request.getJSONObject("schema"));
                body.put("response_format", new JSONObject().put("type", "json_schema").put("json_schema", definition));
            } else if ("json".equals(format)) {
                body.put("response_format", new JSONObject().put("type", "json_object"));
            }
            byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(data.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(data); }
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                String error = readLimited(connection.getErrorStream()).toLowerCase(Locale.ROOT);
                boolean wrongFormat = (code == 400 || code == 422) && (error.contains("schema") || error.contains("response_format") || error.contains("response format"));
                throw new ApiError(describe(code, wrongFormat), wrongFormat);
            }
            JSONObject response = new JSONObject(readLimited(connection.getInputStream()));
            JSONObject message = response.getJSONArray("choices").getJSONObject(0).getJSONObject("message");
            String content = message.optString("content", "");
            if (content.trim().isEmpty() || content.equals("null")) throw new ApiError("模型返回了空回复，请检查模型和输出格式。", false);
            return content;
        } finally {
            connection.disconnect();
        }
    }

    private static String describe(int status, boolean wrongFormat) {
        if (wrongFormat) return "该模型不接受当前返回格式，可在设置中选择「自动兼容」或「提示词 JSON」。";
        return switch (status) {
            case 301, 302, 307, 308 -> "API 地址发生跳转，请填写服务商的最终地址。";
            case 401, 403 -> "模型服务拒绝了请求，请检查 API 密钥和权限。";
            case 404 -> "找不到模型接口，请检查 API 地址和模型名称。";
            case 429 -> "模型服务限流或额度不足，请稍后重试。";
            default -> "模型服务返回了 HTTP " + status + "，请检查设置后重试。";
        };
    }

    private static String readLimited(InputStream source) throws IOException {
        if (source == null) return "";
        try (InputStream input = source; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] data = new byte[8192];
            int count;
            while ((count = input.read(data)) != -1) {
                if (output.size() + count > 1_500_000) throw new IOException("模型返回内容过大。");
                output.write(data, 0, count);
            }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
