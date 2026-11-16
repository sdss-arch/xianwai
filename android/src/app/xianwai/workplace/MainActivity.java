package app.xianwai.workplace;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import javax.net.ssl.SSLException;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/#analyze";
    private static final String RECORDINGS = "/recordings-local/";
    private static final int MIC_PERMISSION = 100;
    private static final int PICK_FILE = 101;
    private static final int SAVE_FILE = 102;
    private final ExecutorService background = Executors.newFixedThreadPool(2);
    private WebView web;
    private ModelSettings settings;
    private LocalRecordings recordings;
    private String waitingForMic;
    private ValueCallback<Uri[]> filePicker;
    private String savingRequest;
    private File savingFile;
    private byte[] savingText;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        settings = new ModelSettings(this);
        recordings = new LocalRecordings(this);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(245, 243, 236));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(245, 243, 236));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setTextZoom(100);
        web.getSettings().setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new ContentClient());
        web.setWebChromeClient(new PhoneChrome());
        web.addJavascriptInterface(new Bridge(), "XianwaiAndroid");
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        prepareInsets(root);
        root.requestApplyInsets();
        web.loadUrl(HOME);
    }

    private void prepareInsets(View root) {
        if (Build.VERSION.SDK_INT < 30) return;
        getWindow().setDecorFitsSystemWindows(false);
        android.view.WindowInsetsController controller = getWindow().getInsetsController();
        if (controller != null) {
            int light = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            controller.setSystemBarsAppearance(light, light);
        }
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            return WindowInsets.CONSUMED;
        });
    }

    private boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1 && uri.getUserInfo() == null;
    }

    private final class ContentClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !local(request.getUrl());
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String path = url.getPath();
            if (!local(url) || !"GET".equals(request.getMethod()) || path == null
                || !path.matches("[/a-zA-Z0-9_.-]+") || path.contains("..")) return missing();
            if (path.equals("/")) path = "/index.html";
            try {
                InputStream stream;
                long size = -1;
                if (path.startsWith(RECORDINGS)) {
                    File file = recordings.find(path.substring(RECORDINGS.length()));
                    if (file == null) return missing();
                    size = file.length();
                    stream = new FileInputStream(file);
                } else {
                    stream = getAssets().open("web" + path);
                }
                return content(path, stream, size);
            } catch (Exception ignored) {
                return missing();
            }
        }
    }

    private static WebResourceResponse content(String path, InputStream stream, long size) {
        String type = "application/octet-stream";
        if (path.endsWith(".html")) type = "text/html";
        else if (path.endsWith(".js") || path.endsWith(".mjs")) type = "text/javascript";
        else if (path.endsWith(".css")) type = "text/css";
        else if (path.endsWith(".json") || path.endsWith(".webmanifest")) type = "application/json";
        else if (path.endsWith(".wasm")) type = "application/wasm";
        else if (path.endsWith(".png")) type = "image/png";
        else if (path.endsWith(".m4a")) type = "audio/mp4";
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; media-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
        headers.put("Cross-Origin-Resource-Policy", "same-origin");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Cache-Control", "no-store");
        if (size >= 0) headers.put("Content-Length", Long.toString(size));
        String encoding = type.startsWith("text/") || "application/json".equals(type) ? "UTF-8" : null;
        return new WebResourceResponse(type, encoding, 200, "OK", headers, stream);
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<>(),
            new ByteArrayInputStream(new byte[0]));
    }

    private final class PhoneChrome extends WebChromeClient {
        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePicker != null) filePicker.onReceiveValue(null);
            filePicker = callback;
            Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            boolean profiles = false;
            for (String type : params.getAcceptTypes()) {
                if (type.contains("json")) profiles = true;
            }
            pick.setType(profiles ? "*/*" : "audio/*");
            try {
                startActivityForResult(pick, PICK_FILE);
            } catch (Exception ignored) {
                filePicker = null;
                callback.onReceiveValue(null);
            }
            return true;
        }
    }

    private final class Bridge {
        @JavascriptInterface public void dispatch(String id, String action, String json) {
            if (id == null || !id.matches("[0-9]{1,12}") || action == null || json == null) return;
            if (json.length() > ("exportText".equals(action) ? 500_000 : 32_000)) {
                failure(id, "内容过长，无法完成这次操作。");
                return;
            }
            runOnUiThread(() -> {
                try {
                    JSONObject params = new JSONObject(json);
                    switch (action) {
                        case "settings" -> success(id, settings.read().summary());
                        case "saveSettings" -> success(id, settings.save(params));
                        case "complete" -> startModel(id, settings.read(), params);
                        case "testSettings" -> {
                            ModelSettings.Config draft = settings.draft(params);
                            JSONArray messages = new JSONArray().put(new JSONObject().put("role", "user").put("content", "Reply only OK."));
                            startModel(id, draft, new JSONObject().put("test", true).put("messages", messages));
                        }
                        case "startRecording" -> askForMic(id);
                        case "stopRecording" -> success(id, recordings.stop());
                        case "listRecordings" -> success(id, recordings.list());
                        case "deleteRecording" -> {
                            File file = findRecording(params);
                            if (!file.delete()) throw new IllegalStateException("暂时无法删除此录音。");
                            success(id, true);
                        }
                        case "exportRecording" -> exportRecording(id, params);
                        case "exportText" -> saveDocument(id, "application/json",
                            "personal".equals(params.optString("kind")) ? "弦外-个人信息.json" : "弦外-上级档案.json", null,
                            params.optString("text").getBytes(StandardCharsets.UTF_8));
                        case "copy" -> {
                            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                            clipboard.setPrimaryClip(ClipData.newPlainText("弦外", params.optString("text")));
                            success(id, true);
                        }
                        default -> failure(id, "此版本暂不支持这个操作。");
                    }
                } catch (Exception error) {
                    failure(id, explain(error));
                }
            });
        }
    }

    private void startModel(String id, ModelSettings.Config config, JSONObject params) {
        background.execute(() -> {
            try { success(id, ModelClient.complete(config, params)); }
            catch (Exception error) { failure(id, explain(error)); }
        });
    }

    private void askForMic(String id) throws Exception {
        if (waitingForMic != null) throw new IllegalStateException("正在等待麦克风授权。");
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            beginRecording(id);
        } else {
            waitingForMic = id;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_PERMISSION);
        }
    }

    private void beginRecording(String id) throws Exception {
        recordings.start(this::finishAutomatically);
        success(id, true);
    }

    private void finishAutomatically() {
        if (!recordings.running()) return;
        try {
            evaluate("window.XianwaiNativeRecording?.(" + recordings.stop() + ")");
        } catch (Exception error) {
            evaluate("window.XianwaiNativeRecordingError?.(" + JSONObject.quote(explain(error)) + ")");
        }
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request != MIC_PERMISSION || waitingForMic == null) return;
        String id = waitingForMic;
        waitingForMic = null;
        if (grants.length == 0 || grants[0] != PackageManager.PERMISSION_GRANTED) {
            failure(id, "请在系统设置中允许弦外访问麦克风，也可以导入已有录音。");
            return;
        }
        try { beginRecording(id); }
        catch (Exception error) { failure(id, explain(error)); }
    }

    private File findRecording(JSONObject data) throws FileNotFoundException {
        File file = recordings.find(data.optString("id"));
        if (file == null) throw new FileNotFoundException("此录音已移除。");
        return file;
    }

    private void exportRecording(String id, JSONObject data) throws Exception {
        File file = findRecording(data);
        saveDocument(id, "audio/mp4", "弦外-" + file.getName(), file, null);
    }

    private void saveDocument(String id, String type, String filename, File file, byte[] text) {
        if (savingRequest != null) throw new IllegalStateException("正在选择保存位置。");
        Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        create.addCategory(Intent.CATEGORY_OPENABLE);
        create.setType(type);
        create.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(create, SAVE_FILE);
        savingFile = file;
        savingText = text;
        savingRequest = id;
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && filePicker != null) {
            Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
            filePicker.onReceiveValue(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
            filePicker = null;
        }
        if (request != SAVE_FILE || savingRequest == null) return;
        final String id = savingRequest;
        final File file = savingFile;
        final byte[] text = savingText;
        final Uri target = result == RESULT_OK && data != null ? data.getData() : null;
        savingRequest = null;
        savingFile = null;
        savingText = null;
        if (target == null || !"content".equals(target.getScheme())) {
            success(id, false);
            return;
        }
        background.execute(() -> {
            try (InputStream input = file == null ? new ByteArrayInputStream(text) : new FileInputStream(file);
                 OutputStream output = getContentResolver().openOutputStream(target, "w")) {
                if (output == null) throw new FileNotFoundException();
                byte[] chunk = new byte[16384];
                int count;
                while ((count = input.read(chunk)) >= 0) output.write(chunk, 0, count);
                success(id, true);
            } catch (Exception ignored) {
                failure(id, "无法写入这个位置，请换个文件夹试试。");
            }
        });
    }

    private void evaluate(String source) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(source, null); });
    }

    private void success(String id, Object value) {
        evaluate("window.XianwaiNativeResult?.(" + JSONObject.quote(id) + ",true," +
            (value == null ? "null" : value instanceof String ? JSONObject.quote((String) value) : value.toString()) + ")");
    }

    private void failure(String id, String explanation) {
        evaluate("window.XianwaiNativeResult?.(" + JSONObject.quote(id) + ",false," + JSONObject.quote(explanation) + ")");
    }

    private static String explain(Exception error) {
        if (error instanceof ModelClient.ApiError || error instanceof IllegalArgumentException
            || error instanceof IllegalStateException || error instanceof FileNotFoundException) {
            return error.getMessage() == null ? "操作暂时无法完成。" : error.getMessage();
        }
        if (error instanceof UnknownHostException || error instanceof ConnectException) return "无法连接模型服务，请检查网络和 API 地址。";
        if (error instanceof SSLException) return "无法验证 API 服务器的 HTTPS 连接，请检查地址或证书。";
        if (error instanceof SocketTimeoutException) return "连接模型超时，可以稍后重试。";
        if (error instanceof JSONException) return "接口返回格式不兼容，请检查模型或切换返回格式。";
        return "操作暂时无法完成，请检查应用设置后重试。";
    }

    @Override protected void onStop() {
        finishAutomatically();
        super.onStop();
    }

    @Override protected void onDestroy() {
        background.shutdownNow();
        if (web != null) {
            web.removeJavascriptInterface("XianwaiAndroid");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
