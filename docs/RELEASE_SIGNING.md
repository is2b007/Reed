# Release signing

Reed treats public signing as an acceptance gate, not an optional packaging detail. Development builds remain possible with ad-hoc or debug signatures. A build started with `REED_RELEASE_SIGNING=1` fails unless the target platform's real release credentials are present.

Never commit a private key, certificate, password, token, or generated keystore. The ignored file patterns include `.jks`, `.keystore`, `.p12`, and `.pfx`; GitHub Actions receives release material only through encrypted repository secrets.

## macOS

Public macOS builds require a **Developer ID Application** identity and Apple notarization credentials. The release workflow accepts:

- `APPLE_SIGNING_CERTIFICATE_BASE64`
- `APPLE_SIGNING_CERTIFICATE_PASSWORD`
- `APPLE_BUILD_KEYCHAIN_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_API_KEY_BASE64`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

The workflow imports the certificate into a temporary keychain, signs Reed with Hardened Runtime, submits it to Apple's notary service, staples the ticket, and verifies it with `codesign` and Gatekeeper's `spctl` (which checks the stapled ticket offline). The temporary runner is discarded after the job.

For a local release, set `REED_RELEASE_SIGNING=1`, `APPLE_SIGNING_IDENTITY`, and one notarization method supported by `forge.config.ts`. A Keychain profile is preferred on a maintainer Mac because the secret stays in Keychain.

## Windows

Public Windows builds require:

- `WINDOWS_CERTIFICATE_BASE64`
- `WINDOWS_CERTIFICATE_PASSWORD`

The workflow passes the decoded PFX to Electron Packager's Windows signing integration and verifies every executable, DLL, and native module with SignTool before accepting the ZIP. A sponsored open-source signing service may replace the PFX flow later, but it must provide equivalent verification and must not weaken the fail-closed gate.

## Android

Public Android builds require:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

The stable release key defines Reed's Android upgrade identity. Back it up separately from GitHub; losing it prevents future APK upgrades over the same installed app. Local Gradle builds accept the equivalent `REED_ANDROID_*` environment variables or `reedAndroid*` Gradle properties.

The workflow produces a signed APK for direct installation and an AAB for compatible stores, then verifies both. It never promotes the debug key to a release identity.

## Publishing order

1. Merge a clean release PR after CI passes.
2. Confirm all signing secrets are configured.
3. Create and push the annotated version tag.
4. Wait for every platform job and signature check to pass.
5. Confirm `SHA256SUMS.txt` matches the release assets.
6. Smoke-test the downloaded artifacts on a clean Mac, Windows machine, and Daylight DC-1 before announcing the release.

The final itch.io job also requires `BUTLER_API_KEY`. Create the Reed itch.io project page before tagging; Butler can upload builds but cannot create the page. The workflow publishes the same signed Mac, Windows, and Android artifacts to separate platform channels after the GitHub release succeeds.

Do not manually upload an unsigned replacement under a signed release filename.

## Releasing before every certificate exists

Each platform job checks for its own secrets, so a tag can ship before all signing material is ready:

- **macOS** without `APPLE_SIGNING_CERTIFICATE_BASE64` builds an ad-hoc signed, un-notarized app. People open it the first time with right-click → Open.
- **Windows** without `WINDOWS_CERTIFICATE_BASE64` builds an unsigned ZIP, which SmartScreen may warn about.
- **Android** without `ANDROID_RELEASE_KEYSTORE_BASE64` is left out of the release, because a throwaway signing key would block future upgrades.
- **itch.io** without `BUTLER_API_KEY` is skipped.

The release notes gain an "Installing unsigned builds" section automatically whenever macOS or Windows ships unsigned. Adding the secrets later upgrades the next tag to signed builds with no workflow change.

## Desktop updater

**Check for Updates** (the Reed menu on macOS, Help on Windows, or Settings) reads the latest GitHub release and installs `Reed-<version>-macos-arm64.zip` or `Reed-<version>-windows-x64.zip`. Keep those asset names and `SHA256SUMS.txt` in every release; the updater refuses any archive that does not match its checksum. When the running copy is Developer ID signed, it also refuses an update signed by a different team. On macOS, the first self-update of an ad-hoc signed build may ask for App Management permission in System Settings → Privacy & Security.
