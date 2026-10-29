# Reed 0.2.1

A fix for the desktop updater introduced in 0.2.0.

## Fixes

- **Check for Updates works.** In 0.2.0 every check failed with "The update was redirected to an unexpected host". Reed now checks every request and redirect hop against the GitHub allowlist as it happens, instead of reading the final address afterwards.
- macOS release builds are notarized with `notarytool`, and stapling retries when Apple's servers are unreachable.

## Updating from 0.2.0

0.2.0 cannot update itself past this bug, so download 0.2.1 once by hand: on macOS open the DMG and drag Reed into Applications (choose Replace); on Windows unzip over the old folder. From 0.2.1 on, **Check for Updates** installs new versions for you. Android installs over 0.2.0 directly.
