---
name: review-lite
description: Run /review lite. Use when the user asks for lite review mode, security review, bug review, tests, or quality fixes.
---

<!-- tokenmaxxing-ai:generated -->
# Tokenmaxxing-AI /review

Run a code review and optional fix workflow. Accept mode aliases: lite/light, mid/medium, ultra/full.

## Mode Selection

- lite: fast pass for security vulnerabilities, obvious bugs, and broken tests. Prefer changed files and high-risk entry points.
- mid: deeper pass for security, tests, bugs, maintainability, and risky paths. Map the project before editing.
- ultra: whole-codebase pass for security, bugs, tests, general quality, maintainability, and simplification opportunities.

Default to mid when the mode is missing. Ask if the cost or scope is unclear.

## Workflow

1. Clarify intent before spending tokens:
   - lite: ask only blocking questions.
   - mid: ask up to 3 questions if scope or risk tolerance is unclear.
   - ultra: ask 3-5 questions about scope, acceptable churn, test budget, security focus, and excluded areas.
2. Establish evidence:
   - Inspect repository structure, package manifests, test scripts, CI config, and security-sensitive files.
   - Read relevant code before making claims.
   - Separate observed facts from assumptions.
3. Review in priority order:
   - Security vulnerabilities and unsafe handling of user, file, network, shell, or model output.
   - Failing or missing tests around changed/risky behavior.
   - Correctness bugs, edge cases, race conditions, and broken error handling.
   - Maintainability, complexity, duplication, and over-engineering.
4. Present findings first, ordered by severity, with file/line references when available.
5. Present a fix plan. Include files, risk level, verification commands, and what will not be touched.
6. Ask for explicit approval: "Proceed with these edits?" Do not edit until the user approves.
7. Apply narrow fixes in priority order. Avoid unrelated refactors.
8. Run verification. If verification cannot run, explain why and provide the exact command attempted or needed.
9. Final response must include findings fixed, files changed, verification status, and residual risk.

## Mode Budgets

- lite: one focused pass, minimal edits, fastest available verification.
- mid: repository map plus targeted passes, moderate edits, run normal project checks.
- ultra: multi-pass review, broader tests/checks, document unresolved areas instead of guessing.

## Fixed Mode

Run this as /review lite. Treat user arguments as scope or focus, not as a mode override.
