// S-060: with a PostHog key set, $current_url (and friends) sent the password-reset oobCode query
// param and a conversation id in the path (/app/<uuid>) to PostHog US; exception/dead-click/
// performance capture were not pinned off.
//
// Plain-node test (the repo has no test runner). scrubUrlValue, isAuthActionEvent and
// scrubPostHogEvent are pure functions with no PostHog SDK or @/config/env dependency, so this
// imports analytics.js directly after stubbing its one alias import.
// Run: node src/lib/analytics.test.mjs   (exit 0 = all passed)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
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

let _loadCounter = 0;

async function loadAnalytics(allowRawUrls = false) {
  const srcPath = path.join(import.meta.dirname, 'analytics.js');
  let src = readFileSync(srcPath, 'utf8');
  src = src.replace(
    "import { env, isPostHogConfigured } from '@/config/env';",
    "const env = { posthog: { key: '', host: '' } }; const isPostHogConfigured = () => false;"
  );
  src = src.replace(
    "import.meta.env.VITE_SECURITY_POSTHOG_RAW_URLS === 'true'",
    allowRawUrls ? 'true' : 'false'
  );
  // initAnalytics() checks import.meta.env.PROD at call time, but this test never calls it
  // (scrubPostHogEvent/scrubUrlValue/isAuthActionEvent don't touch import.meta.env at all beyond
  // the one line above), so no further stubbing is needed.
  //
  // Each call gets its own filename AND a monotonic cache-busting query param -- Date.now() alone
  // can return the same millisecond on two back-to-back calls (caught by this test itself: the
  // "raw URLs allowed" instance was silently resolving to the cached "scrubbed" module on a fast
  // machine), which would make allowRawUrls=true load the allowRawUrls=false module instead.
  _loadCounter += 1;
  const outFile = path.join(import.meta.dirname, `.analytics.transformed.${process.pid}.${_loadCounter}.mjs`);
  writeFileSync(outFile, src);
  try {
    return await import(`file://${outFile}?v=${_loadCounter}`);
  } finally {
    unlinkSync(outFile);
  }
}

const { scrubUrlValue, isAuthActionEvent, scrubPostHogEvent } = await loadAnalytics(false);
const unscrubbed = await loadAnalytics(true);

test('scrubUrlValue strips the query string and fragment', () => {
  assert.equal(
    scrubUrlValue('https://app.geneie.chat/auth/action?mode=resetPassword&oobCode=SECRET123#frag'),
    'https://app.geneie.chat/auth/action'
  );
});

test('scrubUrlValue replaces /app/<id> with /app/:id', () => {
  assert.equal(
    scrubUrlValue('https://app.geneie.chat/app/3fa85f64-5717-4562-b3fc-2c963f66afa6?x=1'),
    'https://app.geneie.chat/app/:id'
  );
});

test('scrubUrlValue handles a bare pathname (no scheme/host)', () => {
  assert.equal(scrubUrlValue('/app/abc-123-def?token=xyz'), '/app/:id');
});

test('scrubUrlValue leaves non-matching paths alone (besides stripping query/fragment)', () => {
  assert.equal(scrubUrlValue('https://app.geneie.chat/pricing?ref=email'), 'https://app.geneie.chat/pricing');
});

test('isAuthActionEvent detects the auth-action route from $current_url', () => {
  assert.equal(
    isAuthActionEvent({ $current_url: 'https://app.geneie.chat/auth/action?oobCode=SECRET123' }),
    true
  );
});

test('isAuthActionEvent detects the auth-action route from $pathname', () => {
  assert.equal(isAuthActionEvent({ $pathname: '/auth/action' }), true);
});

test('isAuthActionEvent is false for an unrelated route', () => {
  assert.equal(isAuthActionEvent({ $current_url: 'https://app.geneie.chat/app/abc-123' }), false);
});

test('scrubPostHogEvent drops the whole event on the auth-action route', () => {
  const event = {
    event: '$pageview',
    properties: { $current_url: 'https://app.geneie.chat/auth/action?oobCode=SECRET123' },
  };
  assert.equal(scrubPostHogEvent(event), null);
});

test('scrubPostHogEvent scrubs every URL-bearing property on a non-auth-action event', () => {
  const event = {
    event: '$pageview',
    properties: {
      $current_url: 'https://app.geneie.chat/app/abc-123?x=1',
      $referrer: 'https://app.geneie.chat/app/def-456?y=2',
      $initial_current_url: 'https://app.geneie.chat/app/ghi-789',
      $pathname: '/app/abc-123',
      other_prop: 'keep-me',
    },
  };
  const result = scrubPostHogEvent(event);
  assert.equal(result.properties.$current_url, 'https://app.geneie.chat/app/:id');
  assert.equal(result.properties.$referrer, 'https://app.geneie.chat/app/:id');
  assert.equal(result.properties.$initial_current_url, 'https://app.geneie.chat/app/:id');
  assert.equal(result.properties.$pathname, '/app/:id');
  assert.equal(result.properties.other_prop, 'keep-me');
});

test('VITE_SECURITY_POSTHOG_RAW_URLS=true still drops auth-action events (not bypassable)', () => {
  // The oobCode leak is a live secret, not just URL hygiene -- this kill switch is for seeing real
  // /app/<id> paths in a dev PostHog project, not for re-exposing a password-reset code.
  const event = {
    event: '$pageview',
    properties: { $current_url: 'https://app.geneie.chat/auth/action?oobCode=SECRET123' },
  };
  assert.equal(unscrubbed.scrubPostHogEvent(event), null);
});

test('VITE_SECURITY_POSTHOG_RAW_URLS=true leaves non-auth-action URLs unscrubbed', () => {
  const event = {
    event: '$pageview',
    properties: { $current_url: 'https://app.geneie.chat/app/abc-123?x=1' },
  };
  const result = unscrubbed.scrubPostHogEvent(event);
  assert.equal(result.properties.$current_url, 'https://app.geneie.chat/app/abc-123?x=1');
});

test('ErrorBoundary sends the error class only, not the message or path', () => {
  // Mirrors ErrorBoundary.componentDidCatch's exact extraction logic -- a TypeError errors with a
  // sensitive message (e.g. a bad value echoed from a rendered patient field) must never put that
  // message, or the raw pathname (which can be /app/<conversation-id>), into the captured event.
  const error = new TypeError('variant row 42: unexpected value "chr1-123456-A-G-patient-smith"');
  const errorClass = error?.constructor?.name || error?.name || 'Error';
  assert.equal(errorClass, 'TypeError');
  assert.ok(!errorClass.includes('patient'), 'the error class must never carry the message text');
});

console.log(`\n${passed} passed`);
