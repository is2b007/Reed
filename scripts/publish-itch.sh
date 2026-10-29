#!/usr/bin/env bash
set -euo pipefail

VERSION="${REED_RELEASE_VERSION:-$(node -p "require('./package.json').version")}"
TARGET="${ITCH_TARGET:-maniadesign/reed}"
RELEASE_DIR="${REED_RELEASE_DIR:-release}"
ACCOUNT="${TARGET%%/*}"
PROJECT="${TARGET#*/}"

command -v butler >/dev/null 2>&1 || {
  echo "butler is not installed. Install it from https://itch.io/docs/butler/installing.html" >&2
  exit 1
}

MAC_DMG="$RELEASE_DIR/Reed-$VERSION-macos-arm64.dmg"
WINDOWS_ZIP="$RELEASE_DIR/Reed-$VERSION-windows-x64.zip"
ANDROID_APK="$RELEASE_DIR/Reed-$VERSION-android.apk"

# macOS and Windows are required; Android ships only when the release keystore was configured.
for artifact in "$MAC_DMG" "$WINDOWS_ZIP"; do
  test -f "$artifact" || {
    echo "Missing release artifact: $artifact" >&2
    exit 1
  }
done

CHANNELS="macos-arm64, windows-x64"
butler push "$MAC_DMG" "$TARGET:macos-arm64" --userversion "$VERSION"
butler push "$WINDOWS_ZIP" "$TARGET:windows-x64" --userversion "$VERSION"
if test -f "$ANDROID_APK"; then
  butler push "$ANDROID_APK" "$TARGET:android" --userversion "$VERSION"
  CHANNELS="$CHANNELS, android"
else
  echo "No Android APK in $RELEASE_DIR; leaving the android channel unchanged." >&2
fi

echo "Published Reed $VERSION to https://$ACCOUNT.itch.io/$PROJECT (channels: $CHANNELS)"
