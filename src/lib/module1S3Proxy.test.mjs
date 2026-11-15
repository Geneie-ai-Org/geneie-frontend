import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

test('S3 proxy covers regional, dualstack, and path-style hosts', async () => {
  // Load without browser: inject a fake window for origin
  globalThis.window = { location: { origin: 'https://geneie.chat' } };
  const mod = await import(pathToFileURL(join(here, 'module1S3Proxy.js')).href);
  const { toSameOriginVariantProxy, variantProxyTarget } = mod;

  assert.equal(
    variantProxyTarget('geneie-newprod-variant-files.s3.ap-south-1.amazonaws.com', '/k').kind,
    'regional',
  );
  assert.equal(
    variantProxyTarget('geneie-newprod-variant-files.s3.dualstack.ap-south-1.amazonaws.com', '/k').kind,
    'regional',
  );
  assert.equal(
    variantProxyTarget('s3.ap-south-1.amazonaws.com', '/geneie-newprod-variant-files/k').pathname,
    '/k',
  );

  const proxied = toSameOriginVariantProxy(
    'https://geneie-newprod-variant-files.s3.ap-south-1.amazonaws.com/module1/x.bam?X-Amz-Signature=1',
  );
  assert.equal(
    proxied,
    'https://geneie.chat/s3-variant-regional/module1/x.bam?X-Amz-Signature=1',
  );
});

test('source still documents proxy prefixes', () => {
  const src = readFileSync(join(here, 'module1S3Proxy.js'), 'utf8');
  assert.ok(src.includes('/s3-variant-regional'));
  assert.ok(src.includes('dualstack'));
});
