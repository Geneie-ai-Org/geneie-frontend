import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

test('vercel rewrites BAM byte paths to api-newprod', () => {
  const vercel = JSON.parse(readFileSync(join(here, '../../vercel.json'), 'utf8'));
  const sources = vercel.rewrites.map((r) => r.source);
  assert.ok(sources.includes('/api/module1/bam/:cid/file'));
  assert.ok(sources.includes('/api/module1/bam/:cid/index'));
  const file = vercel.rewrites.find((r) => r.source.includes('/file'));
  assert.equal(
    file.destination,
    'https://api-newprod.geneie.chat/api/module1/bam/:cid/file',
  );
});

test('byte URL helper stays on same origin paths', () => {
  const src = readFileSync(join(here, 'module1BamByteUrls.js'), 'utf8');
  assert.ok(src.includes('/api/module1/bam/'));
  assert.ok(!src.includes('apiUrl'));
  assert.ok(src.includes('location.origin'));
});
