# Changelog

## [0.1.0] - 2026-06-16

### Added

- Initial `tokenmaxxing-ai` CLI.
- Project and user-scope installers for Codex, Claude Code, Cursor, GitHub Copilot, OpenCode, CommandCode, Antigravity, and Kiro.
- `/simplify` workflow for approval-first simplification.
- `/review` workflow with lite, mid, and ultra modes.
- Adaptive `.tokenmaxxing.md` project memory guidance.
- CI across Windows, macOS, and Linux on Node 20 and 22.
- Launch docs, examples, roadmap, release notes, and demo asset.

### Security

- Installer path resolution rejects absolute adapter paths and traversal outside the selected install root.
- Generated workflows require explicit approval before edits.
- CI token permissions are read-only for repository contents.
