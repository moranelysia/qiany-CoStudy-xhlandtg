/**
 * 学习会话状态机（阶段 4.2）。
 *
 * 【为什么需要它】
 *   参考版的学习模式只有一段提示词，模型每次自己决定"现在该干嘛"。
 *   结果就是：有时一上来就讲答案，有时问了三轮还不讲，有时讲完不检验。
 *   这不是模型笨，是**没告诉它现在在哪一步**。
 *
 *   把会话拆成七个阶段，每轮只把"当前阶段该做什么"喂给它：
 *     开场 → 目标确认 → 学情探测 → 知识点拆解 → 逐点教学 → 阶段检验 → 收尾
 *
 * 【为什么状态机在程序里，不在提示词里】
 *   如果让模型自己记"我们在第几步"，它会漂：聊两句就忘了自己在探测阶段，
 *   或者学生一插话就跳到收尾。状态由程序持有，模型只负责"这一步的活"。
 *   可审计、可复现、可以在界面上显示进度。
 *
 * 【为什么允许回退】
 *   真实学习不是单向流水线：讲完一个点发现前面没懂，必须能回到"逐点教学"。
 *   所以转移表里允许 teach → probe（重新探测）和 check → teach（补讲）。
 *   只禁止"跳步"（探测没做完就收尾）。
 */
import fs from 'node:fs'
import path from 'node:path'

export const PHASES = [
  'opening',
  'goal',
  'probe',
  'breakdown',
  'teach',
  'check',
  'wrap',
] as const

export type Phase = (typeof PHASES)[number]

export const PHASE_LABEL: Record<Phase, string> = {
  opening: '开场',
  goal: '目标确认',
  probe: '学情探测',
  breakdown: '知识点拆解',
  teach: '逐点教学',
  check: '阶段检验',
  wrap: '收尾',
}

export interface KnowledgePoint {
  name: string
  /** 0-1，讲解后被验证过的程度 */
  mastery: number
  /** 是否已讲过 */
  taught: boolean
}

export interface SessionState {
  id: string
  /** 学习目标（一句话） */
  goal: string
  /** 学段，来自配置 */
  stage: string
  phase: Phase
  /** 拆出来的知识点 */
  points: KnowledgePoint[]
  /** 当前在讲第几个 */
  activeIndex: number
  /** 已确认的薄弱点（探测阶段的产出） */
  weaknesses: string[]
  startedAt: string
  updatedAt: string
  /** 阶段推进的痕迹，用于复盘 */
  trail: Array<{ phase: Phase; at: string; note?: string }>
  /** 上一道检验题的原文（判题与复盘都要用；只有 check 阶段会写） */
  lastQuestion?: string
  /** 最近一次检验的结论，和题目绑在一起存，避免只留一个孤零零的分数 */
  lastCheck?: {
    question: string
    point: string
    verdict: 'correct' | 'wrong' | 'unclear' | null
    at: string
  }
  /** 上一轮模型实际给出的标记种类（用于"该给的没给"的提醒） */
  lastMarkerKinds?: string[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5)
}

export function createSession(stage: string): SessionState {
  const at = nowIso()
  return {
    id: newId(),
    goal: '',
    stage,
    phase: 'opening',
    points: [],
    activeIndex: 0,
    weaknesses: [],
    startedAt: at,
    updatedAt: at,
    trail: [{ phase: 'opening', at }],
  }
}

/**
 * 允许的转移。键是当前阶段，值是可以去的阶段。
 * 有意的取舍：
 *   · 任何阶段都能直接进 wrap（学生说"今天先到这"，不能卡着他）
 *   · teach ↔ probe / check 可回退（没懂就回去重探）
 *   · 不允许 opening 直接到 teach（没确认目标就开讲）
 */
const TRANSITIONS: Record<Phase, Phase[]> = {
  opening: ['goal', 'wrap'],
  goal: ['probe', 'breakdown', 'wrap'],
  probe: ['breakdown', 'goal', 'wrap'],
  breakdown: ['teach', 'probe', 'wrap'],
  teach: ['check', 'breakdown', 'probe', 'wrap'],
  check: ['teach', 'breakdown', 'wrap'],
  wrap: ['goal'],
}

