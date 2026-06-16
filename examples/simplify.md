# Simplify Workflow

Prompt:

```text
$simplify src/install.js
```

Expected agent behavior:

```text
1. Read relevant files and project memory.
2. Measure complexity signals before editing.
3. Present a narrow simplification plan.
4. Ask: "Proceed with these edits?"
5. Edit only after approval.
6. Run verification.
7. Report changed files, behavior preserved, and residual risk.
```

Use when code works but is harder to read, maintain, or test than it needs to be.
