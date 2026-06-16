---
name: review
description: Review code with lite, mid, and ultra modes plus adaptive .tokenmaxxing.md project memory. Use when the user asks for /review, security review, bug review, tests, or quality fixes.
---

<!-- tokenmaxxing-ai:generated -->
# Tokenmaxxing-AI /review

Run a code review and optional fix workflow. Accept mode aliases: lite/light, mid/medium, ultra/full.

## Mode Selection

- **lite**: Fast pass — security, obvious bugs, broken tests. Prefer changed files and high-risk entry points.
- **mid**: Deeper pass — security, tests, bugs, maintainability, risky paths. Map the project before editing.
- **ultra**: Whole-codebase pass — security, bugs, tests, quality, maintainability, simplification opportunities.

Default to mid when the mode is missing. Ask if the cost or scope is unclear.

## Adaptive Project Memory

Use `.tokenmaxxing.md` as project-local command memory.

- At the start, read `.tokenmaxxing.md` if it exists. Apply relevant project profile, verification commands, risk areas, user preferences, false-positive notes, and prior unresolved areas.
- At the end, propose a `.tokenmaxxing.md` update when the run teaches something durable. Increment the selected command count (`/review lite`, `/review mid`, or `/review ultra`), record scope, findings summary, verification result, recurring risks, false positives, deferred areas, and instruction adjustments for future reviews.
- Require explicit approval before creating or editing `.tokenmaxxing.md`. Include the memory update in the fix plan when edits are planned.
- Never store secrets, credentials, private user data, or unverified guesses. Keep entries concise and replace stale guidance.

## Clarification

- lite: ask only blocking questions. Start immediately if intent is clear.
- mid: ask up to 3 questions if scope or risk tolerance is unclear.
- ultra: ask 3–5 questions about scope, acceptable churn, test budget, security focus, and excluded areas.

## Context Gathering

Before reviewing code, gather context appropriate to the mode:

1. Run `git diff --name-only HEAD~1` (or `git diff --staged --name-only`) to identify changed files.
2. For mid and ultra: run `git log --oneline -10` to understand recent commit history.
3. Check for `.tokenmaxxing.yml` in the repo root. If present, use its `test_command`, `lint_command`, `security_sensitive` paths, and `exclude` globs. If absent, discover these from package manifests and CI config.
4. Read `.tokenmaxxing.md` if present and extract only relevant project memory.
5. For mid and ultra: map project structure — directory layout, manifests, test scripts, CI config.

## What to Find

Review in this order. Cover only the categories appropriate to the selected mode.

1. **Security** — unsafe handling of user input, file paths, shell commands, network data, or model output. Key patterns to check:
   - User input passed to shell commands, SQL queries, or `eval()` without sanitization
   - Secrets, API keys, or credentials hardcoded or logged
   - Missing or incorrect permission checks on routes or endpoints
   - File paths from user input without path traversal checks
   - Missing rate limiting on authentication endpoints

2. **Failing or missing tests** — tests that are failing, disabled without reason, or absent around changed or risky behavior.

3. **Correctness bugs** — wrong logic, unhandled errors, crash paths, race conditions, edge-case misses. Key patterns:
   - Unhandled promise rejections or missing `await` on async calls
   - Null/undefined access without guards
   - Off-by-one errors, wrong comparison operators, inverted boolean logic
   - Catch blocks that silently swallow errors

4. **Maintainability** *(mid and ultra only)* — complexity, duplication, unclear contracts, over-engineering with a real cost.

5. **Simplification** *(ultra only)* — code that can be shorter and clearer without behavior change. Only after the first four categories.

## Severity Levels

- **critical**: Exploitable security vulnerability, data loss, or crash in production path. Must fix before merge.
- **high**: Correctness bug that will produce wrong results under realistic conditions. Should fix before merge.
- **medium**: Missing test coverage, error handling gap, or maintainability issue with real cost. Fix if in scope, otherwise track.
- **low**: Style issue, minor duplication, or improvement that doesn't affect correctness. Note but don't fix unless asked.

## Confidence Rules

- **high**: You read the code, traced the data flow, and the issue is unambiguous.
- **medium**: The pattern looks wrong but you haven't traced every caller or tested the edge case.
- **low**: The code *might* be wrong based on naming or structure, but you haven't confirmed.

If confidence is low, say so. Do not present low-confidence findings as facts.
Never report a finding without quoting the specific code that triggered it.

## Finding Format

Report each finding in this format:

**[F-{n}] {severity}: {one-line title}**
- File: `{path}:{line}`
- Category: security | bug | test | maintainability | simplification
- Confidence: high | medium | low
- Evidence: {quote the specific code and explain what's wrong}
- Suggested fix: {concrete change}
- Risk of fix: {what could break}

## Workflow

1. Gather context using the git commands above, appropriate to the selected mode.
2. Establish evidence: read relevant code before making claims. Separate observed facts from assumptions.
3. Check the key patterns listed above against the in-scope code.
4. Report findings using the finding format above, ordered by severity.
5. Present a fix plan: files, risk level, verification commands, what will not be touched, and whether `.tokenmaxxing.md` should be updated.
6. Ask for explicit approval: "Proceed with these edits?" Do not edit until the user approves.
7. Apply fixes in priority order. Avoid unrelated refactors.
8. Run verification appropriate to mode: fastest check for lite, full suite for mid and ultra.
9. Update `.tokenmaxxing.md` if approved.
10. Report: findings fixed (by ID), files changed, verification status, memory update status, and residual risk.

## Mode Budgets

- lite: one focused pass, minimal edits, fastest available verification.
- mid: repository map plus targeted passes, moderate edits, run normal project checks.
- ultra: multi-pass review, broader tests/checks, document unresolved areas instead of guessing.
