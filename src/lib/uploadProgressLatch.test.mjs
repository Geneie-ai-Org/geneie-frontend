// Run: node src/lib/uploadProgressLatch.test.mjs
//
// Regression guard for "VCF upload shows no progress, the file just appears after a few seconds".
//
// The progress modal used to be driven by `uploadSessionConversationId === activeConversationId`.
// On a brand-new chat the upload starts while the route id is still settling (or the user's chat
// id changes mid-transfer), so the equality failed and the modal never rendered — the bytes were
// uploading the whole time with no UI. The fix is a plain boolean latch that only
// handleVariantUploadingChange sets and clears.
//
// These tests pin the shape of both expressions. They are pure functions of state, mirroring the
// hook's logic, so they run in plain node with no DOM.

import assert from 'node:assert/strict';

/** The OLD (buggy) expression, kept so the regression is provable. */
export function uploadInProgressById(sessionId, activeId) {
  return Boolean(sessionId) && sessionId === activeId;
}

/** The NEW expression: a latch set on start, cleared on settle. */
export function uploadInProgressByLatch(latch) {
  return Boolean(latch);
}

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

test('old logic hid the modal when the route id settled after the upload started', () => {
  // upload started with a known conversation, then the route briefly has no id
  assert.equal(uploadInProgressById('conv-1', null), false);
  // upload started before the id existed at all
  assert.equal(uploadInProgressById(null, null), false);
});

test('old logic hid the modal when the user switched chat mid-transfer', () => {
  assert.equal(uploadInProgressById('conv-1', 'conv-2'), false);
});

test('new latch shows the modal in every one of those cases', () => {
  const latch = true; // set by handleVariantUploadingChange(true)
  assert.equal(uploadInProgressByLatch(latch), true);
  // and it does not depend on any id at all
  assert.equal(uploadInProgressByLatch(true), true);
});

test('new latch is false before an upload starts and after it settles', () => {
  assert.equal(uploadInProgressByLatch(false), false);
  assert.equal(uploadInProgressByLatch(undefined), false);
  assert.equal(uploadInProgressByLatch(null), false);
});

test('idempotent start keeps the first conversation id for the pipeline poll', () => {
  // mirrors setUploadSessionConversationId((prev) => prev || activeConversationId || null)
  const start = (prev, active) => prev || active || null;
  assert.equal(start(null, 'conv-1'), 'conv-1');
  assert.equal(start('conv-1', 'conv-2'), 'conv-1');
  assert.equal(start(null, null), null);
});

console.log(`\n${passed} passed`);
