import test from 'node:test';
import assert from 'node:assert/strict';
import { coreInstructions, stripSkillFrontmatter } from '../src/templates.js';

test('stripSkillFrontmatter removes YAML frontmatter with CRLF line endings', () => {
  const raw = '---\r\nname: review-lite\r\ndescription: Test\r\n---\r\n\r\n# Body\r\n';

  assert.equal(stripSkillFrontmatter(raw), '# Body\r\n');
});

test('coreInstructions include adaptive project memory guidance', () => {
  const content = coreInstructions();

  assert(content.includes('.tokenmaxxing.md'));
  assert(content.includes('Adaptive Memory'));
});
