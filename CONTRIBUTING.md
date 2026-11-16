# Contributing to Xianwai

Thanks for your interest in improving Xianwai (弦外). Chinese and English are both welcome in issues, discussions, and pull requests — 中文和英文都欢迎使用。

## Getting started / 开始开发

Prerequisites / 环境要求:

- Node.js 22 or newer / Node.js 22 或更新版本
- Python 3 (only for Android test scripts / 仅安卓测试脚本需要)
- A Chromium-based browser for browser tests / 浏览器测试需要 Chromium 内核浏览器

```bash
git clone https://github.com/sdss-arch/xianwai.git
cd xianwai
npm install                          # installs Playwright for tests
node server.mjs                      # http://127.0.0.1:8787
```

By default the analysis service expects a local model endpoint at
`http://127.0.0.1:18182/v1` (see README "Data and models"). For UI work you can
point it at any OpenAI-compatible endpoint with `MODEL_BASE_URL`,
`MODEL_API_KEY`, `MODEL_NAME`.

默认情况下分析服务连接本机 `http://127.0.0.1:18182/v1` 的模型；只做界面调试时，
可用 `MODEL_BASE_URL` 等环境变量指向任意 OpenAI 兼容接口。

## Tests / 测试

- Static checks / 静态检查: JavaScript syntax, Python syntax, PowerShell parse, analysis-rule unit test — this is what CI runs on every push (`.github/workflows/ci.yml`).
- End-to-end tests / 端到端测试: see [`tests/README.md`](tests/README.md) for Playwright browser tests and adb Android tests, including required ports and environment variables.

Run the unit test locally before pushing / 提交前请先本地运行单元测试:

```bash
node tests/browser/subtext-actions-check.mjs
```

## Code style / 代码风格

- Follow [`.editorconfig`](.editorconfig): 2 spaces for JavaScript/YAML/JSON/Markdown, 4 spaces for Python/Java/Swift.
- Keep the zero-dependency property of `server.mjs` and the shared `public/` modules — runtime code must not require `npm install`.
- Comments and user-facing strings are in Chinese where the original code is; keep them consistent with the surrounding file.
- 保持 `server.mjs` 与 `public/` 共用模块的零运行时依赖：运行时代码不得依赖 `npm install`。

## Pull requests / 提交 PR

1. Fork and create a branch from `main`.
2. Make focused changes; one logical change per PR.
3. Make sure `node --check` passes for changed JavaScript files and the unit test is green.
4. Fill in the pull request template (what / why / how tested).
5. A maintainer will review as soon as possible.

## Reporting bugs / 报告问题

Please use the [bug report template](https://github.com/sdss-arch/xianwai/issues/new?template=bug_report.yml) and include the platform (browser / Android / iOS), version, and steps to reproduce. For security issues, see [`SECURITY.md`](SECURITY.md) instead — please do not open public issues for security vulnerabilities.

## License / 许可证

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) of this repository.
