/**
 * 模型调用层 —— 一个可替换的薄接口。
 *
 * 【为什么不直接写 fetch 到 DeepSeek】
 *   画像摘要、AI 写卡、记忆聚类摘要都要调模型。如果每处各写一遍 fetch，
 *   换服务商就要改三处；而且测试没法跑（没网、没 key 就全红）。
 *
 *   这里把"调模型"收敛成一个接口：
 *     · 有 API key  → OpenAI 兼容协议的真实调用（DeepSeek / 通义 / 本地
 *       vLLM 都能用同一种格式）
 *     · 没有 key    → 离线桩，返回确定性的固定内容
 *
 * 【为什么离线桩不是"假实现"】
 *   它让整条链路（拼提示 → 调模型 → 解析 JSON → 校验 → 生成 diff）
 *   在没有 key 的机器上也能跑通并被测试。真正上线只换 client，
 *   不动上层逻辑 —— 这才叫可替换。
 */
import type { AgeRating } from '../character'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompleteOptions {
  temperature?: number
  maxTokens?: number
  /** 要求返回 JSON（部分服务商支持 response_format） */
  json?: boolean
}

export interface LlmClient {
  /** 用于日志与界面显示 */
  readonly name: string
  readonly model: string
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<string>
}

export interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
}

/** 读取模型配置。全部走环境变量，缺 key 时返回离线桩。 */
export function loadLlmConfig(): LlmConfig {
  const env = process.env
  return {
    apiKey: env['COSTUDY_LLM_API_KEY'] ?? env['DEEPSEEK_API_KEY'] ?? '',
    baseUrl: (env['COSTUDY_LLM_BASE_URL'] ?? 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: env['COSTUDY_LLM_MODEL'] ?? 'deepseek-chat',
    timeoutMs: Number(env['COSTUDY_LLM_TIMEOUT_MS'] ?? 30000),
  }
}

/* ---------- 真实调用（OpenAI 兼容协议） ---------- */

class OpenAiCompatClient implements LlmClient {
  readonly name = 'openai-compatible'
  constructor(private readonly config: LlmConfig) {}

  get model(): string {
    return this.config.model
  }

  async complete(messages: ChatMessage[], options: CompleteOptions = {}): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs)
    try {
      const response = await fetch(this.config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + this.config.apiKey,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2000,
          ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`模型返回 ${response.status}：${body.slice(0, 200)}`)
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const message = data.choices?.[0]?.message as
        | { content?: string; reasoning_content?: string }
        | undefined
      const content = message?.content
      if (typeof content === 'string' && content.trim()) return content

      // 空正文最常见的原因是 max_tokens 被推理吃光了。
      // deepseek-flash 是推理模型：先产 reasoning_content，再产 content，
      // 预算不够时正文就是空字符串 —— 报"空内容"会让人以为是密钥或网络问题。
      const reasoning = message?.reasoning_content
      if (typeof reasoning === 'string' && reasoning.trim()) {
        throw new Error(
          '模型只产出了推理内容、没有正文：max_tokens 太小（推理模型要留推理预算）。把 maxTokens 调大再试。',
        )
      }
      throw new Error('模型返回了空内容（响应里既无 content 也无 reasoning_content）')
    } finally {
      clearTimeout(timer)
    }
  }
}

/* ---------- 离线桩 ---------- */

/**
 * 离线桩：按 prompt 里的标记返回确定性内容。
 * 用途是让上层链路可测、可演示，不是"假装模型在工作"。
 */
export class StubClient implements LlmClient {
  readonly name = 'stub'
  readonly model = 'stub'
  /** 记录调用次数，测试用 */
  calls = 0
  constructor(private readonly responder?: (messages: ChatMessage[]) => string) {}

  async complete(messages: ChatMessage[], options: CompleteOptions = {}): Promise<string> {
    this.calls += 1
    if (this.responder) return this.responder(messages)
    const last = messages[messages.length - 1]?.content ?? ''
    if (options.json || last.includes('JSON')) {
      return JSON.stringify({
        name: '苏格拉底式同学',
        emoji: '🧩',
        address: '同学',
        personality: '喜欢用反问推进，不直接给答案；会先确认对方卡在哪一步。',
        description: '一个和你一起把题拆开的同伴。',
        scenario: '坐在你旁边，等着看你写第一步。',
        style: '短句，先问再讲。',
        rules: '不替对方做题；对方没懂就换说法。',
        behavior: '安静、专注，偶尔提醒一句。',
        opening: '先别看答案，你打算从哪一步开始？',
        first_mes: '先别看答案，你打算从哪一步开始？',
        mes_example: '{{user}}: 这题不会\n{{char}}: 你先说说，题目给了哪些条件？',
        system_prompt: '',
        post_history_instructions: '',
        ageRating: 'all-ages',
      })
    }
    return '（离线桩回复）我听到了。'
  }
}

export class StubErrorClient implements LlmClient {
  readonly name = 'stub-error'
  readonly model = 'stub-error'
  async complete(): Promise<string> {
    throw new Error('模拟网络失败')
  }
}

/** 工厂：有 key 用真实客户端，没有就用桩 */
export function createClient(config: LlmConfig = loadLlmConfig()): LlmClient {
  if (config.apiKey.trim()) return new OpenAiCompatClient(config)
  return new StubClient()
}

/** 这段给界面用：告诉用户现在走的是真模型还是离线桩 */
export function describeClient(client: LlmClient): string {
  return client.name === 'stub' ? '离线桩（未配置 API Key）' : `${client.name} · ${client.model}`
}

/** 年龄等级 → 给模型的约束句 */
export function ageHint(rating: AgeRating): string {
  if (rating === 'teen') return '内容面向青少年：可以谈成长与压力，不涉及性内容与自伤方法。'
  if (rating === 'adult') return '内容面向成人：可以谈更复杂的现实议题，但不提供违法或伤人方法。'
  return '内容面向全年龄：不涉及性、暴力、自伤；不与使用者建立依赖关系；不索取个人信息。'
}
