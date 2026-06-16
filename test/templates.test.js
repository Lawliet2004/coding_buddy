import test from 'node:test';
import assert from 'node:assert/strict';
import { coreInstructions, referenceContent, stripSkillFrontmatter } from '../src/templates.js';

test('stripSkillFrontmatter removes YAML frontmatter with CRLF line endings', () => {
  const raw = '---\r\nname: review-lite\r\ndescription: Test\r\n---\r\n\r\n# Body\r\n';

  assert.equal(stripSkillFrontmatter(raw), '# Body\r\n');
});

test('stripSkillFrontmatter removes YAML frontmatter with LF line endings', () => {
  const raw = '---\nname: simplify\ndescription: Test\n---\n\n# Body\n';

  assert.equal(stripSkillFrontmatter(raw), '# Body\n');
});

test('stripSkillFrontmatter returns content unchanged when no frontmatter is present', () => {
  const raw = '# Body only, no frontmatter\n';
  assert.equal(stripSkillFrontmatter(raw), '# Body only, no frontmatter\n');
});

test('stripSkillFrontmatter leaves empty frontmatter unchanged (the regex requires content between the markers)', () => {
  // The current regex requires at least one char of content (preceded by a newline) between
  // the opening and closing `---`. Empty-frontmatter input therefore does not match and is
  // returned verbatim. Document the behavior rather than silently swallowing the file.
  const raw = '---\n---\n# Body\n';
  assert.equal(stripSkillFrontmatter(raw), raw);
});

test('coreInstructions include adaptive project memory guidance', () => {
  const content = coreInstructions();

  assert(content.includes('.tokenmaxxing.md'));
  assert(content.includes('Adaptive Memory'));
});

test('referenceContent returns the same content as the on-disk file', () => {
  const filename = 'security_checklist.md';
  const lite = referenceContent('review-lite', filename);
  const mid = referenceContent('review-mid', filename);
  const ultra = referenceContent('review-ultra', filename);
  assert.equal(lite, mid);
  assert.equal(mid, ultra);
  assert.match(lite, /command injection/);
});
