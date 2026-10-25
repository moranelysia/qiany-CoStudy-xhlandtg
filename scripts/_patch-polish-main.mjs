// M1-1：AI 收尾提示词
//   主进程：card:polish（把当前卡 + 12 维 + 教学取向 汇总，让模型写最终 system prompt）
//   渲染层：footer 加按钮 + diff 面板（左：现有 右：AI 版），可「采用」
import fs from 'node:fs'

const ROOT = 'C:/costudy'
const read = (p) => fs.readFileSync(`${ROOT}/${p}`, 'utf8')
const write = (p, s) => fs.writeFileSync(`${ROOT}/${p}`, s, 'utf8')
const report = []

/* ---------- 1) 主进程：抽一个函数 + IPC ---------- */
{
  const p = 'src/main/index.ts'
  let s = read(p)

  if (!s.includes('async function polishPrompt')) {
    const fn = `/* ---------- M1-1：AI 收尾提示词 ---------- */
/**
 * 把当前角色卡的设定（身份/性格/dims/教学取向/守则）汇总成一段描述，
 * 让模型写出**最终可用的 system prompt 文本**。
 *
 * 为什么不让模型"顺便"改卡片：这一层的职责是措辞与结构，
 * 不是重新设计角色。只替换 systemPrompt 字段，其它一律不动。
 */
async function polishPrompt(): Promise<{ ok: boolean; text?: string; ms?: number; client?: string; error?: string }> {
  const started = Date.now()
  const card = cards.activeCard(config.cardPath)
  const dims = Object.entries(card.dims ?? {})
    .filter(([, v]) => typeof v === 'number' && v !== 50)
    .map(([k, v]) => `${k}=${v}`)
    .join(' / ')

  const brief = [
    '角色名：' + card.name,
    '称呼学习者：' + card.cosplay.address,
    '性格：' + (card.personality || '（未填）'),
    '来历：' + (card.description || '（未填）'),
    '情境：' + (card.scenario || '（未填）'),
    '说话风格：' + (card.cosplay.style || '（未填）'),
    '伴学守则：' + (card.cosplay.rules || '（未填）'),
    '在场的样子：' + (card.cosplay.behavior || '（未填）'),
    '性格维度（非中性项）：' + (dims || '（全中性）'),
    '学段：' + config.stage,
  ].join('\\n')

  try {
    const client = freshClient()
    const text = await client.complete(
      [
        {
          role: 'system',
          content: [
            '你在为一个「伴学角色」写系统提示词（system prompt）。',
            '输出要求：',
            '1. 直接输出提示词正文，不要解释、不要 markdown 代码块、不要前后客套。',
            '2. 结构固定为四段，用【】小标题：你是谁 / 怎么讲 / 怎么纠错 / 边界。',
            '3. 「怎么讲」要具体到节奏与措辞习惯（先问还是先讲、句子长短、举例偏好）。',
            '4. 「边界」里必须包含：不与学习者建立依赖、不索取个人信息、不做心理诊断、遇到不适内容平静转回学习。',
            '5. 不写"你会尽量"这类空话，写成可执行的行为要求。',
            '6. 全文 400–700 字，中文。',
          ].join('\\n'),
        },
        { role: 'user', content: '角色设定如下：\\n\\n' + brief + '\\n\\n请写出系统提示词。' },
      ],
      // 推理模型：推理 + 正文都要预算
      { maxTokens: 2000, temperature: 0.4 },
    )
    return { ok: true, text: text.trim(), ms: Date.now() - started, client: describeClient(client) }
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: (err as Error).message }
  }
}

`
    const marker = s.match(/\/\* -+ 启动 -+ \*\//)
    if (marker) {
      s = s.replace(marker[0], fn + marker[0])
      report.push('1a) polishPrompt() 已加')
    }

    // IPC + 测试模式
    const ipc = `ipcMain.handle('card:polish', () => polishPrompt())

`
    s = s.replace(marker ? marker[0] : '/* ---------- 启动 ---------- */', ipc + (marker ? marker[0] : ''))

    // --polishtest：真实跑一次（不经过渲染层）
    s = s.replace(
      "const isX1 = process.argv.includes('--x1')",
      "const isX1 = process.argv.includes('--x1')\nconst isPolishTest = process.argv.includes('--polishtest')",
    )
    s = s.replace(
      'if (isX1) {',
      `if (isPolishTest) {
  app.whenReady().then(async () => {
    const r = await polishPrompt()
    console.log('[POLISH] ' + JSON.stringify(r, null, 1))
    app.exit(r.ok ? 0 : 1)
  })
} else if (isX1) {`,
    )
    report.push('1b) IPC + --polishtest 已加')
  } else {
    report.push('1) 已存在，跳过')
  }

  write(p, s)
}

/* ---------- 2) preload + 类型 ---------- */
{
  const p = 'src/preload/index.ts'
  let s = read(p)
  if (!s.includes('polishPrompt')) {
    s = s.replace(
      '  /** 模型设置（不含密钥明文） */',
      `  /** M1-1：让模型把当前设定写成最终 system prompt */
  cardPolish: (): Promise<{ ok: boolean; text?: string; ms?: number; client?: string; error?: string }> =>
    ipcRenderer.invoke('card:polish'),

  /** 模型设置（不含密钥明文） */`,
    )
    report.push('2a) preload 已加 cardPolish')
  }
  write(p, s)

  const q = 'src/renderer/src/env.d.ts'
  let t = read(q)
  if (!t.includes('cardPolish')) {
    t = t.replace(
      '      /** 模型设置（不含密钥明文） */',
      `      /** M1-1：让模型把当前设定写成最终 system prompt */
      cardPolish: () => Promise<{
        ok: boolean
        text?: string
        ms?: number
        client?: string
        error?: string
      }>

      /** 模型设置（不含密钥明文） */`,
    )
    report.push('2b) env.d.ts 已补类型')
  }
  write(q, t)
}

console.log(report.join('\n'))
