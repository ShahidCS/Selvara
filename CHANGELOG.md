# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Releases are cut from signed tags (see [docs/security/PIPELINE.md](docs/security/PIPELINE.md)).

## [Unreleased]

### Changed
- Documentation moved into `docs/architecture/`, `docs/guides/` and `docs/security/`; `front-end/docs/` no longer exists.

### Added
- `CONTRIBUTING.md`, `AGENTS.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `.editorconfig`, `.gitattributes`, `.git-blame-ignore-revs`, issue templates and `docs/ORGANIZATION.md`.
- Secure CI/CD pipeline: static analysis, secret and dependency scanning, licence policy, SBOM, container and dynamic scanning, staging deploy and tag-driven production release.
- Next.js (Pages Router) front-end migrated from the HTML prototype.
