// X1 能力探测：用已保存的加密 key，真实打三次请求
//   1) 纯文本           —— 确认模型 id 可用
//   2) 图片输入         —— content 用 [{type:'image_url'}]，看是否支持
//   3) 联网搜索         —— 问需要最新信息的问题，看响应里有没有引用/搜索痕迹
// 输出只打印结论与报错原文，不打印密钥。
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT, '记忆')
const SETTINGS = path.join(DATA_DIR, '设置', '模型.json')

function readConfig() {
  const raw = JSON.parse(fs.readFileSync(SETTINGS, 'utf8').replace(/^\uFEFF/, ''))
  const apiKey = safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(Buffer.from(raw.key, 'base64'))
    : ''
  return { apiKey, baseUrl: raw.baseUrl, model: raw.model }
}

async function post(cfg, body) {
  const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.apiKey },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 保留原文 */ }
  return { status: res.status, json, text }
}

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

app.whenReady().then(async () => {
  const out = {}
  let cfg
  try {
    cfg = readConfig()
    out.config = { model: cfg.model, baseUrl: cfg.baseUrl, hasKey: Boolean(cfg.apiKey) }
  } catch (e) {
    console.log(JSON.stringify({ fatal: '读不到设置：' + e.message }))
    app.exit(0)
    return
  }

  // 1) 纯文本
  try {
    const r = await post(cfg, {
      model: cfg.model,
      messages: [{ role: 'user', content: '只回两个字：在的' }],
      max_tokens: 8,
      temperature: 0,
    })
    out.text = r.status === 200
      ? { ok: true, reply: (r.json.choices?.[0]?.message?.content ?? '').slice(0, 20) }
      : { ok: false, status: r.status, error: r.text.slice(0, 200) }
  } catch (e) {
    out.text = { ok: false, error: e.message }
  }

  // 2) 图片输入
  try {
    const r = await post(cfg, {
      model: cfg.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '这张图是什么颜色？只回颜色。' },
            { type: 'image_url', image_url: { url: PIXEL } },
          ],
        },
      ],
      max_tokens: 16,
      temperature: 0,
    })
    out.image = r.status === 200
      ? { ok: true, reply: (r.json.choices?.[0]?.message?.content ?? '').slice(0, 30) }
      : { ok: false, status: r.status, error: r.text.slice(0, 220) }
  } catch (e) {
    out.image = { ok: false, error: e.message }
  }

  // 3) 联网搜索：先看响应里有没有引用字段
  try {
    const r = await post(cfg, {
      model: cfg.model,
      messages: [{ role: 'user', content: '用一句话说出今天热门的一个网络角色/梗，并给出来源网址。' }],
      max_tokens: 120,
      temperature: 0,
    })
    if (r.status !== 200) {
      out.search = { ok: false, status: r.status, error: r.text.slice(0, 220) }
    } else {
      const msg = r.json.choices?.[0]?.message ?? {}
      const reply = (msg.content ?? '').slice(0, 160)
      const hasUrl = /https?:\/\//.test(reply)
      const metaKeys = Object.keys(r.json).filter((k) => !['id', 'object', 'created', 'model', 'choices', 'usage'].includes(k))
      out.search = {
        ok: true,
        reply,
        replyHasUrl: hasUrl,
        citationsField: Boolean(msg.annotations || msg.citations || r.json.citations),
        extraTopLevelKeys: metaKeys,
      }
    }
  } catch (e) {
    out.search = { ok: false, error: e.message }
  }

  console.log(JSON.stringify(out, null, 1))
  app.exit(0)
})
