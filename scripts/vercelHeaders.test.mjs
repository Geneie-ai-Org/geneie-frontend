// S-071: geneie.chat sent no CSP, frame-ancestors, Referrer-Policy, nosniff or Permissions-Policy
// at all -- vercel.json had only a rewrites block. Plain-node test (the repo has no test runner):
// parses the real vercel.json and checks every required header is present on the catch-all source,
// the CSP has the required hard directives, and no 'unsafe-eval' or wildcard '*' source anywhere.
// Run: node scripts/vercelHeaders.test.mjs   (exit 0 = all passed)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

const vercelJsonPath = path.join(import.meta.dirname, '..', 'vercel.json');
const config = JSON.parse(readFileSync(vercelJsonPath, 'utf8'));

function catchAllHeaders() {
  const block = (config.headers || []).find((h) => h.source === '/(.*)');
  assert.ok(block, 'no headers block for the catch-all source /(.*) in vercel.json');
  const map = {};
  for (const { key, value } of block.headers) map[key] = value;
  return map;
}

const headers = catchAllHeaders();

test('Content-Security-Policy header is present', () => {
  assert.ok(headers['Content-Security-Policy'], 'missing Content-Security-Policy header');
});

test('Referrer-Policy is strict-origin-when-cross-origin', () => {
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
});

test('X-Content-Type-Options is nosniff', () => {
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});

test('Permissions-Policy denies camera, microphone, geolocation and payment', () => {
  const pp = headers['Permissions-Policy'];
  assert.ok(pp, 'missing Permissions-Policy header');
  for (const feature of ['camera', 'microphone', 'geolocation', 'payment']) {
    assert.ok(
      new RegExp(`${feature}=\\(\\)`).test(pp),
      `Permissions-Policy must deny ${feature} (expected "${feature}=()")`
    );
  }
});

test('Strict-Transport-Security is present with a long max-age and includeSubDomains', () => {
  const hsts = headers['Strict-Transport-Security'];
  assert.ok(hsts, 'missing Strict-Transport-Security header');
  const maxAgeMatch = hsts.match(/max-age=(\d+)/);
  assert.ok(maxAgeMatch, 'HSTS header has no max-age');
  assert.ok(Number(maxAgeMatch[1]) >= 31536000, 'HSTS max-age must be at least one year');
  assert.ok(/includeSubDomains/.test(hsts), 'HSTS must include includeSubDomains');
});

function cspDirectives() {
  const csp = headers['Content-Security-Policy'];
  const out = {};
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    out[name] = values;
  }
  return out;
}

test('CSP has frame-ancestors \'none\'', () => {
  const directives = cspDirectives();
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
});

test('CSP has object-src \'none\'', () => {
  const directives = cspDirectives();
  assert.deepEqual(directives['object-src'], ["'none'"]);
});

test('CSP has base-uri and form-action restricted to self', () => {
  const directives = cspDirectives();
  assert.deepEqual(directives['base-uri'], ["'self'"]);
  assert.deepEqual(directives['form-action'], ["'self'"]);
});

test('CSP has default-src \'self\'', () => {
  const directives = cspDirectives();
  assert.deepEqual(directives['default-src'], ["'self'"]);
});

test('CSP has no \'unsafe-eval\' anywhere', () => {
  const csp = headers['Content-Security-Policy'];
  assert.ok(!csp.includes("'unsafe-eval'"), "CSP must never include 'unsafe-eval'");
});

test('CSP has no wildcard \'*\' source on any directive', () => {
  const directives = cspDirectives();
  for (const [name, values] of Object.entries(directives)) {
    assert.ok(!values.includes('*'), `directive ${name} must not use a wildcard '*' source`);
  }
});

