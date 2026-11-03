/**
 * 本地语音输入（Windows 系统听写，离线、不要密钥）。
 *
 * 为什么加这个引擎：另外三个引擎（阿里云 / MiniMax / Mossland）都要填密钥，
 * 而应用默认 `engine: 'off'`，界面上又没有配置入口 —— 结果就是"点了麦克风没反应"。
 * 这里用 Windows 自带的 System.Speech 识别器兜底：有中文语音包就能用，没有就如实报错。
 *
 * 和云端引擎的差别（必须说清楚）：
 *   · **不做流式**：先把 PCM 攒起来，停止时写成一个 WAV 再整段识别；
 *     所以只有 final 结果，没有 partial 中间文本。
 *   · 识别质量取决于系统语音包，别指望和云端一样好。
 *   · 全程本地，不出网。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AsrStreamSession } from './asr-dispatcher'

const SAMPLE_RATE = 16000

/** Int16LE 单声道 PCM → WAV（44 字节标准头） */
export function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16) // fmt 块长度
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // 单声道
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // 字节率
  header.writeUInt16LE(2, 32) // blockAlign
  header.writeUInt16LE(16, 34) // 位深
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** 跑一段 PowerShell，拿到 stdout（失败时带 stderr） */
function runPowerShell(script: string, timeoutMs = 20000): Promise<{ ok: boolean; out: string; err?: string }> {
  return new Promise((resolve) => {
    const file = path.join(os.tmpdir(), 'costudy-asr-' + Date.now().toString(36) + '.ps1')
    try {
      fs.writeFileSync(file, '\uFEFF' + script, 'utf8')
    } catch (err) {
      resolve({ ok: false, out: '', err: '写脚本失败：' + String(err) })
      return
    }
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], {
      windowsHide: true,
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      resolve({ ok: false, out, err: '识别超时' })
    }, timeoutMs)
    child.stdout.on('data', (d) => {
      out += d.toString()
    })
    child.stderr.on('data', (d) => {
      err += d.toString()
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, out, err: String(e) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      try {
        fs.rmSync(file, { force: true })
      } catch {
        /* ignore */
      }
      resolve({ ok: code === 0, out, err: err || undefined })
    })
  })
}

/**
 * 自检用：验证 PowerShell ↔ Node 之间传中文不会乱码。
 * 走的就是识别所用的那条"写 UTF-8 文件"的路子，所以能代表真实链路。
 */
export async function psUtf8RoundTrip(sample = '滑动变阻器 双缝干涉 酯化反应'): Promise<{ ok: boolean; text: string }> {
  const out = path.join(os.tmpdir(), 'costudy-asr-rt-' + Date.now().toString(36) + '.txt')
  const script = [
    '[System.IO.File]::WriteAllText("' + out.replace(/\\/g, '\\\\') + '", "' + sample + '", (New-Object System.Text.UTF8Encoding($false)))',
  ].join('\r\n')
  const res = await runPowerShell(script, 15000)
  try {
    if (!res.ok) return { ok: false, text: '' }
    return { ok: true, text: fs.readFileSync(out, 'utf8').replace(/^\uFEFF/, '') }
  } catch {
    return { ok: false, text: '' }
  } finally {
    try {
      fs.rmSync(out, { force: true })
    } catch {
      /* ignore */
    }
  }
}

/** 系统听写到底能不能用（有没有中文识别器） */export async function probeLocalAsr(): Promise<{ ok: boolean; detail: string }> {
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$all = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()',
    'if ($all.Count -eq 0) { Write-Output "none"; exit 0 }',
    '$names = ($all | ForEach-Object { $_.Culture.Name }) -join ","',
    'Write-Output $names',
  ].join('\r\n')
  const res = await runPowerShell(script, 15000)
  if (!res.ok) return { ok: false, detail: res.err ? res.err.slice(0, 200) : '探测失败' }
  const names = res.out.trim()
  if (!names || names === 'none') return { ok: false, detail: '这台机器没装语音识别器' }
  return { ok: true, detail: names }
}

