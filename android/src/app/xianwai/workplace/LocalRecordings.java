package app.xianwai.workplace;

import android.content.Context;
import android.media.MediaRecorder;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

final class LocalRecordings {
    private static final String NAME_PATTERN = "[0-9]{13}-[a-f0-9]{8}\\.m4a";
    private final Context context;
    private final File folder;
    private MediaRecorder recorder;
    private File staging;

    LocalRecordings(Context context) {
        this.context = context;
        folder = new File(context.getFilesDir(), "recordings");
    }

    boolean running() {
        return recorder != null;
    }

    void start(Runnable onLimit) throws Exception {
        if (running()) throw new IllegalStateException("录音已经开始。");
        if (!folder.exists() && !folder.mkdirs()) throw new IOException("无法创建本机录音目录。");
        staging = new File(folder, System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8) + ".m4a.part");
        MediaRecorder next = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(context) : new MediaRecorder();
        try {
            next.setAudioSource(MediaRecorder.AudioSource.MIC);
            next.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            next.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            next.setAudioChannels(1);
            next.setAudioEncodingBitRate(64_000);
            next.setAudioSamplingRate(44_100);
            next.setMaxDuration(120_000);
            next.setOutputFile(staging.getAbsolutePath());
            next.setOnInfoListener((source, what, extra) -> {
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED && recorder == source) onLimit.run();
            });
            next.prepare();
            next.start();
            recorder = next;
        } catch (Exception error) {
            next.release();
            if (staging != null) staging.delete();
            staging = null;
            throw new IllegalStateException("无法开始录音，请检查麦克风是否可用。", error);
        }
    }

    JSONObject stop() throws Exception {
        if (!running()) return null;
        MediaRecorder active = recorder;
        File partial = staging;
        recorder = null;
        staging = null;
        try {
            active.stop();
        } catch (RuntimeException error) {
            partial.delete();
            throw new IllegalStateException("这段录音太短或录音中断，请重新录制。", error);
        } finally {
            active.release();
        }
        String name = partial.getName();
        File ready = new File(folder, name.substring(0, name.length() - ".part".length()));
        if (!partial.renameTo(ready)) {
            partial.delete();
            throw new IOException("暂时无法保存录音。");
        }
        return describe(ready);
    }

    File find(String id) {
        if (!id.matches(NAME_PATTERN)) return null;
        File file = new File(folder, id);
        return file.isFile() ? file : null;
    }

    JSONArray list() throws Exception {
        JSONArray result = new JSONArray();
        File[] files = folder.listFiles((directory, name) -> name.matches(NAME_PATTERN));
        if (files == null) return result;
        Arrays.sort(files, Comparator.comparing(File::getName).reversed());
        for (File file : files) result.put(describe(file));
        return result;
    }

    private static JSONObject describe(File file) throws Exception {
        long time = Long.parseLong(file.getName().substring(0, 13));
        String date = new SimpleDateFormat("yyyy-MM-dd HH-mm-ss", Locale.ROOT).format(new Date(time));
        return new JSONObject().put("id", file.getName()).put("name", "录音 " + date + ".m4a")
            .put("time", time).put("size", file.length()).put("url", "/recordings-local/" + file.getName());
    }
}
