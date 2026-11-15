import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'module1S3Proxy.js'), 'utf8');

test('S3 proxy covers regional and dualstack hosts', () => {
  assert.ok(src.includes('s3.ap-south-1.amazonaws.com'));
  assert.ok(src.includes('dualstack'));
  assert.ok(src.includes('/s3-variant-regional'));
  assert.ok(src.includes('/s3-variant'));
  assert.ok(src.includes('variantProxyKindForHost'));
});
