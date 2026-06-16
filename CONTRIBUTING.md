# Contributing

Thanks for helping improve tokenmaxxing-ai. This project is a small Node CLI package, so contributions should stay focused, dependency-light, and easy to verify.

## Development Setup

```bash
git clone https://github.com/Lawliet2004/coding_buddy.git
cd coding_buddy
npm install --ignore-scripts
npm test
npm run check
```

On Windows PowerShell, prefer `npm.cmd`:

```powershell
npm.cmd test
npm.cmd run check
npm.cmd --cache .npm-cache pack --dry-run
```

## Contribution Guidelines

- Keep runtime dependencies at zero unless there is a strong reason.
- Preserve approval-first behavior: generated workflows must ask before edits.
- Add or update tests for CLI behavior, installer behavior, path handling, and generated template output.
- Avoid consolidating duplicated review checklist files across `skills/review-*`; those copies are intentional so each skill can be packaged standalone.
- Do not commit local analysis output, npm cache output, logs, `.env` files, keys, or generated temp installs.

## Verification Before a PR

Run:

```bash
npm test
npm run check
npm pack --dry-run
node bin/tokenmaxxing-ai.js install --dry-run --target all
```

If you changed install behavior, also run project and user-scope smoke tests:

```bash
node bin/tokenmaxxing-ai.js install --yes --verify --dir .tmp-install --target all
TOKENMAXXING_AI_HOME=.tmp-home node bin/tokenmaxxing-ai.js install --yes --verify --dir .tmp-install-user --scope user --target codex
```

## Pull Request Checklist

- [ ] Tests cover behavior changes.
- [ ] `npm test` passes.
- [ ] `npm run check` passes.
- [ ] `npm pack --dry-run` contains only intended package files.
- [ ] README, examples, or release notes are updated when user-facing behavior changes.
- [ ] No secrets, local paths, or generated analysis output are committed.
