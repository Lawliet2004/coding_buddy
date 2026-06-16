# Review Ultra Workflow

Prompt:

```text
$review-ultra whole repo
```

Expected agent behavior:

```text
1. Ask scope, churn, test budget, security focus, and exclusions.
2. Map the repository, manifests, CI, tests, and security-sensitive files.
3. Run security, correctness, test, maintainability, and simplification passes.
4. Report findings first with severity, confidence, evidence, and file references.
5. Present a fix plan.
6. Ask: "Proceed with these edits?"
7. Edit only after approval.
8. Run the broadest available verification.
9. Propose a concise .tokenmaxxing.md update.
```

Use when you want a whole-codebase pass before a release or major merge.
