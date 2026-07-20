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

## Owner decisions before public visibility

- [ ] **Choose an open-source license.** This is the legal blocker. Common options are:
  - MIT for short, permissive reuse terms;
  - Apache-2.0 for permissive terms with an explicit patent grant;
  - MPL-2.0 for file-level copyleft; or
  - GPL-3.0 for strong copyleft.
- [ ] Confirm the copyright owner name and year used in `LICENSE`.
- [ ] Decide whether the optional hosted relay is a community reference deployment, maintainer-operated service, or self-host-only component.
- [ ] Decide which maintainers may triage private security and conduct reports.

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

- [ ] Publish a current macOS Apple-silicon release; the latest tagged binary currently trails the source version.
- [ ] Decide whether to notarize macOS builds before inviting non-technical users.
- [ ] Publish an Android APK only after release signing, upgrade/install testing, and DC-1 smoke checks.
- [ ] Document checksums for downloadable artifacts.
- [ ] Run `pnpm typecheck`, the full serial Vitest suite, `pnpm test:offline`, and the Android unit/lint/build suite from a clean checkout.
- [ ] Verify a real Unity-authored Pixel Crushers fixture before claiming version certification.
- [ ] Verify that no repository screenshot contains a private path, token, repository, or story.

## Visibility change

- [ ] Run a secret-history scan, not only a working-tree scan.
- [ ] Review commit authorship and remove any accidental personal files from Git history.
- [ ] Confirm third-party dependency and bundled-font licenses are compatible with the selected project license and distribution model.
- [ ] Change visibility only after all legal and security blockers above are resolved.
- [ ] Open the public README, screenshots, issue forms, CI, security page, and release downloads in a signed-out browser.
