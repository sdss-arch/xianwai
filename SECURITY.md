# Security policy / 安全政策

## Supported versions / 支持的版本

| Version / 版本 | Supported / 是否支持 |
| --- | --- |
| 0.6.x | ✅ |
| < 0.6 | ❌ 请升级 / please upgrade |

## Reporting a vulnerability / 报告安全漏洞

**Please do not report security vulnerabilities through public GitHub issues.**

**请不要通过公开的 GitHub Issues 报告安全漏洞。**

Please use GitHub's private advisory feature instead:

请使用 GitHub 的私密安全通告功能：

**https://github.com/sdss-arch/xianwai/security/advisories/new**

Include the following when you report / 提交时请包含：

- Affected component (browser app, Android app, `server.mjs`, build scripts) / 受影响的组件（网页版、安卓版、`server.mjs`、构建脚本）
- Steps to reproduce / 复现步骤
- Impact assessment / 影响评估
- Any suggested fix (optional) / 修复建议（可选）

You should receive a response within 7 days. Please allow a reasonable window for a fix before any public disclosure. / 我们会在 7 天内回复；公开披露前请给修复留出合理时间。

## Scope notes / 范围说明

- Xianwai sends only the dialogue lines you tick, optional context, and the selected profile to the model endpoint you configure. Reports about unexpected data leaving the device are in scope. / 弦外只会把你勾选的对话句子、选填背景和所选档案发送到你配置的模型接口；任何「设备上未预期的数据外发」都属于报告范围。
- The bundled local model path (llama.cpp + Qwen) runs on `127.0.0.1` only. / 内置本地模型只监听 `127.0.0.1`。
- Model *outputs* are inferences, not facts — see the README disclaimer. Issues about wrong readings are normal bug reports, not security issues. / 模型输出是推断而非事实（见 README 免责声明）；解读错误属于普通 Bug，不是安全问题。
