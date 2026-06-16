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
  opencodeCommand,
  referenceContent
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
    const root = scope === 'user' ? 'home' : 'project';
    const prefix = '.agents/skills';
    const skillFiles = [
      file(root, `${prefix}/simplify/SKILL.md`, codexSkill('simplify')),
      file(root, `${prefix}/review/SKILL.md`, codexSkill('review')),
      file(root, `${prefix}/review-lite/SKILL.md`, codexSkill('review-lite')),
      ...reviewReferenceFiles(root, `${prefix}/review-lite`, 'review-lite', [
        'security_checklist.md',
        'bug_patterns.md'
      ]),
      file(root, `${prefix}/review-mid/SKILL.md`, codexSkill('review-mid')),
      ...reviewReferenceFiles(root, `${prefix}/review-mid`, 'review-mid', [
        'security_checklist.md',
        'bug_patterns.md',
        'maintainability_checklist.md'
      ]),
      file(root, `${prefix}/review-ultra/SKILL.md`, codexSkill('review-ultra')),
      ...reviewReferenceFiles(root, `${prefix}/review-ultra`, 'review-ultra', [
        'security_checklist.md',
        'bug_patterns.md',
        'maintainability_checklist.md',
        'simplification_signals.md'
      ])
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
    const prefix = '.claude/skills';
    return [
      file(root, `${prefix}/simplify/SKILL.md`, claudeSkill('simplify')),
      file(root, `${prefix}/review/SKILL.md`, claudeSkill('review')),
      file(root, `${prefix}/review-lite/SKILL.md`, claudeSkill('review-lite')),
      file(root, `${prefix}/review-lite/references/security_checklist.md`, referenceContent('review-lite', 'security_checklist.md')),
      file(root, `${prefix}/review-lite/references/bug_patterns.md`, referenceContent('review-lite', 'bug_patterns.md')),
      file(root, `${prefix}/review-mid/SKILL.md`, claudeSkill('review-mid')),
      file(root, `${prefix}/review-mid/references/security_checklist.md`, referenceContent('review-mid', 'security_checklist.md')),
      file(root, `${prefix}/review-mid/references/bug_patterns.md`, referenceContent('review-mid', 'bug_patterns.md')),
      file(root, `${prefix}/review-mid/references/maintainability_checklist.md`, referenceContent('review-mid', 'maintainability_checklist.md')),
      file(root, `${prefix}/review-ultra/SKILL.md`, claudeSkill('review-ultra')),
      file(root, `${prefix}/review-ultra/references/security_checklist.md`, referenceContent('review-ultra', 'security_checklist.md')),
      file(root, `${prefix}/review-ultra/references/bug_patterns.md`, referenceContent('review-ultra', 'bug_patterns.md')),
      file(root, `${prefix}/review-ultra/references/maintainability_checklist.md`, referenceContent('review-ultra', 'maintainability_checklist.md')),
      file(root, `${prefix}/review-ultra/references/simplification_signals.md`, referenceContent('review-ultra', 'simplification_signals.md'))
    ];
  },

  cursor(scope) {
    if (scope === 'user') {
      throw new Error('cursor does not support --scope user');
    }

    return [
      file('project', '.cursor/rules/tokenmaxxing-ai.mdc', cursorRule()),
      block('project', 'AGENTS.md', 'agents', agnosticAgentBlock())
    ];
  },

  'github-copilot'(scope) {
    if (scope === 'user') {
      return [
        file('home', '.copilot/copilot-instructions.md', copilotInstructions()),
        file('home', '.copilot/instructions/tokenmaxxing-ai.instructions.md', copilotInstructions())
      ];
    }
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

  commandcode(scope) {
    if (scope === 'user') {
      throw new Error('commandcode does not support --scope user');
    }

    return [
      file('project', '.commandcode/commands/simplify.md', commandCodeCommand('simplify')),
      file('project', '.commandcode/commands/review.md', commandCodeCommand('review')),
      block('project', 'COMMANDCODE.md', 'commandcode', agnosticAgentBlock())
    ];
  },

  antigravity(scope) {
    if (scope === 'user') {
      // Global Antigravity skills: ~/.gemini/antigravity/skills/
      return [
        file('home', '.gemini/antigravity/skills/simplify/SKILL.md', claudeSkill('simplify')),
        file('home', '.gemini/antigravity/skills/review/SKILL.md', claudeSkill('review')),
        file('home', '.gemini/antigravity/skills/review-lite/SKILL.md', claudeSkill('review-lite')),
        file('home', '.gemini/antigravity/skills/review-lite/references/security_checklist.md', referenceContent('review-lite', 'security_checklist.md')),
        file('home', '.gemini/antigravity/skills/review-lite/references/bug_patterns.md', referenceContent('review-lite', 'bug_patterns.md')),
        file('home', '.gemini/antigravity/skills/review-mid/SKILL.md', claudeSkill('review-mid')),
        file('home', '.gemini/antigravity/skills/review-mid/references/security_checklist.md', referenceContent('review-mid', 'security_checklist.md')),
        file('home', '.gemini/antigravity/skills/review-mid/references/bug_patterns.md', referenceContent('review-mid', 'bug_patterns.md')),
        file('home', '.gemini/antigravity/skills/review-mid/references/maintainability_checklist.md', referenceContent('review-mid', 'maintainability_checklist.md')),
        file('home', '.gemini/antigravity/skills/review-ultra/SKILL.md', claudeSkill('review-ultra')),
        file('home', '.gemini/antigravity/skills/review-ultra/references/security_checklist.md', referenceContent('review-ultra', 'security_checklist.md')),
        file('home', '.gemini/antigravity/skills/review-ultra/references/bug_patterns.md', referenceContent('review-ultra', 'bug_patterns.md')),
        file('home', '.gemini/antigravity/skills/review-ultra/references/maintainability_checklist.md', referenceContent('review-ultra', 'maintainability_checklist.md')),
        file('home', '.gemini/antigravity/skills/review-ultra/references/simplification_signals.md', referenceContent('review-ultra', 'simplification_signals.md'))
      ];
    }
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

function reviewReferenceFiles(root, prefix, skillName, filenames) {
  return filenames.map((filename) =>
    file(root, `${prefix}/references/${filename}`, referenceContent(skillName, filename))
  );
}