export function canMove(from: Phase, to: Phase): boolean {
  return TRANSITIONS[from].includes(to)
}

export interface MoveResult {
  ok: boolean
  state: SessionState
  error?: string
}

/** 推进阶段。非法转移不抛异常，返回原因 —— 调用方多半是模型，抛异常没法处理。 */
export function moveTo(state: SessionState, to: Phase, note?: string): MoveResult {
  if (!canMove(state.phase, to)) {
    return {
      ok: false,
      state,
      error: `不能从「${PHASE_LABEL[state.phase]}」直接到「${PHASE_LABEL[to]}」`,
    }
  }
  const at = nowIso()
  const next: SessionState = {
    ...state,
    phase: to,
    updatedAt: at,
    trail: [...state.trail, { phase: to, at, note }],
  }
  return { ok: true, state: next }
}

/** 设置目标。空目标不接受 —— 没有目标的学习会话就是聊天。 */
/** 追加一个知识点（拆解阶段多次调用；同名不重复） */
export function addSessionPoint(state: SessionState, name: string): SessionState {
  const trimmed = name.trim().slice(0, 40)
  if (!trimmed) return state
  if (state.points.some((p) => p.name === trimmed)) return state
  return {
    ...state,
    points: [...state.points, { name: trimmed, mastery: 0, taught: false }],
    updatedAt: nowIso(),
  }
}

/**
 * 由程序决定"下一步该去哪"（第二阶段的核心）。
 *
 * 原则：模型只负责产出结构化事件（目标 / 薄弱点 / 知识点 / 讲完），
 * 是否推进、推进到哪一步，全由这里根据状态判断 —— 不让模型自己说"我们进入下一步"。
 * 条件不满足就返回 null，停在原阶段，绝不会跳步。
 */
export function decideNextPhase(state: SessionState): Phase | null {
  switch (state.phase) {
    // 开场白说完就进目标确认（不需要等模型给什么）
    case 'opening':
      return 'goal'
    // 目标已由模型用 [目标: …] 记录
    case 'goal':
      return state.goal ? 'probe' : null
    // 探测出至少一个薄弱点才继续
    case 'probe':
      return state.weaknesses.length > 0 ? 'breakdown' : null
    // 拆出至少一个知识点才开讲
    case 'breakdown':
      return state.points.length > 0 ? 'teach' : null
    // 所有点都讲过才进检验
    case 'teach':
      return state.points.length > 0 && state.points.every((p) => p.taught) ? 'check' : null
    // 检验：答对就往下（还有没讲的点就回教学，否则收尾）；答错回教学补讲
    case 'check': {
      const verdict = state.lastCheck?.verdict
      if (verdict === 'correct') {
        const hasMore = state.points.some((p) => !p.taught)
        return hasMore ? 'teach' : 'wrap'
      }
      if (verdict === 'wrong') return 'teach'
      return null
    }
    default:
      return null
  }
}

export function setGoal(state: SessionState, goal: string): SessionState {
  const trimmed = goal.trim()
  if (!trimmed) return state
  return { ...state, goal: trimmed, updatedAt: nowIso() }
}

/** 记录探测到的薄弱点 */
export function addWeakness(state: SessionState, text: string): SessionState {
  const trimmed = text.trim()
  if (!trimmed) return state
  return { ...state, weaknesses: [...state.weaknesses, trimmed], updatedAt: nowIso() }
}

/** 拆知识点（拆完进入 teach，activeIndex 归零） */
export function setPoints(state: SessionState, names: string[]): SessionState {
  const points = names
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) => ({ name, mastery: 0, taught: false }))
  return { ...state, points, activeIndex: 0, updatedAt: nowIso() }
}

/** 标记当前知识点讲完，并记录掌握度 */
export function markTaught(state: SessionState, mastery: number): SessionState {
  if (state.points.length === 0) return state
  const points = state.points.map((p, i) =>
    i === state.activeIndex
      ? { ...p, taught: true, mastery: Math.max(0, Math.min(1, mastery)) }
      : p,
  )
  return { ...state, points, updatedAt: nowIso() }
}

/** 下一个知识点；没有下一个就返回原状态（调用方据此进 check） */
export function nextPoint(state: SessionState): SessionState {
  const next = state.activeIndex + 1
  if (next >= state.points.length) return state
  return { ...state, activeIndex: next, updatedAt: nowIso() }
}

