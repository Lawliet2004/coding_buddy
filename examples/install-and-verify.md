# Install and Verify

Install all project-local agent workflows:

```bash
npx tokenmaxxing-ai install --yes --verify
```

Expected shape:

```text
Install plan:
  create    .agents/skills/simplify/SKILL.md
  create    .agents/skills/review/SKILL.md
  ...
Install result:
  create    .agents/skills/simplify/SKILL.md
  create    .agents/skills/review/SKILL.md
  ...
Verification passed.
```

Preview without writing:

```bash
npx tokenmaxxing-ai install --dry-run --target all
```
