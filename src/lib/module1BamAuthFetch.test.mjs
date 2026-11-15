import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'module1BamAuthFetch.js'), 'utf8');

test('auth fetch wrapper only matches module1 bam byte paths', () => {
  assert.ok(src.includes('/api/module1/bam/'));
  assert.ok(src.includes('(file|index)'));
  assert.match(src, /getAuthHeaders/);
  assert.match(src, /Authorization/);
  assert.match(src, /X-Device-Id/);
  assert.ok(src.includes("cache: 'no-store'") || src.includes('cache: "no-store"'));
});
