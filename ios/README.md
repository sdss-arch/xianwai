# 弦外 iOS 0.5.1

这是 iPhone 的独立 Xcode 工程，最低部署目标为 iOS 16.4。发布包中的 `AppAssets` 包含界面和离线转写模型。

## 只有 Windows 时

可以用云端 Mac 进行编译。将发行工程解压，把其中的 `Xianwai-iOS` 目录内容放在私有 GitHub 仓库根目录，包含隐藏的 `.github` 目录和 `AppAssets`。用仓库的 **Actions → Build iPhone app → Run workflow** 检查真机平台能否编译。该流程会校验离线模型及编译产物。

构建检查完成后，需要用有权限的 Apple 开发者团队签名才能生成安装包或发布到 TestFlight。代码签名材料可放在你控制的构建环境中。 [GitHub 的 Apple 签名说明](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)

## 安装到自己的 iPhone

1. 在 Mac 解压工程，用 Xcode 打开 `Xianwai.xcodeproj`，并在 **Settings → Accounts** 登录 Apple 账户。
2. 选择 Xianwai 应用目标，在 **Signing & Capabilities** 勾选自动签名并选择自己的 Team。若提示 App ID 被占用，换成自己的 Bundle Identifier。
3. 将 iPhone 连到 Mac，按设备提示信任电脑或启用开发者模式，在 Xcode 选中手机并点击 Run。普通 Apple 账户可以使用 Personal Team，免费的签名有效期为 7 天。
4. 首次运行在「设置」里填写支持 OpenAI 兼容 Chat Completions 的 HTTPS API 地址和模型，再点「测试连接」。原始录音与转写留存在设备上。主动解读时，选中的文字、填写的上下文和命中的档案案例会发给你配置的模型。

## 生成 TestFlight 归档或指定设备的安装包

使用已登录且具有签名权限的 Apple Developer Program 团队。在工程目录打开终端，用实际的 Team ID 和 Bundle Identifier 替换下面的示例值。

- `bash build-iphone.sh archive ABCDE12345 com.yourname.xianwai` 生成 `.xcarchive`。先在 App Store Connect 建立对应 Bundle ID 的应用记录，再到 Xcode Organizer 上传归档。处理完成后添加 TestFlight 测试员，之后可从 iPhone 上的 TestFlight 安装。上传时使用 Apple 当前要求的 Xcode 和 SDK。 [Apple 的构建上传要求](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)
- `bash build-iphone.sh ipa ABCDE12345 com.yourname.xianwai` 导出给已注册设备使用的 `.ipa`。先把目标 iPhone 加到该团队的设备列表，再用 Apple Configurator 将导出的包安装到已注册设备。安装后按系统提示启用开发者模式。

归档和安装包存放在脚本输出的 `Build` 路径下。普通账户自用请走上面的 Xcode 安装步骤。

从主工程源码构建时，如果同级缺少 `AppAssets`，先运行 `node android/build-assets.mjs ios/AppAssets`。可用 `ASR_CACHE_DIR` 指向现有模型缓存。

这个工程包在 Windows 整理。iOS 原生构建、签名及真机验收仍待在 Mac 和 iPhone 上完成。