/** 用系统识别器识别一个 WAV 文件 */
async function recognizeWav(wavPath: string, language: string): Promise<{ ok: boolean; text: string; err?: string }> {
  const culture = /^en/i.test(language) ? 'en-US' : 'zh-CN'
  // ⚠ 结果不能走 stdout：中文 Windows 上 powershell.exe 的 stdout 是 GBK，
  // Node 按 UTF-8 解就会变成「���ǒú������」这种乱码（用户真踩到了）。
  // 改成写 UTF-8 文件再读回来，跟控制台代码页彻底无关。
  const outPath = path.join(os.tmpdir(), 'costudy-asr-out-' + Date.now().toString(36) + '.txt')
  const script = [
    '$ErrorActionPreference = "Stop"',
    '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
    'Add-Type -AssemblyName System.Speech',
    '$cult = $null',
    'try { $cult = [System.Globalization.CultureInfo]::GetCultureInfo("' + culture + '") } catch { $cult = [System.Globalization.CultureInfo]::CurrentUICulture }',
    '$rec = $null',
    'try { $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine($cult) } catch { $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine }',
    '$rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))',
    '$rec.SetInputToWaveFile("' + wavPath.replace(/\\/g, '\\\\') + '")',
    '$parts = New-Object System.Collections.ArrayList',
    'while ($true) { $r = $rec.Recognize(); if ($null -eq $r) { break }; [void]$parts.Add($r.Text) }',
    '$text = $parts -join ""',
    '[System.IO.File]::WriteAllText("' + outPath.replace(/\\/g, '\\\\') + '", $text, (New-Object System.Text.UTF8Encoding($false)))',
    '$rec.Dispose()',
  ].join('\r\n')
  const res = await runPowerShell(script, 25000)
  try {
    if (!res.ok) return { ok: false, text: '', err: res.err ? res.err.slice(0, 300) : '识别失败' }
    const text = fs.readFileSync(outPath, 'utf8').replace(/^\uFEFF/, '').trim()
    return { ok: true, text }
  } catch {
    return { ok: false, text: '', err: '识别结果读不出来' }
  } finally {
    try {
      fs.rmSync(outPath, { force: true })
    } catch {
      /* ignore */
    }
  }
}

/**
 * 本地流式会话：**不收 partial**，只在 stop 时整段识别。
 * 接口和云端一致，上层（costudy-service）不用改。
 */
export class LocalAsrStream implements AsrStreamSession {
  private chunks: Buffer[] = []
  private closed = false

  constructor(
    private readonly language: string,
    private readonly onFinal: (text: string) => void,
  ) {}

  async start(): Promise<void> {
    const probe = await probeLocalAsr()
    if (!probe.ok) throw new Error('系统听写不可用：' + probe.detail)
  }

  sendAudio(frame: Buffer): void {
    if (this.closed) return
    this.chunks.push(frame)
    // 兜底：单次录音超过 60 秒就不再增长（避免内存无限涨）
    const total = this.chunks.reduce((s, b) => s + b.length, 0)
    if (total > SAMPLE_RATE * 2 * 60) this.closed = true
  }

  async stop(): Promise<string> {
    const pcm = Buffer.concat(this.chunks)
    this.chunks = []
    if (pcm.length < SAMPLE_RATE) return '' // 不到 0.5 秒，认为没说话
    const wavPath = path.join(os.tmpdir(), 'costudy-asr-' + Date.now().toString(36) + '.wav')
    try {
      fs.writeFileSync(wavPath, pcmToWav(pcm))
      const res = await recognizeWav(wavPath, this.language)
      if (!res.ok) return ''
      const text = res.text
      if (text) this.onFinal(text)
      return text
    } catch {
      return ''
    } finally {
      try {
        fs.rmSync(wavPath, { force: true })
      } catch {
        /* ignore */
      }
    }
  }
}
