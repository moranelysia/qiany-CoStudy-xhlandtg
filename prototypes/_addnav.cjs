// Insert the translucent nav bar into each variant.
// Lines are stored in arrays and joined, so backticks inside the strings are safe.
const fs = require('node:fs')
const path = require('node:path')
const DIR = path.join(__dirname, 'costudy-ui')
const BT = '`' // backtick

function patch(file, from, to, label) {
  const p = path.join(DIR, file)
  const src = fs.readFileSync(p, 'utf8')
  if (!src.includes(from)) {
    console.log('  MISS ' + file + ' :: ' + label)
    return false
  }
  fs.writeFileSync(p, src.replace(from, to), 'utf8')
  console.log('  OK   ' + file + ' :: ' + label)
  return true
}

function navBlock(vars, extraButtons) {
  return [
    '  <div class="nav">',
    '    <div class="nav-inner">',
    '      <span class="avatar" style="--sz:26px">' + vars.emoji + '</span>',
    '      <span class="nav-title">' + vars.title + '</span>',
    '      <span class="nav-sub">' + vars.sub + '</span>',
    '      <span class="nav-spacer"></span>',
    ...extraButtons.map((b) => '      ' + b),
    '    </div>',
    '  </div>',
  ].join('\n')
}

// ---------- Studio editor ----------
{
  const from = '  root.innerHTML = ' + BT + '\n  <div class="app v-studio">'
  const to =
    '  root.innerHTML = ' + BT + '\n' +
    navBlock(
      { emoji: '${state.emoji}', title: '${esc(state.name)}', sub: '性格 12 维 · 实时编译' },
      ['<button class="btn sm" data-ai>AI 帮我写</button>', '<button class="btn sm primary" data-save>保存</button>']
    ) +
    '\n  <div class="app v-studio">'
  patch('variant-studio.js', from, to, 'editor nav')
}

// ---------- Studio learn ----------
{
  const from = '  root.innerHTML = ' + BT + '\n  <div class="app v-studio" style="grid-template-columns: minmax(0,1fr) 372px">'
  const to =
    '  root.innerHTML = ' + BT + '\n' +
    navBlock(
      { emoji: '${state.emoji}', title: '${esc(LESSON.course)}', sub: '${esc(state.name)} · 今天第 2 次会话' },
      ['<button class="btn sm" data-back>改角色</button>']
    ) +
    '\n  <div class="app v-studio" style="grid-template-columns: minmax(0,1fr) 372px">'
  patch('variant-studio.js', from, to, 'learn nav')
}

// ---------- Wizard ----------
{
  const from =
    '  root.innerHTML = ' + BT + '\n  <div class="app v-wiz">\n    <aside class="steps">\n      ${renderSteps()}\n      <button class="btn ghost" style="margin-top:14px;height:28px;font-size:12px" data-preview-learn>预览学习界面 →</button>'
  const to =
    '  root.innerHTML = ' + BT + '\n' +
    navBlock(
      { emoji: '${state.emoji}', title: '新建角色', sub: '第 ${step + 1} / 4 步' },
      ['<button class="btn sm" data-preview-learn>预览学习界面</button>']
    ) +
    '\n  <div class="app v-wiz">\n    <aside class="steps">\n      ${renderSteps()}\n      <button class="btn ghost sm" style="margin-top:14px" data-preview-learn>预览学习界面 →</button>'
  patch('variant-wizard.js', from, to, 'wizard nav')
}

// ---------- Companion ----------
{
  const from = '  root.innerHTML = ' + BT + '\n  <div class="app v-comp">\n    <main class="chat-pane card">'
  const to =
    '  root.innerHTML = ' + BT + '\n' +
    navBlock(
      { emoji: '✦', title: '创建角色', sub: '四个问题，我帮你写卡' },
      ['<button class="btn sm" data-restart>重新聊</button>']
    ) +
    '\n  <div class="app v-comp">\n    <main class="chat-pane card">'
  patch('variant-companion.js', from, to, 'companion nav')
}

// ---------- harness: reset scroll before capture ----------
const vp = path.join(__dirname, '_verify-standalone.cjs')
let v = fs.readFileSync(vp, 'utf8')
if (!v.includes('scrollTo')) {
  v = v.replace(
    '    await new Promise((r) => setTimeout(r, 800))',
    "    await win.webContents.executeJavaScript('window.scrollTo(0,0)')\n    await new Promise((r) => setTimeout(r, 800))"
  )
  v = v.replace(
    '    const h = await win.webContents.executeJavaScript(' + BT + 'Math.max(document.documentElement.scrollHeight, 900)' + BT + ')',
    "    await win.webContents.executeJavaScript('window.scrollTo(0,0)')\n    const h = await win.webContents.executeJavaScript(" + BT + 'Math.max(document.documentElement.scrollHeight, 900)' + BT + ')'
  )
  fs.writeFileSync(vp, v, 'utf8')
  console.log('  OK   _verify-standalone.cjs (scroll reset)')
} else {
  console.log('  SKIP harness (already patched)')
}
console.log('done')
