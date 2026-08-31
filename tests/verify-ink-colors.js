// tests/verify-ink-colors.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

class FakeLocalStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
}

global.localStorage = new FakeLocalStorage();
const { InkColorPalette } = require('../shared/ink-color-palette.js');

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('========================================');
console.log('🎨 Ink Color Preference Verification');
console.log('========================================');

test('1. Pen and Highlighter have independent defaults', () => {
  assert.strictEqual(InkColorPalette.getColor('pen'), '#38bdf8');
  assert.strictEqual(InkColorPalette.getColor('highlighter'), '#ffd166');
  assert.notStrictEqual(InkColorPalette.getColor('pen'), InkColorPalette.getColor('highlighter'));
});

test('2. Fountain/watercolor semantic tool names map to the correct preference', () => {
  assert.strictEqual(InkColorPalette.getColor('fountain_pen'), InkColorPalette.getColor('pen'));
  assert.strictEqual(InkColorPalette.getColor('watercolor'), InkColorPalette.getColor('highlighter'));
});

test('3. Changing Pen color never changes Highlighter color', () => {
  const oldHighlighter = InkColorPalette.getColor('highlighter');
  assert.strictEqual(InkColorPalette.setColor('pen', '#ff0000'), true);
  assert.strictEqual(InkColorPalette.getColor('pen'), '#ff0000');
  assert.strictEqual(InkColorPalette.getColor('highlighter'), oldHighlighter);
});

test('4. Changing Highlighter color never changes Pen color', () => {
  const oldPen = InkColorPalette.getColor('pen');
  assert.strictEqual(InkColorPalette.setColor('highlighter', '#00ff00'), true);
  assert.strictEqual(InkColorPalette.getColor('highlighter'), '#00ff00');
  assert.strictEqual(InkColorPalette.getColor('pen'), oldPen);
});

test('5. Color values persist independently in localStorage', () => {
  assert.strictEqual(global.localStorage.getItem(InkColorPalette.STORAGE_KEYS.pen), '#ff0000');
  assert.strictEqual(global.localStorage.getItem(InkColorPalette.STORAGE_KEYS.highlighter), '#00ff00');
});

test('6. Three-digit hex expands deterministically and invalid input is rejected', () => {
  assert.strictEqual(InkColorPalette.normalizeHex('#abc'), '#aabbcc');
  assert.strictEqual(InkColorPalette.setColor('pen', '#abc'), true);
  assert.strictEqual(InkColorPalette.getColor('pen'), '#aabbcc');
  assert.strictEqual(InkColorPalette.setColor('pen', 'not-a-color'), false);
  assert.strictEqual(InkColorPalette.getColor('pen'), '#aabbcc');
});

test('7. Both tools expose useful preset palettes', () => {
  assert(InkColorPalette.PRESETS.pen.length >= 6);
  assert(InkColorPalette.PRESETS.highlighter.length >= 6);
  assert(InkColorPalette.PRESETS.pen.includes('#38bdf8'));
  assert(InkColorPalette.PRESETS.highlighter.includes('#ffd166'));
});

test('8. Canvas creates strokes using the selected per-tool color preference', () => {
  const canvasJs = fs.readFileSync(path.join(__dirname, '..', 'canvas.js'), 'utf8');
  assert(canvasJs.includes('InkColorPalette.getColor(activeTool)'), 'canvas.js must read the current selected color when the stroke starts');
  assert(!canvasJs.includes("color: activeTool === 'highlighter' ? '#f59e0b' : '#38bdf8'"), 'hardcoded tool colors must be removed');
});

test('9. Canvas HTML loads the palette before the main Canvas controller', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'canvas.html'), 'utf8');
  const palettePos = html.indexOf('shared/ink-color-palette.js');
  const canvasPos = html.indexOf('canvas.js');
  assert(palettePos >= 0, 'palette module must be loaded');
  assert(canvasPos >= 0, 'canvas controller must be loaded');
  assert(palettePos < canvasPos, 'palette module must load before canvas.js');
});

test('10. Toolbar remains the locked two-button ink model', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'canvas.html'), 'utf8');
  assert(html.includes('id="tool-pen"'));
  assert(html.includes('id="tool-highlighter"'));
  assert(!html.includes('id="tool-watercolor"'));
  assert(!html.includes('id="tool-ink-wash"'));
});

console.log(`\nVerification Complete: ${passed}/${total} tests passed.`);
if (passed !== total) process.exit(1);
