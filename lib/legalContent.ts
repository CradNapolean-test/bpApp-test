import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseLegalMarkdown, unavailableDoc, type LegalDoc, type LegalSlug } from './legalDoc';

// Reads content/legal/<slug>.md (server only). The folder is included in the deployment by outputFileTracingIncludes in next.config.ts.
const TITLES: Record<LegalSlug, string> = { privacy: 'Privacy Policy', terms: 'Terms of Service' };

export async function loadLegalDocument(slug: LegalSlug, root: string = process.cwd()): Promise<LegalDoc> {
  try {
    const source = await readFile(path.join(root, 'content', 'legal', `${slug}.md`), 'utf8');
    return parseLegalMarkdown(source, TITLES[slug]);
  } catch {
    return unavailableDoc(TITLES[slug]);
  }
}
