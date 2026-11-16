/**
 * 伴学 CoStudy · Cloudflare Worker 代理
 * =====================================
 * 解决两件事：
 *   1. 跨域：浏览器直连模型接口会被 CORS 拦，这里加头转发。
 *   2. 密钥：把 key 放在 Worker 的环境变量里，前端（和看源码的人）都看不到。
 *
 * 部署（不用命令行，网页就能做）：
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. 把本文件内容整个粘进去，覆盖默认代码
 *   3. Settings → Variables and Secrets，加两个：
 *        UPSTREAM = https://api.deepseek.com      （明文变量）
 *        API_KEY  = sk-你的密钥                    （选 Secret / 加密）
 *   4. Deploy 后拿到地址，形如 https://xxx.你的子域.workers.dev
 *   5. 在站点里：设置 → 模型 → Base URL 填这个地址，API Key 留空
 *
 * 关于流式：这里用 upstream.body 原样透传，SSE 流式输出不会被截断。
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-requested-with',
  'access-control-max-age': '86400'
}

export default {
  async fetch(req, env) {
    // 预检
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(req.url)
    const upstream = String(env.UPSTREAM || 'https://api.deepseek.com').replace(/\/+$/, '')

    // 白名单：只转发这几种路径，避免变成万能代理被人拿去刷别的站
    const allowed = /^\/(chat\/completions|v1\/chat\/completions|models|v1\/models|user\/balance)$/
    if (!allowed.test(url.pathname)) {
      return json(404, { error: { message: 'path not allowed: ' + url.pathname } })
    }

    // 密钥：优先用请求头里带的（体验版用户自己填），没有再用 Worker 里存的
    const auth = req.headers.get('authorization') || (env.API_KEY ? 'Bearer ' + env.API_KEY : '')
    if (!auth) {
      return json(401, { error: { message: '没有密钥：请在设置里填 Key，或给 Worker 配置 API_KEY' } })
    }

    const init = {
      method: req.method,
      headers: {
        'content-type': req.headers.get('content-type') || 'application/json',
        authorization: auth,
        accept: req.headers.get('accept') || '*/*'
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await req.text()
    }

    let res
    try {
      res = await fetch(upstream + url.pathname, init)
    } catch (e) {
      return json(502, { error: { message: 'upstream fetch failed: ' + String(e) } })
    }

    // 原样透传（含 SSE 流），只补 CORS
    const headers = new Headers(res.headers)
    for (const k of Object.keys(CORS)) headers.set(k, CORS[k])
    headers.delete('content-encoding') // 让 Worker 自己处理压缩，避免长度不匹配
    return new Response(res.body, { status: res.status, headers })
  }
}

function json(code, obj) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: Object.assign({ 'content-type': 'application/json' }, CORS)
  })
}
