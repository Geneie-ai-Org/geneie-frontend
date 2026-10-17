// S-021: model-written images load in the browser. react-markdown's default URL transform allows
// https:, so an <img> in a model answer (or a literature chunk, a file header, an INFO value, a
// URL-imported file -- text we don't control) rendered live, and also emitted a <link
// rel="preload" as="image"> hint that fetches the URL even if the <img> itself never paints.
//
// Plain-node test (the repo has no test runner): transforms the REAL ChatMarkdown.jsx source with
// Vite's bundled oxc transform (no build step, no separate JSX toolchain dependency -- vite is
// already a devDependency), stubs its two unrelated imports (the `cn` className helper and
// CodeBlock, neither of which the img-rendering path touches), and dynamically imports the result.
// Run: node src/components/chat/ChatMarkdown.test.mjs   (exit 0 = all passed)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { transformWithOxc } from 'vite';

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

async function loadInitialComponents(allowImages = false) {
  const srcPath = path.join(import.meta.dirname, 'ChatMarkdown.jsx');
  let src = readFileSync(srcPath, 'utf8');
  // Stub the two imports unrelated to img rendering so this test doesn't need the alias resolver
  // or the whole CodeBlock dependency tree -- neither is exercised by the assertions below.
  src = src.replace("import { cn } from '@/lib/utils';", "const cn = (...a) => a.filter(Boolean).join(' ');");
  src = src.replace(
    "import { CodeBlock } from './CodeBlock';",
    "const CodeBlock = () => null;"
  );
  // import.meta.env is a Vite build-time global; stub it the way Vite's `define` would substitute
  // it, with the kill switch unset (the production default) unless a test flips it.
  src = src.replace(
    "import.meta.env.VITE_SECURITY_ALLOW_MARKDOWN_IMAGES === 'true'",
    allowImages ? 'true' : 'false'
  );
  const result = await transformWithOxc(src, 'ChatMarkdown.jsx', { jsx: { runtime: 'automatic' } });
  // Written next to the real source (not /tmp) so node_modules resolution (react, react-markdown)
  // works the normal way; deleted immediately after import.
  const outFile = path.join(import.meta.dirname, `.ChatMarkdown.transformed.${process.pid}.mjs`);
  writeFileSync(outFile, result.code);
  try {
    const mod = await import(`file://${outFile}?t=${Date.now()}`);
    return mod.INITIAL_COMPONENTS;
  } finally {
    unlinkSync(outFile);
  }
}

const INITIAL_COMPONENTS = await loadInitialComponents(false);
const INITIAL_COMPONENTS_IMAGES_ALLOWED = await loadInitialComponents(true);

function render(markdown, components = INITIAL_COMPONENTS) {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkBreaks], components }, markdown)
  );
}

test('a markdown image renders no <img> tag', () => {
  const html = render('![alt text](https://evil.example/tracker.png)');
  assert.ok(!html.includes('<img'), `expected no <img> tag, got: ${html}`);
});

test('a markdown image emits no preload link (no network fetch hint at all)', () => {
  const html = render('![alt text](https://evil.example/tracker.png)');
  assert.ok(!html.includes('<link'), `expected no <link> preload hint, got: ${html}`);
  assert.ok(!html.includes('evil.example'), `the attacker URL must not appear anywhere in the output: ${html}`);
});

test('a reference-style markdown image also renders no <img> tag', () => {
  const html = render('![alt][1]\n\n[1]: https://evil.example/tracker.png');
  assert.ok(!html.includes('<img'), `expected no <img> tag, got: ${html}`);
  assert.ok(!html.includes('evil.example'), `the attacker URL must not appear anywhere in the output: ${html}`);
});

test('non-image content still renders normally (the fix is scoped to img only)', () => {
  const html = render('**bold** and a [link](https://example.com)');
  assert.ok(html.includes('<strong>bold</strong>'), `expected bold text to still render: ${html}`);
  assert.ok(html.includes('<a href="https://example.com"'), `expected the link to still render: ${html}`);
});

test('VITE_SECURITY_ALLOW_MARKDOWN_IMAGES=true restores the old (unsafe) behaviour', () => {
  const html = render('![alt](https://example.com/x.png)', INITIAL_COMPONENTS_IMAGES_ALLOWED);
  assert.ok(html.includes('<img'), `kill switch should restore <img> rendering, got: ${html}`);
});

console.log(`\n${passed} passed`);
