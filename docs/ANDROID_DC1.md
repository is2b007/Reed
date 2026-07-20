# Android and Daylight DC-1 setup

Reed Android is designed for the Daylight DC-1's 10.5-inch, 1200×1600 grayscale LivePaper display and Android 13-based Sol:OS. It supports portrait, landscape, split-screen, touch, Wacom stylus selection, Bluetooth/USB keyboards, mice, and trackpads. Local projects, editing, SQLite storage, history, and exports work with Wi-Fi off.

Project Settings is available from the labelled workspace rail. It provides the same offline 47-language game catalog as desktop, canonical BCP 47 tags, the game-market preset, search, custom tags, and a versioned default writing language. Removing a language from the active set preserves its stored text so re-enabling it is reversible. See [Languages and game localization exports](LOCALIZATION_EXPORTS.md).

## Build from source

Requirements:

- JDK 21 to run the build (Android bytecode targets Java 17);
- Android SDK command-line tools;
- Android SDK Platform 36 and Build Tools 35.0.0 (the version selected by Android Gradle Plugin 8.10);
- the Android SDK license terms accepted by the person running the build.

On macOS with Homebrew:

```sh
brew install openjdk@21 android-commandlinetools gradle
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;35.0.0"
cd /absolute/path/to/Reed/apps/android
./gradlew testDebugUnitTest lintDebug assembleDebug
```

The repository includes a pinned Gradle wrapper. Dependency downloads happen at build time; the resulting APK bundles its runtime libraries and UI assets.

## Install on a DC-1

1. Update Sol:OS from **Settings → System → System update** and restart the tablet.
2. Enable Developer options by tapping the build number seven times in **Settings → About tablet**.
3. Enable **USB debugging**, connect the DC-1 to the Mac by USB-C, and approve the tablet's debugging prompt.
4. Verify the device and install:

```sh
adb devices -l
adb install -r /absolute/path/to/Reed/dist/Reed-Android-DC1-debug.apk
```

For a non-development distribution, sign a release APK/AAB with the project release key. Do not ship a debug build as a public release.

## First use

On the project home:

- **New project** creates a fully local SQLite project. English, Greek, Italian, German, and Griko are enabled by default and can be reduced during creation.
- **Clone Git repository** performs the first network request only after it is pressed. The repository must contain `exports/reed-project.json` from Reed desktop or Android.
- Existing projects remain listed and open normally with Wi-Fi disabled.
- The appearance icon cycles System → Dark → Light. Light is often the crispest DC-1 daytime option; dark remains useful in low light.

Landscape gives the most desktop-like Graph workspace. Portrait and split-screen intentionally collapse secondary panels. Sol:OS supports split-screen; use the system app switcher and choose Reed's split-screen action.

## Keyboard, mouse, and trackpad

| Input | Result |
|---|---|
| `Ctrl/Command + K` | Open command palette |
| `Ctrl/Command + S` | Create local Git checkpoint prompt |
| `Ctrl/Command + Shift + P` | Push committed checkpoints |
| `Delete` | Ask to delete the selected line |
| `Escape` | Close command palette or transient UI |
| Tab / Shift+Tab | Move focus forward/back |
| Mouse wheel / two-finger scroll | Pan graph |
| Ctrl/Command + wheel | Zoom graph |
| Drag a node | Live preview; one versioned save on release |
| Hover Wacom pen above node | Preview exact node and reveal its 44dp link port without selecting |
| Hold a pen barrel button + drag | Draw a marquee and select every intersecting node without panning the canvas |
| Primary pen barrel button | Select hovered node |
| Secondary pen barrel / pointer right-click | Open Edit, Start link, and confirmed Delete actions |
| Hover eraser end | Show explicit eraser proximity cursor; never deletes without confirmation |

Most wired and Bluetooth keyboards and mice are supported by the DC-1. Reed claims only Wacom EMR hover/barrel events at the graph boundary; pen contact, dragging, and text-field handwriting remain standard Android input, so Sol:OS keeps control of palm rejection. If a keyboard shortcut types into a focused dialogue field, press Escape or click the canvas before invoking it.

## Git sync without Terminal

