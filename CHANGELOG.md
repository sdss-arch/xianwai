# Changelog / 更新日志

All notable changes to this project are documented in this file.
本项目的重要变更都会记录在这个文件中。Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] / 未发布

### Added / 新增

- GitHub Actions CI: JavaScript/Python syntax checks, analysis-rule unit test, server smoke test on every push and pull request. / GitHub Actions CI：每次 push 与 PR 自动运行 JS/Python 语法检查、语境规则单元测试和服务冒烟测试。
- Community files: CONTRIBUTING (中英), SECURITY policy, issue forms, pull request template. / 社区文件：中英双语 CONTRIBUTING、安全政策、Issue 表单、PR 模板。

## [0.6.1] - 2026-11-16

First open-source release. / 首个开源版本。

### Added / 新增

- **Browser app (PWA)** — paste a dialogue or record/import audio, offline Whisper transcription with proofreading, contextual reading with original-line evidence, editable replies, reviews with follow-up dates, and manager profiles distilled from confirmed cases. / **网页版（PWA）**：贴入对话或录音导入，Whisper 离线转写与校对，带原话依据的语境解读，可编辑回复，带跟进日期的复盘，以及从已确认案例提炼的上级档案。
- **Android app** — signed APK sharing the same web frontend, native HTTPS model bridge, Keystore-encrypted API settings, offline on-device transcription, local recording library. / **安卓版**：与网页版共用前端的签名 APK、原生 HTTPS 模型通道、Keystore 加密的密钥设置、设备端离线转写、本机录音库。
- **iOS app** — standalone Xcode project bundling the offline transcription model (build/signing pending). / **iOS 版**：独立 Xcode 工程，内置离线转写模型（构建与签名待完成）。
- **Local model runtime** — Windows launcher downloads pinned llama.cpp and Qwen3-4B-Instruct-2507 quantized weights; any OpenAI-compatible endpoint can be configured instead. / **本地模型运行时**：Windows 启动器自动下载固定版本的 llama.cpp 与 Qwen3-4B 量化权重，也可配置任意 OpenAI 兼容接口。
- **Phone preview over HTTPS** — `Start.cmd -Phone -Address …` generates a local test certificate for phone recording and transcription. / **手机 HTTPS 预览**：`Start.cmd -Phone -Address …` 生成本地测试证书，供手机录音与转写。
- **Tests** — Playwright browser tests, adb Android tests, Mandarin audio fixtures, module-level unit tests. / **测试**：Playwright 浏览器测试、adb 安卓测试、普通话音频样例与模块级单元测试。

### Notes / 说明

- Versions 0.3.0 – 0.6.0 were distributed as signed builds before the repository was published; their history predates this changelog. / 0.3.0 – 0.6.0 为开源前的签名分发版本，其历史早于本变更日志。
