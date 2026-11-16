# 测试

开发期间使用的自动化检查：Playwright 驱动的浏览器端到端测试，以及 `adb` + `uiautomator` 驱动的安卓模拟器测试。

```bash
npm install            # 仓库根目录执行一次（安装 Playwright）
npx playwright install chromium   # 若不通过 CHROME_PATH 指定本机浏览器
```

## 环境变量

| 变量 | 使用方 | 含义 |
| --- | --- | --- |
| `CHROME_PATH` | 浏览器测试 | Chrome/Chromium 的绝对路径；不设置时使用 Playwright 自带浏览器 |
| `EDGE_PATH` | `edge-acceptance.mjs` | Microsoft Edge 的绝对路径 |
| `APP_URL` | `audio-flow.mjs`、`audio-current.mjs` | 被测应用的地址（默认 `http://127.0.0.1:8789`） |
| `XIANWAI_BASE_URL` | `audio-mobile-smoke.mjs` | 麦克风测试用的 HTTPS 地址（默认 `https://127.0.0.1:8788`） |
| `XIANWAI_TLS_CERT` | `audio-mobile-smoke.mjs` | 该 HTTPS 测试服务的 `server.pem` 路径（用于证书锁定） |
| `ADB` | 安卓测试 | `adb` 路径；不设置时从 `PATH` 查找 |
| `XIANWAI_ADB_SERIAL` | 安卓测试 | 设备序列号（默认 `emulator-5556`） |
| `XIANWAI_APK` | `emulator-smoke.py`、`qa_native_061.py` | 要安装的 APK |
| `XIANWAI_SHOT_DIR` | `qa_device.py` | 截图输出目录（默认 `tests/android/shots`） |
| `XIANWAI_QA_NOTES` | `qa_native_061.py` | 验收阶段记录文件（默认 `tests/android/notes-061.json`） |

多数浏览器脚本要求应用监听固定端口，例如 `PORT=8790 node server.mjs`。查看脚本顶部的 `const base = ...` 一行即可确认它需要哪个端口。

## tests/browser

- `check.mjs` —— 首页、建档案、手机视口响应式布局（端口 8787）。
- `browser-redesign.mjs` —— 走真实本地模型的完整流程：示例、解读、复制、复盘、档案、设置（端口 8793）。
- `workspace-upgrade.mjs` —— 草稿恢复、解读载荷、可编辑回复、跟进日期、搜索、置顶（端口 8790）。
- `edge-acceptance.mjs` —— Edge 下档案增删改查、备份恢复去重、离线重试（端口 8790，需要 `EDGE_PATH`）。
- `native-current.mjs` —— 安卓/iOS JS 桥接模拟、离线转写、设置、档案反馈（端口 8790；`--ios` 切换 iOS 别名）。
- `android-flows.mjs`、`casebook-current.mjs`、`casebook-v05.mjs` —— 安卓页面流程与档案案例复用（端口 8790）。
- `audio-flow.mjs`、`audio-current.mjs` —— 录音与导入转写流程（`APP_URL`）。
- `audio-negative.mjs` —— 拒绝麦克风与损坏文件的异常处理。
- `audio-mobile-smoke.mjs` —— HTTPS 麦克风录制与 M4A 转写；`--webkit` 走普通 HTTP 的 WAV 变体。
- `subtext-workspace.mjs`、`subtext-actions-check.mjs` —— 解读模块与录制案例的对照检查。
- `run-subtext-bench.mjs BASE OUTPUT [IDS…]` —— 基于 `subtext-cases.mjs` 的基准测试执行器。

夹具服务器（两者都接收一个包含 `server.key` / `server.pem` 的目录）：

```bash
node tests/browser/mock-model.mjs <tls-dir>          # 127.0.0.1:8791 上的假模型
node tests/browser/android-real-model.mjs <tls-dir>  # 转发到本机 llama.cpp（18182）的 HTTPS 透传
```

可用 `node phone-https.mjs 127.0.0.1` 生成本地 TLS 证书对（之后会复用 `.runtime/tls`）。

## tests/android

需要安卓模拟器（脚本会检查 `Xianwai_QA` AVD）或已连接的设备，并先构建 APK（`android/build.ps1`）。

- `emulator-smoke.py [--v05|--v051|--upgrade|--offline…]` —— 安装、录音、离线转写、升级检查。
- `qa_device.py` —— 公共辅助函数（`locate`、`tap`、`screenshot` 等）；直接运行时会导出当前界面树。
- `qa_settings.py`、`qa_case.py`、`qa_audio.py`、`qa_profiles.py`、`qa_review.py`、`qa_reuse.py` —— 各页面流程。
- `qa_native_061.py <阶段>` —— 分阶段验收（`upgrade`、`configure`、`personal`、`audio`、`select`、`interpret`、`record`、`review`、`persist`）；需要 8791 端口上的 `android-real-model.mjs` 透传服务。
- `qa_gallery.py` —— 从 `tests/android/shots` 生成截图拼图（需要 Pillow 与中文字体；`XIANWAI_FONT` 可覆盖字体路径）。

## tests/fixtures

- `mandarin.wav`、`mandarin.m4a`、`delegation-native.wav` —— 普通话测试录音（转写结果需包含预期关键词）。
- `qa-profile.json` —— 用于导入测试的已导出上级档案。
- `coordinator-personal.json`、`owner-personal.json` —— 用于个人信息导入导出测试的文件。