Git is optional per project. A local-only project does not contact a remote and remains fully usable.

To connect an existing remote, start from **Clone Git repository**. Public HTTPS repositories need no token. For a private repository, create a fine-grained access token limited to that repository with the minimum repository contents permission needed to read and push. Reed encrypts it using Android Keystore; it is not stored in the project, SQLite, export, or Git config.

Inside the project, select **Git** in the command bar:

1. **Create checkpoint** exports through Core and makes a local commit. It does not use the network.
2. **Fetch** updates remote refs without changing the story.
3. **Pull** accepts a fast-forward only, then validates/imports the project through Core.
4. **Push** sends local checkpoints and never force-pushes.
5. **Sync safely** fetches, then pulls when only the remote is ahead or pushes when only local is ahead.

For an already connected private repository, use **Git → Repository access → Add/Replace access token**. This updates the Android-Keystore-encrypted credential without re-cloning the project. **Remove saved token** returns the repository to credential-free operation, which is useful for public remotes.

If both sides are ahead, Reed reports **diverged** and leaves both histories untouched. Resolve or merge that branch in desktop Reed/GitHub, then fetch and fast-forward the DC-1. This conservative rule avoids a tablet silently resolving a conflict in canonical story JSON.

## Offline acceptance pass

Before relying on a build in production:

1. Open or create a project, turn Wi-Fi and Bluetooth networking off, and restart Reed.
2. Edit English and Greek/Italian text, move nodes, change status, close, and reopen.
3. Rotate portrait/landscape and use split-screen at its narrowest practical width.
4. Exercise touch, pen and eraser hover at different heights, both barrel buttons, stylus contact/drag, keyboard focus, mouse selection/right-click, wheel pan, trackpad pan, zoom, and Delete confirmation.
5. Create a local Git checkpoint offline. Confirm Fetch/Push reports the connection failure without blocking local editing.
6. Reconnect, Fetch, inspect ahead/behind, then Pull or Push.

Reed contains no accounts, telemetry, update checks, remote fonts, remote icons, or hosted project storage. Optional Git actions and explicit Remote Agent Access are the only networking boundaries.

## Connected-test data safety

Android's connected-test lifecycle may replace the debug package and clear that package's local projects, repository tokens, and preferences. Reed therefore refuses every `connected…AndroidTest` Gradle task unless the developer explicitly opts in on a disposable device or Android user profile:

```sh
./gradlew -PallowDeviceDataReset=true :app:connectedDebugAndroidTest
```

Building the test APK with `:app:assembleDebugAndroidTest` is safe and does not touch a connected tablet. Never use the opt-in against a DC-1 that contains the only copy of a project; checkpoint and push or export it first.

## Claude Android through Remote Agent Access

Open the project and select **Agent** to connect Claude Android directly to this tablet's local project without Git. Enter the public HTTPS Reed relay URL, enable the eight-hour session, keep the persistent notification active, and copy the generated URL into a Claude custom connector. Reed continues serving guarded MCP calls while it is in the background. See [Remote MCP from Claude Android](REMOTE_MCP_ANDROID.md) for relay deployment, setup, lifecycle, safety, and testing.

## Current verified build

The 2026-07-20 development build passed Android Core, Git, offline-boundary, stylus, Remote Agent Access, MCP-dispatcher, localized-character import, and on-device pen-marquee ownership tests. The public relay also passed an end-to-end compatibility test using the official MCP TypeScript SDK. Android lint reported zero findings, and APK signature/package inspection passed. The installable debug artifact is:

```text
dist/Reed-Android-DC1-debug.apk
SHA-256 5cee77c5afc149573e0cf7d2531d98abac0d250a84044f1f779bb596bc5a2f31
package com.reed.editor · version 0.1.0 (1) · min API 33 · target API 36
```

The debug APK was installed and launched on DC-1 `JPCQ01140`. An on-device synthetic Wacom event stream verified that a barrel-button marquee takes exclusive gesture ownership and does not also pan the canvas. Physical hover height, Sol:OS palm rejection, background suspend/resume, and the full split-screen acceptance matrix still require human hardware checks. The APK is debug-signed for direct development installation, not public distribution.
