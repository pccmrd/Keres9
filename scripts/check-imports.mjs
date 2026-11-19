// Static import/export check for the browser ES modules — no browser, no dependencies.
// Links every module under src/ with Node's real module linker (vm.SourceTextModule) but never
// evaluates them, so a missing named export, a typo'd import or a bad path fails exactly as the
// browser would, while DOM/window code at module top level is never touched.
//
// Usage: node --experimental-vm-modules scripts/check-imports.mjs
import vm from 'node:vm';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!vm.SourceTextModule) {
  console.error('Run with: node --experimental-vm-modules scripts/check-imports.mjs');
  process.exit(2);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });

const cache = new Map(), ctx = vm.createContext({});
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const m = new vm.SourceTextModule(readFileSync(file, 'utf8'), { identifier: relative(root, file), context: ctx });
  cache.set(file, m);
  return m;
}
async function link(spec, ref) {
  // browser-style specifiers: './x.js', '../x.js' relative to the importer, '/src/x.js' from the site root
  const base = dirname(join(root, ref.identifier));
  const file = spec.startsWith('/') ? join(root, spec) : resolve(base, spec);
  try { statSync(file); } catch { throw new Error(`${ref.identifier}: cannot resolve '${spec}'`); }
  return load(file);
}

const errs = new Set();
const files = walk(src);
for (const f of files) {
  const m = load(f);
  if (m.status !== 'unlinked') continue;   // already linked as part of an earlier module's graph
  try { await m.link(link); }
  catch (e) { errs.add(e.message); }
}
for (const e of errs) console.error('✗', e);
if (errs.size) { console.error(`\n${errs.size} import problem(s)`); process.exit(1); }
console.log(`✓ ${files.length} modules link cleanly (all named imports resolve)`);
