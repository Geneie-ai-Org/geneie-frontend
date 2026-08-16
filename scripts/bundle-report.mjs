/**
 * Attributes each built chunk's *output* bytes back to the package/file that
 * produced them, by walking the sourcemap mappings.
 *
 * Counting `sourcesContent` length instead is misleading: a fully tree-shaken
 * module still appears in `sources`, so dead dependencies look enormous.
 *
 * Usage: npm run build && node scripts/bundle-report.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ASSETS = 'build/assets';
const TOP_N = 12;

// VLQ base64 decoder — only the first field (generated column delta) and the
// source index delta are needed to attribute a segment to a source file.
const B64 = new Map(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .map((c, i) => [c, i])
);

function decodeVlq(str) {
  const out = [];
  let shift = 0;
  let value = 0;
  for (const c of str) {
    const digit = B64.get(c);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      const negate = value & 1;
      value >>= 1;
      out.push(negate ? -value : value);
      shift = 0;
      value = 0;
    }
  }
  return out;
}

/** Bytes of generated output attributed to each source, per chunk. */
function attribute(map, chunkLength) {
  const bytes = new Array(map.sources.length).fill(0);
  let sourceIdx = 0;
  const lines = map.mappings.split(';');

  for (const line of lines) {
    if (!line) continue;
    let genCol = 0;
    const segments = line.split(',');
    // Each segment owns the output from its column to the next segment's column.
    const parsed = [];
    for (const seg of segments) {
      if (!seg) continue;
      const fields = decodeVlq(seg);
      genCol += fields[0];
      if (fields.length >= 4) sourceIdx += fields[1];
      parsed.push({ col: genCol, src: fields.length >= 4 ? sourceIdx : null });
    }
    for (let i = 0; i < parsed.length; i++) {
      const { col, src } = parsed[i];
      if (src == null) continue;
      const end = i + 1 < parsed.length ? parsed[i + 1].col : col;
      bytes[src] += Math.max(0, end - col);
    }
  }

  // Mappings cover only mapped output; scale to the real chunk size so the
  // numbers add up to something comparable across chunks.
  const mapped = bytes.reduce((a, b) => a + b, 0);
  const scale = mapped > 0 ? chunkLength / mapped : 0;
  return bytes.map((b) => b * scale);
}

function groupKey(source) {
  const nm = source.lastIndexOf('node_modules/');
  if (nm !== -1) {
    const rest = source.slice(nm + 'node_modules/'.length).split('/');
    return rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  }
  const src = source.lastIndexOf('/src/');
  return src !== -1 ? source.slice(src + 1) : source;
}

const chunks = fs
  .readdirSync(ASSETS)
  .filter((f) => f.endsWith('.js.map'))
  .map((f) => {
    const js = path.join(ASSETS, f.replace(/\.map$/, ''));
    return { mapFile: path.join(ASSETS, f), js, size: fs.statSync(js).size };
  })
  .sort((a, b) => b.size - a.size)
  .slice(0, 5);

for (const chunk of chunks) {
  const map = JSON.parse(fs.readFileSync(chunk.mapFile, 'utf8'));
  const bytes = attribute(map, chunk.size);
  const totals = new Map();
  map.sources.forEach((s, i) => {
    const k = groupKey(s);
    totals.set(k, (totals.get(k) || 0) + bytes[i]);
  });

  console.log(`\n${path.basename(chunk.js)}  —  ${(chunk.size / 1024).toFixed(0)} kB`);
  [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .filter(([, v]) => v > 1024)
    .forEach(([k, v]) => {
      const pct = ((v / chunk.size) * 100).toFixed(1).padStart(5);
      console.log(`  ${(v / 1024).toFixed(0).padStart(6)} kB  ${pct}%  ${k}`);
    });
}
