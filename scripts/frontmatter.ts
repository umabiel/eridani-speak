import { readFileSync } from 'node:fs';

export interface SkillDoc {
  name: string;
  description: string;
  body: string;
}

/** Parse a `---`-delimited frontmatter block followed by the skill body. */
export function parseSkillText(text: string): SkillDoc {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { name: '', description: '', body: text.trim() };
  const frontmatter = match[1];
  const body = match[2].trim();
  const nameLine = frontmatter.match(/^name:\s*(.+)$/m);
  return { name: nameLine?.[1]?.trim() ?? '', description: readDescription(frontmatter), body };
}

function readDescription(frontmatter: string): string {
  const lines = frontmatter.split('\n');
  const out: string[] = [];
  let inDescription = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('description:')) {
      inDescription = true;
      const rest = line.slice('description:'.length).trim().replace(/^>\s*/, '');
      if (rest) out.push(rest);
      continue;
    }
    if (inDescription) {
      if (!line || /^[a-zA-Z_][a-zA-Z0-9_]*:/.test(line)) {
        inDescription = false;
      } else {
        out.push(line);
      }
    }
  }
  return out.join(' ').trim();
}

export function parseSkillFile(path: string): SkillDoc {
  return parseSkillText(readFileSync(path, 'utf8'));
}
