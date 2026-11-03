/**
 * 重试策略（P3 保障层）。
 *
 * 【只重试"值得重试"的错误】
 *   断网、超时、5xx、429 —— 这些过一会儿可能就好了
 *   400 / 401 / 402 —— 参数错、Key 错、没钱，重试一百次也一样，立刻返回
 *   这条判断很重要：对着 401 重试三次，用户会等 5 秒才看到"Key 无效"。
 */
export interface RetryOptions {
  attempts?: number
  /** 首次等待毫秒，之后翻倍 */
  baseDelayMs?: number
  onRetry?: (attempt: number, error: Error, waitMs: number) => void
}

/** 判断这个错误值不值得重试 */
export function isRetryable(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase()
  // 明确不重试：鉴权 / 余额 / 参数
  if (/\b401\b|\b402\b|\b403\b|\b400\b/.test(message)) return false
  if (/api key|unauthorized|invalid_request|余额|key 无效/i.test(message)) return false
  // 值得重试：网络层、超时、限流、服务端
  return /econnrefused|etimedout|enotfound|econnreset|socket|network|fetch failed|abort|timeout|超时|\b429\b|\b5\d\d\b/.test(
    message,
  )
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3)
  const baseDelay = Math.max(100, options.baseDelayMs ?? 700)
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt >= attempts || !isRetryable(lastError)) throw lastError
      const wait = baseDelay * Math.pow(2, attempt - 1)
      options.onRetry?.(attempt, lastError, wait)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastError ?? new Error('重试失败')
}