export function currentPoint(state: SessionState): KnowledgePoint | null {
  return state.points[state.activeIndex] ?? null
}

/**
 * 生成"现在这一步该做什么"的提示词片段。
 *
 * 这是整个状态机的产出：每轮只给模型**当前阶段**的行为要求，
 * 而不是把七步全塞给它（那样它自己挑一步，等于没约束）。
 */
/**
 * 每个阶段该让模型吐出什么结构化标记。
 *
 * 这是「程序管状态、模型管内容」的接口：模型只写事实，推不推进由 decideNextPhase 决定。
 * 标记会被 parseMemoryMarkers 抠掉，用户看不到。
 */
function markerHint(phase: Phase): string[] {
  const hints: Partial<Record<Phase, string>> = {
    goal: '本步确认完目标后，在回复最后单独一行输出：`[目标: 一句话说清今天要弄懂什么]`',
    probe: '每问到一处薄弱点，单独一行输出：`[薄弱点: 比如 极限概念不熟]`',
    breakdown: '拆出来的每个小点单独一行输出：`[知识点: 名称]`（3-7 条，不要写"理解函数"这种无法验证的）',
    teach: '讲完并确认一个知识点后，单独一行输出：`[讲完: 0.8]`（0-1 之间，你对掌握程度的估计）',
  }
  const hint = hints[phase]
  const toolNudge =
    phase === 'teach' || phase === 'check'
      ? ['', '（这一步如果能用图或跑代码来验证，优先调用工具，别只用文字描述。）']
      : []
  return hint
    ? ['', '【本步的标记】', hint, '（这些方括号标记不会显示给学生，程序读完就删。）', ...toolNudge]
    : toolNudge
}

/** 每个阶段需要模型吐的标记；null 表示这一步不需要标记 */
export function neededMarker(phase: Phase): 'goal' | 'weakness' | 'point' | 'taught' | null {
  switch (phase) {
    case 'goal':
      return 'goal'
    case 'probe':
      return 'weakness'
    case 'breakdown':
      return 'point'
    case 'teach':
      return 'taught'
    default:
      return null
  }
}

/**
 * 兜底目标：模型没给 `[目标:]` 时，用学生自己的话当目标。
 *
 * 只在"看起来像学习请求"时启用 —— 否则会把「今天星期几」记成学习目标。
 * 这是演示安全的兜底：模型不听话也不会卡死，但数据仍然来自学生原话，不是编的。
 */
const STUDY_HINT = /学|弄懂|搞懂|复习|预习|练习|作业|考试|题|掌握|理解|不会/

export function inferGoal(state: SessionState, userText: string): SessionState {
  if (state.phase !== 'goal' || state.goal) return state
  const text = userText.trim().replace(/\s+/g, ' ')
  if (text.length < 4 || !STUDY_HINT.test(text)) return state
  return setGoal(state, text.slice(0, 30))
}

/**
 * 「该给的标记没给」时，下一轮补一句提醒。
 * 只提醒格式，不替模型编内容 —— 猜出来的目标是假的，提醒出来的才是真的。
 */
export function markerReminder(state: SessionState): string {
  const need = neededMarker(state.phase)
  if (!need) return ''
  const got = state.lastMarkerKinds ?? []
  if (got.includes(need)) return ''
  const label: Record<string, string> = {
    goal: '[目标: …]',
    weakness: '[薄弱点: …]',
    point: '[知识点: …]',
    taught: '[讲完: …]',
  }
  return `（上一轮没有输出 ${label[need]}，这一步结束时请补上，否则流程会停在这里。）`
}

