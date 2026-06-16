import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { GENERATED_MARKER } from './constants.js';

const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../skills');

// ---------------------------------------------------------------------------
// Skill file readers — skills/ is the single source of truth
// ---------------------------------------------------------------------------

/**
 * Read a reference file from a skill's references/ subdirectory.
 * Used by adapters that need to install reference files alongside skill files.
 */
export function referenceContent(skillName, filename) {
  return readFileSync(resolve(SKILLS_DIR, skillName, 'references', filename), 'utf8');
}

/**
 * Read the body of a SKILL.md file with its YAML frontmatter stripped.
 * The frontmatter ends at the second '---' delimiter.
 */
function skillBody(skillName) {
  const raw = readFileSync(resolve(SKILLS_DIR, skillName, 'SKILL.md'), 'utf8');
  return stripSkillFrontmatter(raw);
}

export function stripSkillFrontmatter(raw) {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)+/, '');
}

// ---------------------------------------------------------------------------
// Instruction body functions — each reads from the matching SKILL.md
// ---------------------------------------------------------------------------

export function simplifyInstructions() {
  return skillBody('simplify');
}

export function reviewInstructions() {
  return skillBody('review');
}

export function liteReviewInstructions() {
  return skillBody('review-lite');
}

export function midReviewInstructions() {
  return skillBody('review-mid');
}

export function ultraReviewInstructions() {
  return skillBody('review-ultra');
}

// ---------------------------------------------------------------------------
// Core instructions (AGENTS.md / routing block — not a skill body)
// ---------------------------------------------------------------------------

export function coreInstructions() {
  return `${GENERATED_MARKER}
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
- Read \`.tokenmaxxing.md\` when present and use it as project-local adaptive memory.
- After /simplify or /review runs, propose a \`.tokenmaxxing.md\` update with run counts, durable project facts, verification commands, false positives, and instruction adjustments. Require approval before editing it.

## Commands

- /simplify [scope]: find over-engineered code, present a plan, ask approval, edit, verify.
- /review lite [scope]: quick security, bug, and broken-test pass.
- /review mid [scope]: deeper security, bug, test, and maintainability pass.
- /review ultra [scope]: whole-codebase review and fix workflow.

## Adaptive Memory

Use \`.tokenmaxxing.md\` to let these commands improve over repeated runs for the current project. Keep it concise, project-specific, and free of secrets. Treat it as guidance to verify, not as a replacement for reading code.
`;
}

// ---------------------------------------------------------------------------
// Codex skill generator
// ---------------------------------------------------------------------------

export function codexSkill(kind) {
  const body = modeBody(kind);
  const reviewMode = reviewModeForKind(kind);
  const description = kind === 'simplify'
    ? 'Simplify over-engineered code with adaptive .tokenmaxxing.md project memory. Use when the user asks to simplify, reduce complexity, refactor for clarity, or run /simplify.'
    : reviewMode
    ? `Run /review ${reviewMode} with adaptive .tokenmaxxing.md project memory. Use when the user asks for ${reviewMode} review mode, security review, bug review, tests, or quality fixes.`
    : 'Review code with lite, mid, and ultra modes plus adaptive .tokenmaxxing.md project memory. Use when the user asks for /review, security review, bug review, tests, or quality fixes.';

  return `---
name: ${kind}
description: ${description}
---

${body}`;
}

// ---------------------------------------------------------------------------
// Claude Code skill generator
// ---------------------------------------------------------------------------

export function claudeSkill(kind) {
  const body = modeBody(kind);
  let hint;
  let description;

  switch (kind) {
    case 'simplify':
      hint = '[scope]';
      description = 'Simplify over-engineered code with adaptive project memory after presenting a plan and asking approval.';
      break;
    case 'review-lite':
      hint = '[scope]';
      description = 'Fast security, bug, and test review with adaptive project memory and approval before fixes.';
      break;
    case 'review-mid':
      hint = '[scope]';
      description = 'Deeper security, bug, test, and maintainability review with adaptive project memory and approval before fixes.';
      break;
    case 'review-ultra':
      hint = '[scope]';
      description = 'Whole-codebase review with adaptive project memory, multi-pass coverage, and approval before fixes.';
      break;
    default:
      hint = '[lite|mid|ultra] [scope]';
      description = 'Review and fix code using lite, mid, or ultra effort after presenting a plan and asking approval.';
  }

  return `---
description: ${description}
argument-hint: ${hint}
disable-model-invocation: true
---

${body}

User arguments: $ARGUMENTS
`;
}

// ---------------------------------------------------------------------------
// Other adapter generators
// ---------------------------------------------------------------------------

export function opencodeCommand(kind) {
  const body = kind === 'simplify' ? simplifyInstructions() : reviewInstructions();
  const description = kind === 'simplify'
    ? 'Simplify over-engineered code with approval before edits'
    : 'Review code with lite, mid, and ultra effort modes';

  return `---
description: ${description}
---

${body}

User arguments: $ARGUMENTS
`;
}

export function commandCodeCommand(kind) {
  return genericCommand(kind, 'CommandCode');
}

export function antigravityCommand(kind) {
  return genericCommand(kind, 'Antigravity');
}

export function kiroSteering(kind) {
  if (kind === 'core') {
    return `---
inclusion: auto
name: tokenmaxxing-ai
description: Token-efficient agent workflow for simplification and review tasks.
---

${coreInstructions()}`;
  }

  const body = kind === 'simplify' ? simplifyInstructions() : reviewInstructions();
  return `---
inclusion: manual
---

${body}`;
}

export function cursorRule() {
  return `---
description: Tokenmaxxing-AI workflows for /simplify and /review requests.
globs: ["**/*"]
alwaysApply: false
---

${coreInstructions()}

When the user asks for /simplify, follow the simplification workflow.
When the user asks for /review lite, /review mid, or /review ultra, follow the matching review mode.
`;
}

export function copilotInstructions() {
  return `${coreInstructions()}
For GitHub Copilot, treat /simplify and /review as natural-language command intents when no native slash-command file is available in the current surface.
`;
}

export function agnosticAgentBlock() {
  return `${coreInstructions()}
If the current AI tool does not support custom slash commands, treat user messages that start with /simplify or /review as command invocations and follow the matching workflow.
`;
}

export function geminiStyleBlock() {
  return `${coreInstructions()}
For Gemini-style or Antigravity-style agents, treat slash-prefixed simplify/review requests as command intents and require approval before editing.
`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function reviewModeForKind(kind) {
  if (kind === 'review-lite') return 'lite';
  if (kind === 'review-mid') return 'mid';
  if (kind === 'review-ultra') return 'ultra';
  return null;
}

/**
 * Return the instruction body for a given skill kind.
 * Mode-specific review kinds use the improved per-mode SKILL.md content.
 */
function modeBody(kind) {
  switch (kind) {
    case 'simplify':    return simplifyInstructions();
    case 'review-lite': return liteReviewInstructions();
    case 'review-mid':  return midReviewInstructions();
    case 'review-ultra': return ultraReviewInstructions();
    default:            return reviewInstructions();
  }
}

function genericCommand(kind, toolName) {
  const body = kind === 'simplify' ? simplifyInstructions() : reviewInstructions();
  const title = kind === 'simplify' ? '/simplify' : '/review';

  return `${GENERATED_MARKER}
# ${toolName} ${title}

${body}

User arguments: $ARGUMENTS
`;
}
