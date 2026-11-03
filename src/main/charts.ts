/**
 * 图表存档（MCP 作图服务的产物）。
 *
 * 【为什么要把 SVG 存盘再给标记】
 *   模型画完图，如果让它在回复里把整段 SVG 复述一遍，一次就是 20 KB token，
 *   而且又贵又容易抄错。所以这里改成：
 *     工具执行 → SVG 存成文件 → 只回一个 `[chart:xxxx]` 标记
 *   模型只要把标记原样带上，渲染端凭 id 取图。
 *
 * 存盘还有一个好处：消息落盘后重启，标记还在，图也能重新取出来。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

function chartDir(dataDir: string): string {
  return path.join(dataDir, '图表')
}

/**
 * 存一张图，返回 id。
 *
 * **写盘失败必须抛**：以前这里 catch 掉了错误、照样返回 id，
 * 于是模型拿到一个打不开的编号写进回复，学生端只看到"这张图没存下来"，
 * 谁也不知道是存储坏了。宁可让工具调用失败，也不能给一个假 id。
 */
export function saveChart(dataDir: string, svg: string): string {
  const id = 'c-' + randomUUID().replace(/-/g, '').slice(0, 12)
  const dir = chartDir(dataDir)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, id + '.svg')
  fs.writeFileSync(file, svg, 'utf8')
  // 写完立刻回读：文件在、内容长度对，才算真的存住了
  const back = fs.readFileSync(file, 'utf8')
  if (back !== svg) throw new Error('图表写入不完整')
  return id
}

/** 按 id 取图；取不到返回 null */
export function readChart(dataDir: string, id: string): string | null {
  if (!/^c-[a-f0-9]{12}$/.test(id)) return null
  try {
    return fs.readFileSync(path.join(chartDir(dataDir), id + '.svg'), 'utf8')
  } catch {
    return null
  }
}

/** 图卡片的附属信息（原理、步骤、校验结果）——和 SVG 同目录存一份 <id>.json */
export interface ChartMeta {
  title?: string
  kind?: string
  principle?: string
  steps?: string[]
  issues?: string[]
  /** 生成这张图时用的参数（图卡片上的『调参数』要用它回填） */
  args?: Record<string, unknown>
  net?: unknown
  at?: string
}

export function saveChartMeta(dataDir: string, id: string, meta: ChartMeta): void {
  if (!/^c-[a-f0-9]{12}$/.test(id)) return
  const file = path.join(chartDir(dataDir), id + '.json')
  fs.mkdirSync(chartDir(dataDir), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ ...meta, at: new Date().toISOString() }, null, 2), 'utf8')
}

export function readChartMeta(dataDir: string, id: string): ChartMeta | null {
  if (!/^c-[a-f0-9]{12}$/.test(id)) return null
  try {
    const raw = fs.readFileSync(path.join(chartDir(dataDir), id + '.json'), 'utf8')
    const parsed = JSON.parse(raw) as ChartMeta
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
