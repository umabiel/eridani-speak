import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillText, parseSkillFile } from '../scripts/frontmatter.js';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

test('parseSkillText extracts frontmatter and body', () => {
  const doc = parseSkillText(
    '---\nname: signal-coding\ndescription: >\n  Dense technical communication.\n  Activate on #signalcodingon.\n---\nBody text.',
  );
  assert.equal(doc.name, 'signal-coding');
  assert.ok(doc.description.includes('Dense technical communication'));
  assert.ok(doc.description.includes('#signalcodingon'));
  assert.equal(doc.body, 'Body text.');
});

test('parseSkillText handles missing frontmatter', () => {
  const doc = parseSkillText('just body');
  assert.equal(doc.name, '');
  assert.equal(doc.body, 'just body');
});

test('signal-coding SKILL.md parses with name and body', () => {
  const doc = parseSkillFile(join(REPO_ROOT, 'signal-coding', 'SKILL.md'));
  assert.equal(doc.name, 'signal-coding');
  assert.ok(doc.body.includes('Optimize for information density, not minimum word count'));
  assert.ok(doc.body.length > 1000);
});
