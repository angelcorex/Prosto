// Vendor the Twemoji 72x72 PNG set locally so emoji load same-origin (instant,
// cached, offline-capable) instead of waiting on the jsDelivr CDN.
//
// Usage, from the repo root:
//   node scripts/vendor-twemoji.mjs
//
// Then set in .env.local:
//   NEXT_PUBLIC_TWEMOJI_BASE=/emoji/72x72
//
// It downloads only the glyphs the app can actually render (every emoji in
// @emoji-mart/data — already a dependency), skips files already present so
// re-runs are cheap, and limits concurrency so it's gentle on the CDN.
//
// Graphics: Twemoji (c) Twitter, Inc and other contributors, CC-BY 4.0.

import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'emoji', '72x72');
const CONCURRENCY = 16;

// Same codepoint conversion twemojiUrl() uses, so filenames match exactly.
const U200D = String.fromCharCode(0x200d);
const UFE0F = /\uFE0F/g;
function toCodePoint(str, sep = '-') {
  const r = [];
  let c = 0;
  let p = 0;
  let i = 0;
  while (i < str.length) {
    c = str.charCodeAt(i++);
    if (p) {
      r.push((0x10000 + ((p - 0xd800) << 10) + (c - 0xdc00)).toString(16));
      p = 0;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      p = c;
    } else {
      r.push(c.toString(16));
    }
  }
  return r.join(sep);
}
function codeOf(emoji) {
  return toCodePoint(emoji.indexOf(U200D) < 0 ? emoji.replace(UFE0F, '') : emoji);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // @emoji-mart/data's main is a JSON file. Read it straight off disk (an ESM
  // import() would need an import attribute; a require() hits the ESM loader on
  // newer Node). Resolve via the package's package.json so the set version
  // ("sets/15/...") is whatever is installed.
  const pkgJsonPath = require.resolve('@emoji-mart/data/package.json');
  const pkgDir = dirname(pkgJsonPath);
  const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf8'));
  const data = JSON.parse(await readFile(join(pkgDir, pkg.main), 'utf8'));
  const natives = Object.values(data.emojis)
    .map((e) => e?.skins?.[0]?.native)
    .filter(Boolean);

  // De-dupe by codepoint (skin variants can map to the same base file).
  const codes = [...new Set(natives.map(codeOf))];

  await mkdir(OUT_DIR, { recursive: true });

  let done = 0;
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  const queue = [...codes];
  async function worker() {
    for (;;) {
      const code = queue.shift();
      if (!code) return;
      const dest = join(OUT_DIR, `${code}.png`);
      if (await exists(dest)) {
        skipped++;
      } else {
        try {
          const res = await fetch(`${CDN}/${code}.png`);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            await writeFile(dest, buf);
            downloaded++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }
      done++;
      if (done % 100 === 0 || done === codes.length) {
        process.stdout.write(`\r  ${done}/${codes.length}  (new ${downloaded}, skip ${skipped}, fail ${failed})   `);
      }
    }
  }

  console.log(`Vendoring ${codes.length} Twemoji glyphs -> ${OUT_DIR}`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n');
  console.log(`Done. new ${downloaded}, skipped ${skipped}, failed ${failed}.`);
  console.log('Now set NEXT_PUBLIC_TWEMOJI_BASE=/emoji/72x72 in .env.local and restart.');
  if (failed > 0) console.log('Some glyphs failed (transient CDN errors) — re-run to fill the gaps.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
