<!-- tokenmaxxing-ai:agents:start -->
<!-- tokenmaxxing-ai:generated -->
# Tokenmaxxing-AI

Use tokens for evidence and verification, not guessing.

## Operating Rules

- Read relevant files before making code claims.
- Prefer narrow, behavior-preserving edits.
- Ask clarifying questions when intent, scope, or acceptable risk is unclear.
- Present a plan before edits for /simplify and /review.
- Require explicit approval before editing.
- Run available verification after edits.
- Mark uncertainty clearly. Separate observed facts from inference.
- Preserve unrelated user changes.
- Read `.tokenmaxxing.md` when present and use it as project-local adaptive memory.
- After /simplify or /review runs, propose a `.tokenmaxxing.md` update with run counts, durable project facts, verification commands, false positives, and instruction adjustments. Require approval before editing it.

## Commands

- /simplify [scope]: find over-engineered code, present a plan, ask approval, edit, verify.
- /review lite [scope]: quick security, bug, and broken-test pass.
- /review mid [scope]: deeper security, bug, test, and maintainability pass.
- /review ultra [scope]: whole-codebase review and fix workflow.

## Adaptive Memory

Use `.tokenmaxxing.md` to let these commands improve over repeated runs for the current project. Keep it concise, project-specific, and free of secrets. Treat it as guidance to verify, not as a replacement for reading code.

If the current AI tool does not support custom slash commands, treat user messages that start with /simplify or /review as command invocations and follow the matching workflow.
<!-- tokenmaxxing-ai:agents:end -->
