// Build a SINGLE self-contained HTML file (inline CSS + classic <script>).
// Why: browsers block ES modules over file:// (CORS, origin "null").
// A classic <script> is not subject to that, so double-click works.
const fs = require('node:fs')
const path = require('node:path')

const DIR = path.join(__dirname, 'costudy-ui')
const OUT = path.join(__dirname, 'Costudy-UI-原型.html')

const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/^\uFEFF/, '')

/** strip `export ` prefixes and import statements, leaving plain declarations */
function stripModule(src) {
  return src
    // multi-line imports first (import { ... } from '...'), then single-line
    .replace(/^\s*import\s[\s\S]*?from\s*['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/\bexport\s+(const|let|var|function|class)\b/g, '$1')
}

/** wrap a variant module in an IIFE and return its exports */
function wrapVariant(src, name) {
  const body = stripModule(src)
  return `const ${name} = (function () {\n${body}\nreturn { mount };\n})();\n`
}

const css = read('tokens.css') + '\n' + read('liquid-glass.css') + '\n' + read('transparent.css') + '\n' + read('gradient-type.css')
const ui = stripModule(read('ui.js'))
const data = stripModule(read('data.js'))
const v1 = wrapVariant(read('variant-studio.js'), 'VariantStudio')
const v2 = wrapVariant(read('variant-wizard.js'), 'VariantWizard')
const v3 = wrapVariant(read('variant-companion.js'), 'VariantCompanion')

const html = read('index.html')

// pull the harness <style> block out of index.html so we can inline it
const harnessStyleMatch = html.match(/<style>([\s\S]*?)<\/style>/)
const harnessStyle = harnessStyleMatch ? harnessStyleMatch[1] : ''

// read the picker wiring out of index.html's module script, minus the imports
const moduleMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/)
if (!moduleMatch) throw new Error('module script not found in index.html')
let wiring = moduleMatch[1]
  .replace(/^\s*import\s+[^\n]*\n/gm, '')
  .replace(/\bconst variants = \[[^\]]*\]/, 'const variants = [VariantStudio.mount, VariantWizard.mount, VariantCompanion.mount]')

const out = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Costudy · UI 原型（三方向对比）</title>
<style>
${css}
</style>
<style>
${harnessStyle}
</style>
</head>
<body>
<div id="stage"></div>
<div id="toasts" aria-live="polite"></div>

<nav class="proto-picker" aria-label="Prototype variants">
  <span class="proto-picker-highlight" aria-hidden="true"></span>
  <button class="proto-picker-item" data-active aria-current="true">Studio</button>
  <button class="proto-picker-item">Wizard</button>
  <button class="proto-picker-item">Companion</button>
  <span class="proto-picker-divider" aria-hidden="true"></span>
  <button class="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)">↻</button>
</nav>

<script>
(function () {
'use strict';

/* ---------- shared: components ---------- */
${ui}

/* ---------- shared: data ---------- */
${data}

/* ---------- variant 1: Studio ---------- */
${v1}

/* ---------- variant 2: Wizard ---------- */
${v2}

/* ---------- variant 3: Companion ---------- */
${v3}

/* ---------- harness wiring (from index.html) ---------- */
${wiring}

})();
</script>
</body>
</html>
`

fs.writeFileSync(OUT, out, 'utf8')
const kb = Math.round(out.length / 1024)
console.log('[BUILD] wrote ' + OUT + '  (' + kb + ' KB)')

// sanity assertions: no module syntax may survive
const checks = [
  ['no type="module"', !/type="module"/.test(out)],
  ['no import statements', !/\bimport\s/.test(out)],
  ['no export keywords', !/\bexport\s/.test(out)],
  ['no relative module specifiers', !/from\s+['"]\.\//.test(out)],
  ['has VariantStudio', out.includes('VariantStudio')],
  ['has picker', out.includes('proto-picker-highlight')],
]
let bad = 0
for (const [label, ok] of checks) {
  console.log('  ' + (ok ? 'OK  ' : 'FAIL') + ' ' + label)
  if (!ok) bad++
}
process.exit(bad ? 1 : 0)
