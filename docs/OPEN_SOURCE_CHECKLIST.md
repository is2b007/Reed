# Open-source launch checklist

This checklist separates repository preparation from the one-way owner decisions required before changing Reed from private to public.

## Completed in the repository

- [x] Product-focused README with real demo screenshots.
- [x] macOS and Android/DC-1 build and support boundaries.
- [x] Architecture and offline/network trust-boundary documentation.
- [x] Contributor setup and test tiers.
- [x] Security policy and private reporting path.
- [x] Code of Conduct.
- [x] Bug, feature, and pull-request templates.
- [x] Least-privilege GitHub Actions CI definition.
- [x] Generated visual assets use no production story data.
- [x] Repository description and topics prepared.
- [x] Mozilla Public License 2.0 and copyright notice added.
- [x] Public release signing is fail-closed on macOS, Windows, and Android.
- [x] Tag-triggered release workflow verifies signatures and publishes checksums.
- [x] itch.io publishing script accepts only the expected signed artifacts.
- [x] Production dependency licenses audited and recorded in `THIRD_PARTY_NOTICES.md`.

## Owner decisions before public visibility

- [x] **Open-source license:** Mozilla Public License 2.0 (file-level copyleft with an explicit patent grant).
- [x] Copyright owner and year: Kosta Canatselis, 2026.
- [x] Treat the optional relay as a self-hostable community reference component; no public hosted-service availability or uptime is promised.
- [x] Repository owner Kosta Canatselis is the initial maintainer for private security and conduct reports.

Do not change repository visibility until a license is committed. A public repository without a license is visible source, not open source.

## GitHub settings

- [ ] Upload `docs/assets/reed-hero-background.png` as the repository social preview.
- [ ] Enable Issues and keep blank issues disabled.
- [ ] Enable Discussions only if someone will actively moderate it.
- [ ] Enable private vulnerability reporting.
- [ ] Enable secret scanning and push protection where the account plan allows it.
- [ ] Enable Dependabot alerts and security updates.
- [ ] Protect `main`: require pull requests, require CI, block force pushes, and require the branch to be current before merge.
- [ ] Configure merge methods; squash or merge commits are both compatible with Reed's project workflow.
- [ ] Review repository Actions permissions and keep the default workflow token read-only unless a workflow explicitly needs more.
- [ ] Add a public contact method for Code of Conduct reports.

## Release readiness

- [ ] Publish the signed and notarized macOS Apple-silicon v0.2.0 release.
- [x] Require notarization for every public macOS build.
- [ ] Publish an Android APK only after release signing, upgrade/install testing, and DC-1 smoke checks.
- [x] Generate `SHA256SUMS.txt` from the final signed downloadable artifacts.
- [x] Run `pnpm typecheck`, the full serial Vitest suite, `pnpm test:offline`, and the Android unit/lint/build suite from a clean checkout.
- [ ] Verify a real Unity-authored Pixel Crushers fixture before claiming version certification.
- [ ] Verify that no repository screenshot contains a private path, token, repository, or story.

## Visibility change

- [x] Run secret scans across both Git history and the release worktree.
- [x] Review commit authorship and tracked paths; no signing keys, credentials, environment files, or accidental personal files are present in Git history.
- [x] Confirm third-party dependency and bundled-font licenses are compatible with the selected project license and distribution model.
- [ ] Change visibility only after all legal and security blockers above are resolved.
- [ ] Open the public README, screenshots, issue forms, CI, security page, and release downloads in a signed-out browser.
