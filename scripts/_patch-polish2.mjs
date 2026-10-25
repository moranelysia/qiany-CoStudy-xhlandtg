// 接线 polish.ts -> index.ts（只用字符串拼接，避免嵌套模板字面量）
import fs from 'node:fs'

const p = 'C:/costudy/src/main/index.ts'
let s = fs.readFileSync(p, 'utf8')
const report = []

if (!s.includes("from './polish'")) {
  s = s.replace(
    "import { clearKey, describeSettings, encryptionStatus, resolveLlmConfig, saveSettings } from './settings'",
    "import { clearKey, describeSettings, encryptionStatus, resolveLlmConfig, saveSettings } from './settings'\nimport { polishPrompt } from './polish'",
  )
  report.push('1) import polishPrompt')
}

if (!s.includes('card:polish')) {
  const ipc = [
    '/* ---------- M1-1：AI 收尾提示词 ---------- */',
    '// 只产出 systemPrompt 文本，不写盘；是否采用由渲染层的「采用」按钮决定',
    "ipcMain.handle('card:polish', async () => {",
    '  const card = cards.activeCard(config.cardPath)',
    '  const result = await polishPrompt(freshClient(), card, config.stage)',
    '  return { ...result, client: describeClient(llm) }',
    '})',
    '',
  ].join('\n')
  const marker = s.match(/\/\* -+ 启动 -+ \*\//)
  if (marker) {
    s = s.replace(marker[0], ipc + marker[0])
    report.push('2) card:polish IPC')
  }
}

if (!s.includes('isPolishTest')) {
  s = s.replace(
    "const isX1 = process.argv.includes('--x1')",
    "const isX1 = process.argv.includes('--x1')\nconst isPolishTest = process.argv.includes('--polishtest')",
  )
  const branch = [
    'if (isPolishTest) {',
    '  app.whenReady().then(async () => {',
    '    const card = cards.activeCard(config.cardPath)',
    '    const result = await polishPrompt(freshClient(), card, config.stage)',
    "    console.log('[POLISH] ' + JSON.stringify(result, null, 1))",
    '    app.exit(result.ok ? 0 : 1)',
    '  })',
    '} else if (isX1) {',
  ].join('\n')
  s = s.replace('if (isX1) {', branch)
  report.push('3) --polishtest 分支')
}

fs.writeFileSync(p, s, 'utf8')
console.log(report.join('\n'))
