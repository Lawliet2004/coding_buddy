import path from 'node:path';

export const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.rb', '.kt', '.swift'
]);

const DOC_NAMES = new Set(['readme.md', 'contributing.md', 'roadmap.md']);
const CONFIG_NAMES = new Set([
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'next.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
  'dockerfile',
  'docker-compose.yml',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'cargo.toml',
  'pom.xml',
  'build.gradle',
  'schema.prisma'
]);

const LOCK_NAMES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'cargo.lock',
  'gemfile.lock',
  'pipfile.lock',
  'poetry.lock'
]);

const SKIP_SEGMENTS = new Set([
  '.git',
  '.graphq',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  'venv',
  '.venv',
  '__pycache__',
  'target',
  'vendor'
]);

const SECRET_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.npmrc',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519'
]);

const SECRET_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.crt', '.cer']);

export function normalizeRepoPath(value) {
  return String(value).split(path.sep).join('/').replace(/^\/+/, '');
}

export function classifyPath(relativePath) {
  const repoPath = normalizeRepoPath(relativePath);
  const lowerPath = repoPath.toLowerCase();
  const segments = lowerPath.split('/');
  const name = segments.at(-1) ?? lowerPath;
  const ext = path.posix.extname(lowerPath);

  if (segments.some((segment) => SKIP_SEGMENTS.has(segment))) {
    return skip('ignored path segment');
  }

  if (lowerPath.startsWith('public/assets/')) {
    return skip('asset directory');
  }

  if (isSecretPath(lowerPath, name, ext)) {
    return skip('secret path');
  }

  if (LOCK_NAMES.has(name)) {
    return skip('lock file');
  }

  if (lowerPath.endsWith('.min.js') || lowerPath.endsWith('.snap')) {
    return skip('generated or snapshot file');
  }

  if (isTestPath(lowerPath, name)) {
    return keep('test', languageFor(ext), ['test']);
  }

  if (isDatabasePath(lowerPath, name, ext)) {
    return keep('database', languageFor(ext), ['database']);
  }

  if (CONFIG_NAMES.has(name) || isConfigPath(lowerPath, name)) {
    return keep('config', languageFor(ext), tagsFor(lowerPath));
  }

  if (isDocsPath(lowerPath, name)) {
    return keep('docs', 'markdown', ['docs']);
  }

  if (SOURCE_EXTENSIONS.has(ext)) {
    return keep('source', languageFor(ext), tagsFor(lowerPath));
  }

  return skip('unsupported file type');
}

export function isBinaryBuffer(buffer) {
  if (!buffer.length) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length > 0.3;
}

export function compileGitignore(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'));
}

export function matchesGitignore(relativePath, patterns) {
  const repoPath = normalizeRepoPath(relativePath);
  const segments = repoPath.split('/');
  const name = segments.at(-1) ?? repoPath;

  return patterns.some((pattern) => {
    let normalized = pattern.replaceAll('\\', '/').replace(/^\/+/, '');
    if (!normalized) return false;

    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
      return repoPath === normalized || repoPath.startsWith(`${normalized}/`) || segments.includes(normalized);
    }

    if (normalized.includes('*')) {
      const source = normalized
        .split('*')
        .map(escapeRegExp)
        .join('[^/]*');
      return new RegExp(`(^|/)${source}$`).test(repoPath);
    }

    if (normalized.includes('/')) {
      return repoPath === normalized || repoPath.startsWith(`${normalized}/`);
    }

    return name === normalized || segments.includes(normalized);
  });
}

function isSecretPath(lowerPath, name, ext) {
  if (name === '.env.example') return false;
  if (SECRET_FILENAMES.has(name)) return true;
  if (/^\.env\./.test(name) && !name.endsWith('.example')) return true;
  return SECRET_EXTENSIONS.has(ext) || lowerPath.includes('/.aws/') || lowerPath.includes('/.ssh/');
}

function isTestPath(lowerPath, name) {
  return lowerPath.startsWith('test/')
    || lowerPath.startsWith('tests/')
    || lowerPath.includes('/test/')
    || lowerPath.includes('/tests/')
    || name.includes('.test.')
    || name.includes('.spec.')
    || /^test.*\.py$/.test(name)
    || /^.*_test\.py$/.test(name);
}

function isDatabasePath(lowerPath, name, ext) {
  return ext === '.sql'
    || name === 'schema.prisma'
    || lowerPath.includes('/migration/')
    || lowerPath.includes('/migrations/');
}

function isConfigPath(lowerPath, name) {
  return name.endsWith('.config.js')
    || name.endsWith('.config.ts')
    || name.endsWith('.config.mjs')
    || name === '.env.example'
    || lowerPath.endsWith('/dockerfile');
}

function isDocsPath(lowerPath, name) {
  return DOC_NAMES.has(name) || lowerPath.startsWith('docs/') && lowerPath.endsWith('.md');
}

function languageFor(ext) {
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
      return 'python';
    case '.md':
      return 'markdown';
    case '.json':
      return 'json';
    case '.sql':
      return 'sql';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.java':
      return 'java';
    case '.rb':
      return 'ruby';
    case '.php':
      return 'php';
    default:
      return ext ? ext.slice(1) : 'text';
  }
}

const TAG_RULES = [
  [['auth', 'authentication', 'authorize', 'authorization'], 'auth'],
  [['jwt', 'oauth', 'session', 'sessions'], 'auth'],
  [['token', 'tokens'], 'auth'],
  [['security', 'secure'], 'security'],
  [['db', 'database', 'databases'], 'database'],
  [['migration', 'migrations'], 'database'],
  [['route', 'routes', 'routing'], 'routing'],
  [['api', 'apis', 'endpoint', 'endpoints'], 'api'],
  [['config', 'configuration', 'settings'], 'config'],
  [['payment', 'payments', 'billing', 'checkout'], 'payment']
];

export function pathTokens(relativePath) {
  const repoPath = normalizeRepoPath(relativePath);
  const tokens = new Set();
  for (const segment of repoPath.split('/')) {
    const base = segment.replace(/\.[^.]+$/, '');
    const pieces = base
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean);
    for (const piece of pieces) {
      const normalized = piece.toLowerCase();
      tokens.add(normalized);
      if (normalized.endsWith('s') && normalized.length > 3) tokens.add(normalized.slice(0, -1));
    }
  }
  return [...tokens];
}

function tagsFor(lowerPath) {
  const tokens = new Set(pathTokens(lowerPath));
  const tags = [];
  for (const [aliases, tag] of TAG_RULES) {
    if (aliases.some((alias) => tokens.has(alias)) && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function keep(category, language, tags) {
  return { action: 'keep', category, language, tags };
}

function skip(reason) {
  return { action: 'skip', reason };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
