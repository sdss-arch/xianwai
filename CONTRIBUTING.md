# 为弦外做贡献

感谢你希望改进弦外 (Xianwai)。Issues、讨论和 Pull Request 欢迎使用中文交流。

## 开始开发

环境要求：

- Node.js 22 或更新版本
- Python 3（仅安卓测试脚本需要）
- Chromium 内核浏览器（浏览器端测试需要）

```bash
git clone https://github.com/sdss-arch/xianwai.git
cd xianwai
npm install                          # 安装测试用的 Playwright
node server.mjs                      # http://127.0.0.1:8787
```

默认情况下分析服务连接本机 `http://127.0.0.1:18182/v1` 的模型（见 README「数据与模型」）。
只做界面调试时，可用 `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME` 指向任意 OpenAI 兼容接口。

## 测试

- 静态检查：JavaScript / Python 语法、PowerShell 解析、语境规则单元测试——CI 在每次 push 时运行（`.github/workflows/ci.yml`）。
- 端到端测试：Playwright 浏览器测试与 adb 安卓测试，端口与环境变量见 [`tests/README.md`](tests/README.md)。

提交前请先本地运行单元测试：

```bash
node tests/browser/subtext-actions-check.mjs
```

## 代码风格

- 遵循 [`.editorconfig`](.editorconfig)：JavaScript / YAML / JSON / Markdown 用 2 空格，Python / Java / Swift 用 4 空格。
- 保持 `server.mjs` 与 `public/` 共用模块的零运行时依赖：运行时代码不得依赖 `npm install`。
- 原有代码中的注释与界面文案为中文，改动时保持与所在文件一致。

## 提交 PR

1. Fork 仓库并从 `main` 创建分支。
2. 改动聚焦，一个 PR 只做一件事。
3. 确认改动的 JavaScript 文件通过 `node --check`，单元测试为绿色。
4. 按 PR 模板填写（改了什么 / 为什么 / 怎么验证的）。
5. 维护者会尽快评审。

## 报告问题

请使用 [Bug 报告模板](https://github.com/sdss-arch/xianwai/issues/new?template=bug_report.yml)，注明平台（浏览器 / 安卓 / iOS）、版本和复现步骤。安全漏洞请勿公开提交，见 [`SECURITY.md`](SECURITY.md)。

## 许可证

贡献即表示你同意你的代码以本仓库的 [MIT License](LICENSE) 授权。
