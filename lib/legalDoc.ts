// The Privacy Policy and Terms are written in content/legal/*.md by the owner or their lawyer, not in code (H3). This turns that small markdown
// file into blocks the page can draw without ever inserting HTML: headings, paragraphs and bullet lists, with **bold** inside them.

export type LegalBlock = { type: 'h2' | 'h3' | 'p'; text: string } | { type: 'ul'; items: string[] };

export interface LegalDoc {
  title: string;
  version: string;
  updated: string;
  // true while the text is a draft: the page shows a "not final" banner. Set "status: final" in the file to remove it.
  draft: boolean;
  blocks: LegalBlock[];
}

function meta(source: string): { fields: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { fields: {}, body: source };
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) fields[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { fields, body: source.slice(match[0].length) };
}

export function parseLegalMarkdown(source: string, fallbackTitle = 'Legal'): LegalDoc {
  const { fields, body } = meta(source);
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    if (list.length) blocks.push({ type: 'ul', items: list });
    paragraph = [];
    list = [];
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
    } else if (line.startsWith('### ')) {
      flush();
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
    } else if (/^[-*] /.test(line)) {
      if (paragraph.length) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return {
    title: fields.title || fallbackTitle,
    version: fields.version || '',
    updated: fields.updated || '',
    draft: (fields.status ?? 'draft').toLowerCase() !== 'final',
    blocks,
  };
}

// "a **b** c" -> [{text:'a '}, {text:'b', bold:true}, {text:' c'}]. Nothing else in the text is interpreted.
export function splitBold(text: string): { text: string; bold?: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part }));
}

// Shown if a file is missing or unreadable. It never blames the coach or tells a member the policy does not exist.
export function unavailableDoc(title: string): LegalDoc {
  return {
    title,
    version: '',
    updated: '',
    draft: false,
    blocks: [{ type: 'p', text: `This page is being prepared. Please ask your gym for a copy of the ${title}.` }],
  };
}

export const LEGAL_SLUGS = ['privacy', 'terms'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
