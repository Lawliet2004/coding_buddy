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
      ...reviewReferenceFiles(root, `${prefix}/review-lite`, 'review-lite', [
        'security_checklist.md',
        'bug_patterns.md'
      ]),
      file(root, `${prefix}/review-mid/SKILL.md`, claudeSkill('review-mid')),
      ...reviewReferenceFiles(root, `${prefix}/review-mid`, 'review-mid', [
        'security_checklist.md',
        'bug_patterns.md',
        'maintainability_checklist.md'
      ]),
      file(root, `${prefix}/review-ultra/SKILL.md`, claudeSkill('review-ultra')),
      ...reviewReferenceFiles(root, `${prefix}/review-ultra`, 'review-ultra', [
        'security_checklist.md',
        'bug_patterns.md',
        'maintainability_checklist.md',
        'simplification_signals.md'
      ])
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
      const prefix = '.gemini/antigravity/skills';
      return [
        file('home', `${prefix}/simplify/SKILL.md`, claudeSkill('simplify')),
        file('home', `${prefix}/review/SKILL.md`, claudeSkill('review')),
        file('home', `${prefix}/review-lite/SKILL.md`, claudeSkill('review-lite')),
        ...reviewReferenceFiles('home', `${prefix}/review-lite`, 'review-lite', [
          'security_checklist.md',
          'bug_patterns.md'
        ]),
        file('home', `${prefix}/review-mid/SKILL.md`, claudeSkill('review-mid')),
        ...reviewReferenceFiles('home', `${prefix}/review-mid`, 'review-mid', [
          'security_checklist.md',
          'bug_patterns.md',
          'maintainability_checklist.md'
        ]),
        file('home', `${prefix}/review-ultra/SKILL.md`, claudeSkill('review-ultra')),
        ...reviewReferenceFiles('home', `${prefix}/review-ultra`, 'review-ultra', [
          'security_checklist.md',
          'bug_patterns.md',
          'maintainability_checklist.md',
          'simplification_signals.md'
        ])
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
    return [
      file(root, '.kiro/steering/simplify.md', kiroSteering('simplify')),
      file(root, '.kiro/steering/review.md', kiroSteering('review')),
      file(root, '.kiro/steering/tokenmaxxing-ai.md', kiroSteering('core'))
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
