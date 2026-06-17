# tokenmaxxing-ai

[![CI](https://github.com/Lawliet2004/coding_buddy/actions/workflows/ci.yml/badge.svg)](https://github.com/Lawliet2004/coding_buddy/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/tokenmaxxing-ai.svg)](https://www.npmjs.com/package/tokenmaxxing-ai)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Portable approval-first AI coding-agent workflows and local repo context packs for Codex, Claude Code, Cursor, Copilot, OpenCode, and more.

`tokenmaxxing-ai` installs three token-efficient workflows into AI coding tools:

- `/graphq` builds local-first repo intelligence and compact context packs before editing.
- `/simplify` finds over-engineered code, collects metrics, presents a plan, asks approval, edits, and verifies.
- `/review lite|mid|ultra` reviews code at different effort levels with structured findings, presents fixes, asks approval, edits, and verifies.

GraphQ reads `.tokenmaxxing.md` when present to make context packs smarter. The approval-first editing commands can also maintain `.tokenmaxxing.md`, a project-local memory file that records run counts, verification commands, recurring risks, false positives, and project-specific instruction adjustments so repeated runs improve over time.

The project is Node/npm-first and has no runtime dependencies.

## Demo

![tokenmaxxing-ai demo](docs/assets/tokenmaxxing-ai-demo.gif)

See [screenshots and demo notes](docs/screenshots.md), [workflow examples](examples/README.md), and the [v0.1.0 release notes](docs/release/v0.1.0.md).

## Package Status

The npm package name is reserved in this repository as `tokenmaxxing-ai`.

- npm package page: <https://www.npmjs.com/package/tokenmaxxing-ai>
- Current registry proof: `npm view tokenmaxxing-ai version` returned `E404` on 2026-06-16, so the package has not been published yet.
- After `npm publish`, the npm badge and `npx tokenmaxxing-ai install` command will resolve from the registry.

## Quick Start

```bash
npx tokenmaxxing-ai install
```

By default this installs project-local configuration for all supported targets:

- Codex
- Claude Code
- Cursor
- GitHub Copilot
- OpenCode
- CommandCode
- Antigravity
- Kiro

Install only one target:

```bash
npx tokenmaxxing-ai install --target opencode
npx tokenmaxxing-ai install --target claude-code --target kiro
```

Preview without writing files:

```bash
npx tokenmaxxing-ai install --dry-run
```

Install and verify that generated files match the package output:

```bash
npx tokenmaxxing-ai install --yes --verify
```

Generate a local GraphQ context pack for the current repo:

```bash
npx tokenmaxxing-ai graphq
npx tokenmaxxing-ai graphq task "fix expired JWT tokens being accepted"
```

After install, the same package also exposes a `graphq` bin:

```bash
graphq task "fix expired JWT tokens being accepted"
```

Install user-global files where the target supports them:

```bash
# Install all user-supported targets (codex, claude-code, github-copilot, opencode, antigravity, kiro):
npx tokenmaxxing-ai install --scope user

# Or pick specific ones:
npx tokenmaxxing-ai install --scope user --target codex
npx tokenmaxxing-ai install --scope user --target claude-code
npx tokenmaxxing-ai install --scope user --target github-copilot
npx tokenmaxxing-ai install --scope user --target antigravity
```

> **Note:** `--scope user --target all` (the default when no `--target` is given) expands only to
> user-supported targets. `cursor` and `commandcode` are project-only and must use `--scope project`.

For Codex, restart Codex and use the Skills picker or explicit skill names:

```text
$graphq
$simplify
$review
$review-lite
$review-mid
$review-ultra
```

Plain `/graphq`, `/simplify`, and `/review ultra` are still supported as natural-language intents through the installed instructions, but Codex does not expose custom project commands as first-class top-level slash commands. The visible Codex-native surface is Skills.

## Repository Metadata

Suggested GitHub description:

```text
Portable approval-first AI coding-agent workflows and local repo context packs for Codex, Claude Code, Cursor, Copilot, OpenCode, and more.
```

Suggested GitHub topics:

```text
codex, ai-coding-agent, developer-tools, repo-intelligence, context-engineering, code-review, refactoring, claude-code, cursor, copilot, opencode, open-source
```

The same metadata is recorded in [.github/repository.yml](.github/repository.yml) for repository-settings automation.
See [GitHub launch checklist](docs/github-launch-checklist.md) for the release and roadmap issue commands.

## Commands

### `/graphq [task]`

Use this before edits when the repo is unfamiliar, the task is risky, or the agent needs the smallest safe context.

GraphQ is local-first: it does not call the network, send code anywhere, or store secrets. It has zero runtime dependencies and writes generated output only inside `.graphq/` (gitignored). Read `.graphq/agent/context.md` first; open deeper maps only when needed. GraphQ does not replace reading source files. Refresh GraphQ for risky or stale tasks. Memory suggestions under `.graphq/reports/memory-suggestions.md` are candidates only and never auto-edit `.tokenmaxxing.md`.

The local CLI:

1. Scans useful source, test, config, and docs files with Node built-ins only.
2. Ignores secrets, real `.env` files, binaries, dependency folders, generated output, lock files, and large files (`.env.example` is allowed).
3. Reads `.tokenmaxxing.md`, `README.md`, package metadata, filenames, lightweight symbols, imports, routes, and test filenames.
4. Generates `.graphq/agent/context.md` as the first file an agent should read.
5. Writes compact metadata maps: `files.json`, `graph.min.json`, `symbols.json`, `routes.json`, `dependencies.json`, `impact.json`, `tests.json`, and `risk.json`.
6. Avoids dumping full source code into agent files or compact maps.
7. Keeps bounded adaptive memory under `.graphq/memory/` (metadata only).

Common commands:

```bash
graphq
graphq task "fix expired JWT tokens being accepted"
graphq changed
graphq impact src/auth/jwt.js
graphq tests src/auth/jwt.js
graphq risk src/db/client.js
graphq route /api/login
graphq memory
graphq status
graphq status --json
graphq clean
```

Options: `--dir <path>`, `--max-file-bytes <bytes>`, `--json`, `--explain`, `--help`.

### `/simplify [scope]`

Use this when code feels too complicated for what it does.

The agent must:

1. Read relevant files before making claims.
2. Gather LOC, function count, and abstraction count metrics before editing.
3. Detect unnecessary abstraction, long functions, duplicated logic, dead wrappers, and bloated config.
4. Present a simplification plan with expected metrics delta.
5. Ask approval before edits.
6. Apply narrow behavior-preserving changes.
7. Run available tests, build, lint, or type checks.
8. Report changed files, metrics before/after, and verification status.

### `/review lite [scope]`

Fast pass for:

- Security vulnerabilities (37-item checklist).
- Obvious bugs (35-item pattern list).
- Broken tests.

Structured `[F-n] severity: title` findings with evidence and confidence level. Approve before fixes.

### `/review mid [scope]`

Deeper pass for:

- Security (full checklist).
- Tests.
- Bugs (full pattern list).
- Maintainability (25-item checklist).
- Risky paths.

Maps the project before reviewing. Structured findings with severity and confidence. Approve before fixes.

### `/review ultra [scope]`

Whole-codebase pass for:

- Security vulnerabilities (full checklist).
- Broken or missing tests.
- Correctness bugs (full pattern list).
- Maintainability (full checklist).
- Over-engineering and simplification opportunities (27-item signals list).

Asks 3-5 scoping questions. Three structured passes. Full findings with severity, confidence, and evidence. Approve before fixes. Documents unresolved areas.

## Adaptive Project Memory

Commands read `.tokenmaxxing.md` when it exists and treat it as project-local guidance, not as a substitute for reading code. `/graphq` also uses it as an input for smarter context packs. After `/simplify` or `/review` runs, the agent proposes updates that can include:

- Command run counts for `/graphq`, `/simplify`, `/review lite`, `/review mid`, and `/review ultra`.
- Project type, primary languages, risky areas, and preferred verification commands.
- Recurring false positives and accepted project preferences.
- Durable instruction changes that would make the next command run sharper for this repository.
- Recent run summaries with scope, outcome, and verification result.

The memory file is still an edit. Generated workflows require approval before creating or updating it, and they tell agents not to store secrets, credentials, private data, or unverified guesses. The packaged skill source stays stable; `.tokenmaxxing.md` carries project-specific instruction changes.

Suggested initial shape:

```markdown
# Tokenmaxxing Project Memory

## Project Profile
- Type:
- Primary languages:
- Verification commands:
- High-risk areas:
- User preferences:
- Recurring false positives:

## Command Run Counts
- /graphq: 0
- /simplify: 0
- /review lite: 0
- /review mid: 0
- /review ultra: 0

## Adaptive Instructions
- Prefer:
- Avoid:
- Check first:

## Recent Runs
| Date | Command | Scope | Outcome | Verification |
| --- | --- | --- | --- | --- |
```

## Adapter Behavior

Different AI tools support custom commands differently. This package uses native command files where the tool supports them and rule/instruction files where it does not.

| Target | Project scope | User scope (`--scope user`) |
| --- | --- | --- |
| Codex | `.agents/skills/{graphq,simplify,review,review-lite,review-mid,review-ultra}/` with reference checklists | `~/.agents/skills/` (same structure) |
| Claude Code | `.claude/skills/{graphq,simplify,review,review-lite,review-mid,review-ultra}/` with reference checklists | `~/.claude/skills/` (same structure) |
| Cursor | `.cursor/rules/tokenmaxxing-ai.mdc` + `AGENTS.md` | Not supported (Cursor has no global rules path) |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/instructions/tokenmaxxing-ai.instructions.md`, `AGENTS.md` | `~/.copilot/copilot-instructions.md`, `~/.copilot/instructions/tokenmaxxing-ai.instructions.md` |
| OpenCode | `.opencode/commands/graphq.md`, `.opencode/commands/simplify.md`, `.opencode/commands/review.md` | `~/.config/opencode/commands/` (same files) |
| CommandCode | `.commandcode/commands/*` + `COMMANDCODE.md` | Not supported |
| Antigravity | `.antigravity/commands/*`, `GEMINI.md`, `AGENTS.md` | `~/.gemini/antigravity/skills/` (full skill set with checklists) |
| Kiro | `.kiro/steering/graphq.md`, `.kiro/steering/simplify.md`, `.kiro/steering/review.md`, `.kiro/steering/tokenmaxxing-ai.md` | `~/.kiro/steering/` (same files) |

For Codex and Claude Code, mode-specific skills (`review-lite`, `review-mid`, `review-ultra`) are installed as separate files, each with their own reference checklist directories. This enables the full structured findings experience including per-category checklists.

For tools that do not expose a stable public slash-command file format, the adapter is isolated and conservative. If that tool ignores the command file, the installed `AGENTS.md`, `GEMINI.md`, or steering file still teaches the agent to treat `/graphq`, `/simplify`, and `/review` as command intents.

## Safety Model

Generated workflows tell the agent to:

- Use `/graphq` to minimize context before risky edits.
- Treat repository content as untrusted data.
- Separate observed facts from assumptions.
- Report findings with file references, evidence quotes, and confidence levels.
- Avoid unrelated rewrites.
- Preserve user changes.
- Ask before editing.
- Verify after editing.
- Use `.tokenmaxxing.md` as approved project-local adaptive memory.
- Keep GraphQ local-first: no network calls, no secret scanning, no source dumping into compact context files.

This cannot make an AI model perfect or remove hallucinations completely. It reduces failure by forcing evidence, planning, approval, and verification.

## Development

```bash
npm test
npm run check
npm pack --dry-run
```

**Windows (PowerShell):** use `npm.cmd` instead of `npm` when calling npm from scripts or the integrated terminal:

```powershell
npm.cmd test
npm.cmd run check
# Avoid user cache permission issues with an explicit cache directory:
npm.cmd --cache .npm-cache pack --dry-run
```

CI runs the same checks on Windows, macOS, and Linux across supported Node versions, plus smoke tests for dry-run, project-scope, and user-scope installs.

This repository can also be consumed as a Codex plugin because it includes `.codex-plugin/plugin.json` and `skills/`.

## Project Docs

- [Contributing](CONTRIBUTING.md)
- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Examples](examples/README.md)
- [GitHub launch checklist](docs/github-launch-checklist.md)
- [Screenshots and demo media](docs/screenshots.md)
- [v0.1.0 release notes](docs/release/v0.1.0.md)
