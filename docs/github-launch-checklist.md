# GitHub Launch Checklist

This checklist records the GitHub-side launch work for the Codex for OSS submission. The repository content is already present locally; these commands require an authenticated GitHub CLI session with write access to `Lawliet2004/coding_buddy`.

## Authenticate

```bash
gh auth login
gh auth status
```

## Repository Metadata

```bash
gh repo edit Lawliet2004/coding_buddy --description "Portable approval-first AI coding-agent workflows for Codex, Claude Code, Cursor, Copilot, OpenCode, and more."
gh repo edit Lawliet2004/coding_buddy --add-topic codex --add-topic ai-coding-agent --add-topic developer-tools --add-topic code-review --add-topic refactoring --add-topic claude-code --add-topic cursor --add-topic copilot --add-topic opencode --add-topic open-source
```

The same description and topics are stored in `.github/repository.yml` for repository-settings automation.

## Release v0.1.0

Run this after committing and pushing the release docs and metadata changes.

```bash
git status --short
git tag --list v0.1.0
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --repo Lawliet2004/coding_buddy --title "v0.1.0" --notes-file docs/release/v0.1.0.md
```

If `git tag --list v0.1.0` already prints `v0.1.0`, skip `git tag -a v0.1.0 -m "v0.1.0"` and only push or create the GitHub release if missing.

## Roadmap Issues

Create 5-8 public roadmap issues so the project looks active, inspectable, and honest about near-term work.

```bash
gh issue create --repo Lawliet2004/coding_buddy --title "Improve README demo GIF with a clean install recording" --body "Goal: Add or replace the README demo GIF with a short, high-signal terminal recording from a clean install. Acceptance criteria: shows install, command invocation, approval gate, and verification output; GIF loads quickly on GitHub; README and docs/screenshots.md reference the same asset."
```

```bash
gh issue create --repo Lawliet2004/coding_buddy --title "Add examples for real-world repositories" --body "Goal: Add examples that show tokenmaxxing-ai workflows on realistic repository shapes, not only toy snippets. Acceptance criteria: include at least one CLI/library repo example and one frontend or full-stack repo example; show expected prompts, approval points, and verification commands; keep examples free of private code and secrets."
```

```bash
gh issue create --repo Lawliet2004/coding_buddy --title "Add npm publishing workflow" --body "Goal: Document and automate the npm publish path for versioned releases. Acceptance criteria: add a release checklist or GitHub Actions workflow for npm publication; include package verification with npm pack --dry-run; document required secrets and provenance expectations without committing credentials."
```

```bash
gh issue create --repo Lawliet2004/coding_buddy --title "Add benchmark demo comparing normal AI review vs tokenmaxxing-ai review" --body "Goal: Create a small, reproducible demo that compares an ordinary AI review prompt against tokenmaxxing-ai review mode. Acceptance criteria: use a public fixture repository or synthetic fixture with known issues; compare evidence quality, approval gates, and verification behavior; publish results in docs without overclaiming general benchmark performance."
```

```bash
gh issue create --repo Lawliet2004/coding_buddy --title "Expand Codex Skills installation docs" --body "Goal: Make Codex-specific installation and usage clearer for users who discover the package from Codex. Acceptance criteria: add a dedicated Codex Skills install section or page; explain project-scope and user-scope installation paths; explain how to invoke simplify and review skills after restarting Codex."
```

```bash
gh issue create --repo Lawliet2004/coding_buddy --title "Add adapter compatibility verification matrix" --body "Goal: Document which generated files are installed for each supported coding agent and how those outputs are verified. Acceptance criteria: add a matrix for Codex, Claude Code, Cursor, Copilot, OpenCode, CommandCode, Antigravity, and Kiro; link each target to relevant install examples; note known limitations for tools without stable slash-command file formats."
```

```bash
gh issue create --repo Lawliet2004/coding_buddy --title "Add release automation checklist" --body "Goal: Make future releases repeatable and less dependent on local operator memory. Acceptance criteria: add a release checklist covering tests, pack dry-run, tags, GitHub release, and npm publish; include rollback notes for failed publish steps; keep the checklist compatible with Windows PowerShell and POSIX shells."
```