export function phaseGuide(state: SessionState, learner?: string): string {
  const head = [
    '===== 这一步：' + PHASE_LABEL[state.phase] + ' =====',
    '',
    `（会话进度：${PHASE_LABEL[state.phase]}${state.goal ? ' · 目标：' + state.goal : ''}）`,
    '',
  ]

  const body: Record<Phase, string[]> = {
    opening: [
      '开场。先打个招呼，然后用一句话说明你们要怎么学：',
      '先问清今天想弄懂什么，再探一下底，再拆开讲。',
      '**这一步不要讲知识点**，只负责把节奏定下来。',
    ],
    goal: [
      '确认目标。问清楚"今天想弄懂哪一块"。',
      '如果对方说得太笼统（"数学"），追问到**一道题或一个概念**的粒度。',
      '拿到目标后，用一句话复述确认：「所以今天是弄懂 X，对吗？」',
    ],
    probe: [
      '学情探测。**先别讲**，用两三个问题判断当前水平：',
      '「这个你学过吗」「这类题你做过吗」「上次做到哪一步卡住」。',
      '探测完把薄弱点说出来，让对方确认。',
    ],
    breakdown: [
      '拆知识点。把目标拆成 3-7 个**可验证的小点**，一条一行列出来。',
      '每条都要能被"讲一遍 + 出一道题"验证，不要写"理解函数"这种没法验证的。',
      '列完后问：「先从哪个开始？」',
    ],
    teach: [
      '逐点教学。当前这个点：先讲一小步，再问一句确认。',
      '对方没懂就**换说法**，别重复原话。讲完这一点再进下一个。',
      state.points.length
        ? `当前知识点：**${currentPoint(state)?.name ?? '（未设置）'}**（第 ${
            state.activeIndex + 1
          } / ${state.points.length} 个）`
        : '（还没有拆知识点，先回到拆解那一步）',
    ],
    check: [
      '阶段检验。出 1-2 道题验证刚才讲的点，**不要提示解法**。',
      '答对了就往下走；答错了回到"拐错的那一步"，别从头再讲一遍。',
    ],
    wrap: [
      '收尾。用三句话：今天弄懂了什么、哪里还不稳、下次先看什么。',
      '然后问对方要不要把不稳的那条记进错题本。',
      '**不要拖长**，说完就停。',
    ],
  }

  const tail = ['', '（只做这一步的事。做完了说一句"下一步我们…"，程序会推进阶段。）', '']

  // 画像只在"要决定从哪开始"的两步注入；讲课和检验阶段不需要，免得干扰模型
  const brief = (learner ?? '').trim()
  const learnerBlock =
    brief && (state.phase === 'probe' || state.phase === 'breakdown')
      ? [
          '',
          '【这个学生的历史情况（程序统计，优先于你的印象）】',
          brief,
          state.phase === 'probe'
            ? '探测时优先验证这几条；已经稳的点不用重复测。'
            : '拆知识点时把薄弱项排在前面；稳的点可以快速带过。',
          '',
        ]
      : []

  const base = [...head, ...body[state.phase], ...learnerBlock, ...markerHint(state.phase), ...tail].join('\n')
  const reminder = markerReminder(state)
  return reminder ? base + '\n' + reminder + '\n' : base
}

/** 一行摘要（界面显示 / 日志） */
export function sessionSummary(state: SessionState): string {
  const done = state.points.filter((p) => p.taught).length
  const progress = state.points.length ? ` ${done}/${state.points.length}` : ''
  return `${PHASE_LABEL[state.phase]}${progress}${state.goal ? ' · ' + state.goal : ''}`
}

/* ---------- 持久化 ---------- */

/**
 * 从磁盘载入完整会话状态。
 *
 * 为什么要这个函数：消息存在 `会话/<id>.jsonl`，完整状态存在 `会话/<id>.json`，
 * 而索引 `索引.json` 里只有 phase / point 这类摘要。以前每轮对话都用索引
 * 临时拼一个空壳状态，于是 points / weaknesses / trail 每轮归零。
 * 这里统一从磁盘读；文件缺失或字段不全时用索引兜底，老版本数据照样能打开。
 */
export function loadSessionState(
  dataDir: string,
  meta: { id: string; phase: Phase; createdAt: string; updatedAt: string },
  stage: string,
): SessionState {
  const saved = loadSession(dataDir, meta.id)
  const base = saved ?? createSession(stage)
  return {
    ...base,
    id: meta.id,
    stage: base.stage || stage,
    // 索引是界面上显示的那一份，推进时两边一起写，所以以它为准
    phase: meta.phase ?? base.phase,
    startedAt: base.startedAt || meta.createdAt,
    updatedAt: base.updatedAt || meta.updatedAt,
    points: Array.isArray(base.points) ? base.points : [],
    weaknesses: Array.isArray(base.weaknesses) ? base.weaknesses : [],
    trail: Array.isArray(base.trail) ? base.trail : [],
  }
}

