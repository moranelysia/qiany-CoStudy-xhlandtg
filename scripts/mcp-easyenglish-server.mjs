/**
 * MCP 服务：英语练习（Easy English Tool）。
 *
 * 【它不做什么】
 *   它**不生成题目内容** —— 那是模型的活。一个本地服务硬凑语法题只会输出
 *   课本腔的烂题。这里只做模型做不好、或做了会出错的部分：
 *
 *     1. check_answer  —— 判分。大小写、标点、缩写（don't / do not）都该算对，
 *                         模型自己比字符串经常会误判
 *     2. irregular_verb —— 不规则动词表。这是查表，不是推理，模型容易记错
 *     3. build_quiz     —— 把模型给的题排成试卷，并把答案统一放到末尾
 *
 * 【发音怎么办】
 *   不在这里做。应用本身会把每条回复念出来（主进程 TTS），
 *   所以只要回复里是英文句子，就已经被朗读了 —— 服务再调一次 TTS 是重复。
 */
import process from 'node:process'

/** 常见不规则动词（原型 → 过去式 / 过去分词） */
const IRREGULAR = {
  be: ['was/were', 'been'],
  become: ['became', 'become'],
  begin: ['began', 'begun'],
  break: ['broke', 'broken'],
  bring: ['brought', 'brought'],
  build: ['built', 'built'],
  buy: ['bought', 'bought'],
  catch: ['caught', 'caught'],
  choose: ['chose', 'chosen'],
  come: ['came', 'come'],
  do: ['did', 'done'],
  draw: ['drew', 'drawn'],
  drink: ['drank', 'drunk'],
  drive: ['drove', 'driven'],
  eat: ['ate', 'eaten'],
  fall: ['fell', 'fallen'],
  feel: ['felt', 'felt'],
  find: ['found', 'found'],
  fly: ['flew', 'flown'],
  forget: ['forgot', 'forgotten'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['went', 'gone'],
  grow: ['grew', 'grown'],
  have: ['had', 'had'],
  hear: ['heard', 'heard'],
  keep: ['kept', 'kept'],
  know: ['knew', 'known'],
  leave: ['left', 'left'],
  lend: ['lent', 'lent'],
  lose: ['lost', 'lost'],
  make: ['made', 'made'],
  meet: ['met', 'met'],
  pay: ['paid', 'paid'],
  put: ['put', 'put'],
  read: ['read', 'read'],
  ride: ['rode', 'ridden'],
  ring: ['rang', 'rung'],
  run: ['ran', 'run'],
  say: ['said', 'said'],
  see: ['saw', 'seen'],
  sell: ['sold', 'sold'],
  send: ['sent', 'sent'],
  sing: ['sang', 'sung'],
  sit: ['sat', 'sat'],
  sleep: ['slept', 'slept'],
  speak: ['spoke', 'spoken'],
  spend: ['spent', 'spent'],
  stand: ['stood', 'stood'],
  swim: ['swam', 'swum'],
  take: ['took', 'taken'],
  teach: ['taught', 'taught'],
  tell: ['told', 'told'],
  think: ['thought', 'thought'],
  throw: ['threw', 'thrown'],
  understand: ['understood', 'understood'],
  wake: ['woke', 'woken'],
  wear: ['wore', 'worn'],
  win: ['won', 'won'],
  write: ['wrote', 'written'],
}

/**
 * 判分归一化。
 * 学生写 "Do not" 和 "don't" 都对；句末标点、多余空格、大小写都不该扣分。
 */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[.,!?;:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function expandContractions(text) {
  return text
    .replace(/\bdon't\b/g, 'do not')
    .replace(/\bdoesn't\b/g, 'does not')
    .replace(/\bdidn't\b/g, 'did not')
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bisn't\b/g, 'is not')
    .replace(/\baren't\b/g, 'are not')
    .replace(/\bwasn't\b/g, 'was not')
    .replace(/\bweren't\b/g, 'were not')
    .replace(/\bhaven't\b/g, 'have not')
    .replace(/\bhasn't\b/g, 'has not')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/\bit's\b/g, 'it is')
    .replace(/\bthey're\b/g, 'they are')
    .replace(/\bwe're\b/g, 'we are')
    // 学生常忘写撇号：doesnt / dont / didnt 这些也算对
    .replace(/\bdoesnt\b/g, 'does not')
    .replace(/\bdont\b/g, 'do not')
    .replace(/\bdidnt\b/g, 'did not')
    .replace(/\bcant\b/g, 'cannot')
    .replace(/\bwont\b/g, 'will not')
    .replace(/\bisnt\b/g, 'is not')
    .replace(/\barent\b/g, 'are not')
    .replace(/\bwasnt\b/g, 'was not')
    .replace(/\bwerent\b/g, 'were not')
    .replace(/\bhavent\b/g, 'have not')
    .replace(/\bhasnt\b/g, 'has not')
}

/** 逐词差异，给出"哪里不一样"的提示 */
function diffHint(expected, actual) {
  const a = expected.split(' ')
  const b = actual.split(' ')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? '') !== (b[i] ?? '')) {
      return '第 ' + (i + 1) + ' 个词应为「' + (a[i] ?? '（缺词）') + '」，你写的是「' + (b[i] ?? '（缺词）') + '」'
    }
  }
  return '整体接近，但写法不同'
}

function checkAnswer({ expected, answer }) {
  // 顺序很重要：先展开缩写再清标点。
  // 反过来做的话 "doesn't" 会先被切成 "doesn t"，缩写就再也匹配不上了。
  const prep = (v) => normalize(expandContractions(String(v ?? '').toLowerCase()))
  const e = prep(expected)
  const a = prep(answer)
  if (!a) return { correct: false, text: '还没作答' }
  if (e === a) return { correct: true, text: '对，这句没问题。' }
  // 允许"多写了冠词/少写了冠词"这类小差异时给提示而不是直接判错
  return { correct: false, text: '还差一点：' + diffHint(e, a) }
}

function irregularVerb({ verb }) {
  const key = String(verb ?? '').toLowerCase().trim()
  const hit = IRREGULAR[key]
  if (!hit) return { found: false, text: '「' + key + '」不在不规则动词表里，可能是规则动词（加 -ed），也可能是表里没收录。' }
  return { found: true, text: key + ' — ' + hit[0] + ' — ' + hit[1] }
}

function buildQuiz({ items, title }) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) throw new Error('items 不能为空')
  const head = title ? '## ' + String(title) : '## 小测'
  const body = list
    .map((it, i) => {
      const q = String(it?.question ?? '').trim()
      const opts = Array.isArray(it?.options) ? it.options : []
      const qLine = (i + 1) + '. ' + q
      if (!opts.length) return qLine + '\n   答：______'
      return qLine + '\n' + opts.map((o, k) => '   ' + 'ABCD'[k] + '. ' + String(o)).join('\n')
    })
    .join('\n\n')
  const answers = list
    .map((it, i) => (i + 1) + '. ' + String(it?.answer ?? '').trim() + (it?.explanation ? '　— ' + String(it.explanation) : ''))
    .join('\n')
  return head + '\n\n' + body + '\n\n<details><summary>答案</summary>\n\n' + answers + '\n\n</details>'
}

const TOOLS = [
  {
    name: 'check_answer',
    description:
      '判英语题对错。大小写、标点、缩写（don not / don\'t）都算对，会指出第几个词不一致。给 expected（标准答案）和 answer（学生写的）。',
    inputSchema: {
      type: 'object',
      properties: {
        expected: { type: 'string', description: '标准答案' },
        answer: { type: 'string', description: '学生写的答案' },
      },
      required: ['expected', 'answer'],
    },
  },
  {
    name: 'irregular_verb',
    description: '查不规则动词的三态（原型 — 过去式 — 过去分词）。别凭记忆答，查表更准。',
    inputSchema: {
      type: 'object',
      properties: { verb: { type: 'string', description: '动词原型，例如 go' } },
      required: ['verb'],
    },
  },
  {
    name: 'build_quiz',
    description: '把若干道题排成一份小测，答案统一折叠在末尾。题目内容由你提供。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '小测标题' },
        items: {
          type: 'array',
          description: '题目列表，每项 {question, options?, answer, explanation?}',
          items: { type: 'object' },
        },
      },
      required: ['items'],
    },
  },
]

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}
function fail(id, message, code = -32603) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let i = buffer.indexOf('\n')
  while (i >= 0) {
    const line = buffer.slice(0, i).trim()
    buffer = buffer.slice(i + 1)
    if (line) handle(line)
    i = buffer.indexOf('\n')
  }
})

function handle(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const { id, method } = msg
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mcp-easy-english', version: '0.1.0' },
    })
    return
  }
  if (method === 'notifications/initialized') return
  if (method === 'tools/list') {
    reply(id, { tools: TOOLS })
    return
  }
  if (method === 'tools/call') {
    const name = msg.params?.name
    const args = msg.params?.arguments ?? {}
    try {
      if (name === 'check_answer') {
        const r = checkAnswer(args)
        reply(id, { content: [{ type: 'text', text: r.text }], isError: !r.correct })
        return
      }
      if (name === 'irregular_verb') {
        const r = irregularVerb(args)
        reply(id, { content: [{ type: 'text', text: r.text }] })
        return
      }
      if (name === 'build_quiz') {
        reply(id, { content: [{ type: 'text', text: buildQuiz(args) }] })
        return
      }
      fail(id, '没有这个工具：' + String(name), -32601)
    } catch (err) {
      fail(id, err && err.message ? err.message : String(err))
    }
    return
  }
  fail(id, '不认识的方法：' + String(method), -32601)
}
