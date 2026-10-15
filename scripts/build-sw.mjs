// Writes public/sw.js from scripts/sw.template.js with a version taken from the deployment (R8). The browser only installs a new service
// worker when the file's bytes change; with a fixed version constant an ordinary deploy never did, so phones kept an old worker (and its old
// cache) until someone remembered to bump the number by hand. Run by `npm run build` (the "prebuild" script); on a developer's machine there
// is no deployment id, the version is "bp-dev", and the file does not change.
//
// This only writes public/sw.js. It never touches a database or the network.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @param {Record<string, string | undefined>} [env] */
export function swVersion(env = process.env) {
  const id = env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA || 'dev';
  // The version is used in cache names and compared with startsWith: keep it to plain characters and short.
  return `bp-${String(id).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 48)}`;
}

/** @param {string} template @param {Record<string, string | undefined>} [env] */
export function renderSw(template, env = process.env) {
  if (!template.includes('__SW_VERSION__')) throw new Error('The template has no __SW_VERSION__ placeholder');
  return template.replace('__SW_VERSION__', swVersion(env));
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** @param {Record<string, string | undefined>} [env] @param {{ templatePath?: string, outPath?: string }} [paths] */
export function buildSw(env = process.env, { templatePath = path.join(here, 'sw.template.js'), outPath = path.join(here, '..', 'public', 'sw.js') } = {}) {
  const output = renderSw(readFileSync(templatePath, 'utf8'), env);
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
  if (current !== output) writeFileSync(outPath, output);
  return { version: swVersion(env), changed: current !== output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version, changed } = buildSw();
  console.log(`service worker ${version}${changed ? ' written' : ' unchanged'}`);
}