/** 记录一次检验：题目、知识点、结论绑在一起存，复盘时能还原「哪道题判错了」 */
export function recordCheck(
  state: SessionState,
  input: { question: string; point: string; verdict: 'correct' | 'wrong' | 'unclear' | null },
): SessionState {
  const at = nowIso()
  const question = input.question.trim().slice(0, 600)
  return {
    ...state,
    lastQuestion: question,
    lastCheck: { question, point: input.point, verdict: input.verdict, at },
    updatedAt: at,
  }
}

export function sessionDir(dataDir: string): string {
  return path.join(dataDir, '会话')
}

export function saveSession(dataDir: string, state: SessionState): void {
  const dir = sessionDir(dataDir)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, state.id + '.json'), JSON.stringify(state, null, 2) + '\n', 'utf8')
}

export function loadSession(dataDir: string, id: string): SessionState | null {
  try {
    const raw = fs.readFileSync(path.join(sessionDir(dataDir), id + '.json'), 'utf8')
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as Partial<SessionState> | null
    if (!parsed || typeof parsed !== 'object') return null
    // 老版本或写了一半的会话文件可能缺字段。这里统一补成安全形状 ——
    // 否则调用方一句 session.points.filter(...) 就会抛
    // "Cannot read properties of undefined (reading 'filter')"，
    // 整个「学习者画像」面板因此打不开（learn:overview 直接 reject）。
    return {
      ...(parsed as SessionState),
      points: Array.isArray(parsed.points) ? parsed.points : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      trail: Array.isArray(parsed.trail) ? parsed.trail : [],
    }
  } catch {
    return null
  }
}

/** 最近一次会话（重启后能接着上次往下走） */
export function latestSession(dataDir: string): SessionState | null {
  const dir = sessionDir(dataDir)
  try {
    // 会话正文存在 会话/<id>.jsonl，旁边还有一个 会话/索引.json。
    // 这里以前是"扫目录里最新的 .json 当会话" —— 扫到的其实是索引文件本身，
    // 对象里没有 points / phase，调用方一句 session.points.filter() 就抛，
    // 「学习者画像」面板因此一直打不开（learn:overview 直接 reject）。
    // 现在改成读索引里的当前会话，再拼一个形状完整的摘要。
    // 先看有没有真正的会话状态文件（<id>.json，老格式或测试直写的那种）—— 有就按 mtime 取最新
    const stateFiles = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.json') && n !== '索引.json')
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const f of stateFiles) {
      const loaded = loadSession(dataDir, f.n.replace(/\.json$/, ''))
      if (loaded && Array.isArray(loaded.points)) return loaded
    }
    const indexRaw = fs.readFileSync(path.join(dir, '索引.json'), 'utf8')
    const index = JSON.parse(indexRaw.replace(/^\uFEFF/, '')) as {
      currentId?: string
      items?: Array<{
        id?: string
        title?: string
        phase?: string
        createdAt?: string
        updatedAt?: string
      }>
    }
    const items = Array.isArray(index.items) ? index.items : []
    const meta = items.find((m) => m.id && m.id === index.currentId) ?? items[0]
    if (!meta?.id) return null

    // 旧格式：完整状态存在 <id>.json 里；有就用它（loadSession 已做安全兜底）
    const detailed = loadSession(dataDir, meta.id)
    const stamp = new Date().toISOString()
    return {
      id: meta.id,
      goal: detailed?.goal ?? meta.title ?? '',
      stage: detailed?.stage ?? '',
      phase: (detailed?.phase ?? meta.phase ?? 'opening') as Phase,
      points: detailed?.points ?? [],
      activeIndex: detailed?.activeIndex ?? 0,
      weaknesses: detailed?.weaknesses ?? [],
      startedAt: detailed?.startedAt ?? meta.createdAt ?? stamp,
      updatedAt: detailed?.updatedAt ?? meta.updatedAt ?? stamp,
      trail: detailed?.trail ?? [],
    }
  } catch {
    return null
  }
}