test('script-src only allows self and specific hashes, never unsafe-inline', () => {
  const directives = cspDirectives();
  const scriptSrc = directives['script-src'];
  assert.ok(scriptSrc, 'missing script-src directive');
  assert.ok(scriptSrc.includes("'self'"), "script-src must include 'self'");
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), "script-src must not use 'unsafe-inline'");
  const hashSources = scriptSrc.filter((v) => v.startsWith("'sha256-"));
  assert.ok(hashSources.length >= 2, 'expected at least 2 sha256 hash sources for the inline scripts in index.html');
});

test('script-src allows apis.google.com and www.gstatic.com for Firebase Google sign-in', () => {
  // signInWithPopup(auth, new GoogleAuthProvider()) (AuthForm.jsx) loads the GSI client library
  // from apis.google.com -- S-071's original script-src (self + two hashes only) blocked that load
  // silently and signInWithPopup failed with the generic auth/internal-error, breaking every
  // Google sign-in in prod. gstatic.com covers the gapi loader's secondary script some auth library
  // versions pull. The popup window itself (accounts.google.com) is a separate browsing context
  // governed by Google's own CSP, not ours, so it does not belong in this page's script-src.
  const directives = cspDirectives();
  const scriptSrc = directives['script-src'];
  assert.ok(scriptSrc.includes('https://apis.google.com'), 'script-src must include https://apis.google.com for Firebase Google sign-in');
  assert.ok(scriptSrc.includes('https://www.gstatic.com'), 'script-src must include https://www.gstatic.com for the gapi loader');
});

test('the allow-listed script hashes actually match index.html\'s inline scripts today', () => {
  // A stale hash fails CLOSED -- CSP silently blocks the script with no visible error for most
  // users -- so this must be verified against the real file, not assumed from the hash existing.
  const directives = cspDirectives();
  const scriptSrc = directives['script-src'];
  const htmlPath = path.join(import.meta.dirname, '..', 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((body) => body.trim() && !/\ssrc=/.test(body));
  assert.ok(scripts.length >= 2, 'expected at least 2 inline <script> bodies in index.html');
  for (const body of scripts) {
    const hash = `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
    assert.ok(
      scriptSrc.includes(hash),
      `index.html's inline script (starts "${body.trim().slice(0, 40)}...") has no matching ` +
      `CSP hash in vercel.json -- recompute and update it`
    );
  }
});

test('connect-src does not include dropboxapi.com (the browser only string-matches a Dropbox ' +
     'URL\'s shape client-side for validation; the actual download happens server-side)', () => {
  const csp = headers['Content-Security-Policy'];
  assert.ok(!csp.includes('dropboxapi.com'),
    'isRecognizedImportUrl only checks the URL shape -- the client never fetches Dropbox directly, ' +
    'so this host does not belong in the CSP');
});

test('connect-src includes the real API origin and known external hosts actually called at runtime', () => {
  const directives = cspDirectives();
  const connectSrc = directives['connect-src'];
  assert.ok(connectSrc, 'missing connect-src directive');
  for (const host of [
    'https://api-newprod.geneie.chat', // backend API
    'https://identitytoolkit.googleapis.com', // Firebase Auth
    'https://securetoken.googleapis.com', // Firebase Auth token refresh
    'https://us.i.posthog.com', // PostHog ingest (only if PostHog stays on)
    'https://jbrowse.org', // JBrowse reference FASTA + plugin store
    'https://ipapi.co', // SubscriptionPage.jsx country lookup -- a real fetch() call, found by
    // scanning the built bundle for every hardcoded fetch() URL, not just this repo's own files
  ]) {
    assert.ok(connectSrc.includes(host), `connect-src must include ${host}`);
  }
});

test('img-src allows the variant-files S3 bucket for presigned images', () => {
  const directives = cspDirectives();
  const imgSrc = directives['img-src'];
  assert.ok(imgSrc, 'missing img-src directive');
  assert.ok(
    imgSrc.some((v) => v.includes('geneie-newprod-variant-files')),
    'img-src must include the variant-files S3 bucket host for presigned images'
  );
});

console.log(`\n${passed} passed`);
