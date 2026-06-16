# Roadmap

This roadmap is intentionally practical: tokenmaxxing-ai should stay small, portable, and useful across coding agents.

## v0.1.x - Launch Polish

- Publish `tokenmaxxing-ai@0.1.0` to npm.
- Publish GitHub release `v0.1.0` with install and verification notes.
- Add real terminal demo media from a clean install after the npm package is live.
- Keep CI green across Node 20 and 22 on Windows, macOS, and Linux.

## v0.2.x - Adapter Coverage

- Tighten generated instructions for Codex, Claude Code, Cursor, GitHub Copilot, OpenCode, CommandCode, Antigravity, and Kiro based on real user feedback.
- Add focused regression tests for every target's generated files.
- Document known limitations for tools whose command formats are not stable public APIs.

## v0.3.x - Release Automation

- Add a repeatable release checklist or script for npm package verification.
- Add changelog maintenance to the release flow.
- Add provenance-friendly publishing guidance when npm and GitHub release permissions are ready.

## Later

- Evaluate optional media assets and docs site generation without adding runtime dependencies.
- Consider additional agent targets only when their command or instruction format is stable enough to test.
- Keep adaptive memory concise and project-local.
