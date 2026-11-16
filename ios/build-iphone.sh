#!/bin/bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }

if [[ $# -lt 2 || $# -gt 3 ]]; then
  fail '用法：bash build-iphone.sh archive|ipa TEAM_ID [BUNDLE_ID]'
fi

mode=$1
team_id=$2
bundle_id=${3:-app.xianwai.workplace.ios}
[[ "$mode" == archive || "$mode" == ipa ]] || fail '请选择 archive 或 ipa。'
[[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'Team ID 应为 10 位大写字母或数字。'
[[ "$bundle_id" =~ ^[A-Za-z0-9-]+([.][A-Za-z0-9-]+)+$ ]] || fail '请填写有效的 Bundle Identifier。'
[[ "$(uname -s)" == Darwin ]] || fail '请在装有 Xcode 的 Mac 上运行。'
xcrun --sdk iphoneos --show-sdk-path >/dev/null 2>&1 || fail '找不到 iPhone SDK，请先完成 Xcode 的首次启动设置。'

project_dir="$(cd "$(dirname "$0")" && pwd -P)"
models="$project_dir/AppAssets/web/voice-model/whisper-base/onnx"
[[ -s "$project_dir/AppAssets/web/index.html" && -s "$models/encoder_model_quantized.onnx" && -s "$models/decoder_model_merged_quantized.onnx" ]] ||
  fail '离线转写资源不全，请解压完整的 iPhone 发行工程，或按 README 生成 AppAssets。'

mkdir -p "$project_dir/Build"
output="$(mktemp -d "$project_dir/Build/Xianwai.XXXXXX")"
archive="$output/Xianwai.xcarchive"

xcodebuild -project "$project_dir/Xianwai.xcodeproj" -scheme Xianwai -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$archive" \
  -allowProvisioningUpdates "DEVELOPMENT_TEAM=$team_id" "PRODUCT_BUNDLE_IDENTIFIER=$bundle_id" archive
[[ -d "$archive/Products/Applications/Xianwai.app" ]] || fail '构建未生成 iPhone 应用，请检查 Xcode 输出。'

if [[ "$mode" == archive ]]; then
  printf '\n归档完成。可在 Xcode Organizer 中选择 TestFlight 分发。\n%s\n' "$archive"
  exit 0
fi

options="$output/ExportOptions.plist"
cat >"$options" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>release-testing</string>
<key>signingStyle</key><string>automatic</string>
<key>teamID</key><string>$team_id</string>
</dict></plist>
EOF

xcodebuild -exportArchive -archivePath "$archive" -exportPath "$output/Install" \
  -exportOptionsPlist "$options" -allowProvisioningUpdates
shopt -s nullglob
packages=("$output/Install/"*.ipa)
[[ "${#packages[@]}" == 1 ]] || fail '预期导出一个 IPA，请检查 Xcode 输出。'
printf '\n已导出可供签名档案中已注册设备安装的 IPA。\n%s\n' "${packages[0]}"
