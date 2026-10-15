// Plain-node tests for src/lib/sseFrames.js (the repo has no test runner).
// Run: node src/lib/sseFrames.test.mjs   (exit 0 = all passed)
import assert from 'node:assert/strict';
import {
  splitSseFrames, parseSseFrame, classifyStreamEnd, withStreamCutNote, stripStreamCutNote, STREAM_CUT_NOTE,
} from './sseFrames.js';

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

// Feed text in arbitrary chunks the way the reader loop does; return the parsed events in order.
function feed(chunks) {
  let buffer = '';
  const events = [];
  for (const chunk of chunks) {
    buffer += chunk;
    const split = splitSseFrames(buffer);
    buffer = split.rest;
    for (const frame of split.frames) {
      const evt = parseSseFrame(frame);
      if (evt !== undefined) events.push(evt);
    }
  }
  return { events, rest: buffer };
}

const delta = (t) => `data: ${JSON.stringify({ type: 'delta', text: t })}\n\n`;

test('splits complete frames and keeps the unfinished tail', () => {
  assert.deepEqual(splitSseFrames('data: {"a":1}\n\ndata: {"b"'), { frames: ['data: {"a":1}'], rest: 'data: {"b"' });
  assert.deepEqual(splitSseFrames(''), { frames: [], rest: '' });
  assert.deepEqual(splitSseFrames('x\n\n'), { frames: ['x'], rest: '' });
});

test('a frame split across chunks is parsed once, when complete', () => {
  const whole = delta('Hel') + delta('lo');
  const { events, rest } = feed([whole.slice(0, 10), whole.slice(10, 31), whole.slice(31)]);
  assert.deepEqual(events.map((e) => e.text), ['Hel', 'lo']);
  assert.equal(rest, '');
});

test('keep-alive comment frames are skipped and never corrupt data frames', () => {
  const { events } = feed([': keepalive\n\n', delta('a'), ': keepalive\n\n: keepalive\n\n', delta('b')]);
  assert.deepEqual(events.map((e) => e.text), ['a', 'b']);
  assert.equal(parseSseFrame(': keepalive'), undefined);
});

test('first data line wins; other fields are ignored', () => {
  assert.deepEqual(parseSseFrame('event: x\ndata: {"type":"done","response":"r"}\nid: 1'), { type: 'done', response: 'r' });
});

test('malformed JSON and frames without data are skipped', () => {
  assert.equal(parseSseFrame('data: {not json'), undefined);
  assert.equal(parseSseFrame('retry: 1000'), undefined);
  assert.equal(parseSseFrame('data:{"no":"space"}'), undefined); // the inline parser required "data: "
});

test('a literal data: null parses to null (same as the old inline JSON.parse)', () => {
  assert.equal(parseSseFrame('data: null'), null);
});

test('started event (optional, backend knobs.sse_started_event) is just another event', () => {
  const { events } = feed(['data: {"type":"started","turn_id":"abc"}\n\n', delta('x')]);
  assert.deepEqual(events.map((e) => e.type), ['started', 'delta']);
});

test('classifyStreamEnd: done = complete, no done + text = cut, no done + nothing = failed, error wins', () => {
  assert.equal(classifyStreamEnd({ sawDone: true, sawError: false, text: 'x' }), 'complete');
  assert.equal(classifyStreamEnd({ sawDone: true, sawError: false, text: '' }), 'complete');
  assert.equal(classifyStreamEnd({ sawDone: false, sawError: false, text: 'partial' }), 'cut');
  assert.equal(classifyStreamEnd({ sawDone: false, sawError: false, text: '' }), 'failed');
  assert.equal(classifyStreamEnd({ sawDone: false, sawError: true, text: 'x' }), 'error');
});

test('cut note: fixed text, prefixed, and removable for history', () => {
  assert.equal(STREAM_CUT_NOTE, 'Connection dropped; the answer may be incomplete.');
  const stored = withStreamCutNote('Partial answer');
  assert.ok(stored.startsWith(`_${STREAM_CUT_NOTE}_`));
  assert.ok(stored.endsWith('Partial answer'));
  assert.equal(stripStreamCutNote(stored), 'Partial answer');
  assert.equal(stripStreamCutNote('Normal answer'), 'Normal answer');
  assert.equal(stripStreamCutNote(undefined), undefined);
  assert.equal(withStreamCutNote(undefined), `_${STREAM_CUT_NOTE}_\n\n`);
});

console.log(`\n${passed} passed`);
