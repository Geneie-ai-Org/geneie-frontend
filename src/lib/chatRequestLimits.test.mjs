// Run: node src/lib/chatRequestLimits.test.mjs
import assert from 'node:assert/strict';
import {
  CHAT_TEXT_MAX,
  CHAT_HISTORY_MAX,
  clampChatText,
  buildChatHistoryPayload,
} from './chatRequestLimits.js';

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

test('clampChatText leaves short strings alone', () => {
  assert.equal(clampChatText('hi'), 'hi');
  assert.equal(clampChatText(null), '');
  assert.equal(clampChatText(undefined), '');
});

test('clampChatText truncates at CHAT_TEXT_MAX', () => {
  const long = 'x'.repeat(CHAT_TEXT_MAX + 50);
  const out = clampChatText(long);
  assert.equal(out.length, CHAT_TEXT_MAX);
  assert.equal(out, 'x'.repeat(CHAT_TEXT_MAX));
});

test('buildChatHistoryPayload clamps each text and appends extra user', () => {
  const long = 'y'.repeat(CHAT_TEXT_MAX + 1);
  const hist = buildChatHistoryPayload(
    [{ role: 'ai', text: long }],
    { extraUserText: 'next?' },
  );
  assert.equal(hist.length, 2);
  assert.equal(hist[0].role, 'ai');
  assert.equal(hist[0].text.length, CHAT_TEXT_MAX);
  assert.deepEqual(hist[1], { role: 'user', text: 'next?' });
});

test('buildChatHistoryPayload keeps the last CHAT_HISTORY_MAX items', () => {
  const msgs = Array.from({ length: CHAT_HISTORY_MAX + 5 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'ai',
    text: `m${i}`,
  }));
  const hist = buildChatHistoryPayload(msgs);
  assert.equal(hist.length, CHAT_HISTORY_MAX);
  assert.equal(hist[0].text, `m${5}`);
  assert.equal(hist[hist.length - 1].text, `m${CHAT_HISTORY_MAX + 4}`);
});

test('buildChatHistoryPayload honors mapText before clamp', () => {
  const hist = buildChatHistoryPayload(
    [{ role: 'ai', text: 'NOTE:hello' }],
    { mapText: (t) => String(t).replace(/^NOTE:/, '') },
  );
  assert.deepEqual(hist, [{ role: 'ai', text: 'hello' }]);
});

console.log(`\n${passed} passed`);
