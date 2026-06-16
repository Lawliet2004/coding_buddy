import {
  agnosticAgentBlock,
  antigravityCommand,
  claudeSkill,
  codexSkill,
  commandCodeCommand,
  copilotInstructions,
  cursorRule,
  geminiStyleBlock,
  kiroSteering,
  opencodeCommand
} from './templates.js';

export const targetNames = [
  'codex',
  'claude-code',
  'cursor',
  'github-copilot',
  'opencode',
  'commandcode',
  'antigravity',
  'kiro'
];

export const targetAliases = new Map([
  ['codex', 'codex'],
  ['codecs', 'codex'],
  ['openai-codex', 'codex'],
  ['claude', 'claude-code'],
  ['claude-code', 'claude-code'],
  ['cloud', 'claude-code'],
  ['cursor', 'cursor'],
  ['copilot', 'github-copilot'],
  ['github-copilot', 'github-copilot'],
  ['github', 'github-copilot'],
  ['opencode', 'opencode'],
  ['open-code', 'opencode'],
  ['commandcode', 'commandcode'],
  ['command-code', 'commandcode'],
  ['antigravity', 'antigravity'],
  ['google-antigravity', 'antigravity'],
  ['kiro', 'kiro'],
  ['kiro-cli', 'kiro']
]);

export const adapters = {
  codex(scope) {
    const skillFiles = [
      file(scope === 'user' ? 'home' : 'project', '.agents/skills/simplify/SKILL.md', codexSkill('simplify')),
      file(scope === 'user' ? 'home' : 'project', '.agents/skills/review/SKILL.md', codexSkill('review')),
      file(scope === 'user' ? 'home' : 'project', '.agents/skills/review-lite/SKILL.md', codexSkill('review-lite')),
      file(scope === 'user' ? 'home' : 'project', '.agents/skills/review-mid/SKILL.md', codexSkill('review-mid')),
      file(scope === 'user' ? 'home' : 'project', '.agents/skills/review-ultra/SKILL.md', codexSkill('review-ultra'))
    ];

    if (scope === 'user') {
      return skillFiles;
    }

    return [
      ...skillFiles,
      block('project', 'AGENTS.md', 'agents', agnosticAgentBlock())
    ];
  },

  'claude-code'(scope) {
    const root = scope === 'user' ? 'home' : 'project';
    const prefix = scope === 'user' ? '.claude/skills' : '.claude/skills';
    return [
      file(root, `${prefix}/simplify/SKILL.md`, claudeSkill('simplify')),
      file(root, `${prefix}/review/SKILL.md`, claudeSkill('review'))
    ];
  },

  cursor() {
    return [
      file('project', '.cursor/rules/tokenmaxxing-ai.mdc', cursorRule()),
      block('project', 'AGENTS.md', 'agents', agnosticAgentBlock())
    ];
  },

  'github-copilot'() {
    return [
      block('project', '.github/copilot-instructions.md', 'copilot', copilotInstructions()),
      file('project', '.github/instructions/tokenmaxxing-ai.instructions.md', copilotInstructions()),
      block('project', 'AGENTS.md', 'agents', agnosticAgentBlock())
    ];
  },

  opencode(scope) {
    const root = scope === 'user' ? 'home' : 'project';
    const prefix = scope === 'user' ? '.config/opencode/commands' : '.opencode/commands';
    return [
      file(root, `${prefix}/simplify.md`, opencodeCommand('simplify')),
      file(root, `${prefix}/review.md`, opencodeCommand('review'))
    ];
  },

  commandcode() {
    return [
      file('project', '.commandcode/commands/simplify.md', commandCodeCommand('simplify')),
      file('project', '.commandcode/commands/review.md', commandCodeCommand('review')),
      block('project', 'COMMANDCODE.md', 'commandcode', agnosticAgentBlock())
    ];
  },

  antigravity() {
    return [
      file('project', '.antigravity/commands/simplify.md', antigravityCommand('simplify')),
      file('project', '.antigravity/commands/review.md', antigravityCommand('review')),
      block('project', 'GEMINI.md', 'gemini', geminiStyleBlock()),
      block('project', 'AGENTS.md', 'agents', agnosticAgentBlock())
    ];
  },

  kiro(scope) {
    const root = scope === 'user' ? 'home' : 'project';
    const prefix = scope === 'user' ? '.kiro/steering' : '.kiro/steering';
    return [
      file(root, `${prefix}/simplify.md`, kiroSteering('simplify')),
      file(root, `${prefix}/review.md`, kiroSteering('review')),
      file(root, `${prefix}/tokenmaxxing-ai.md`, kiroSteering('core'))
    ];
  }
};

function file(root, path, content) {
  return { root, path, content };
}

function block(root, path, blockId, content) {
  return { root, path, blockId, content, merge: 'block' };
}
