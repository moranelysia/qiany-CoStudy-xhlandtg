/**
 * 角色卡仓库 —— 增删改查、导入导出、切换当前卡。
 *
 * 【存储布局】
 *   <dataDir>/cards/
 *     role-<时间>-<随机>.card.json     每张卡一个文件（chara_card_v2）
 *     .active.json                     { "id": "role-…" } 指向当前生效的卡
 *
 * 【为什么"当前卡"用指针文件，而不是把选中的卡复制成 active.card.json】
 *   复制会产生两份数据：用户改了副本，原卡不会变；下次切换又覆盖回来，
 *   最后谁也说不清哪份是真的。指针只有一份真实数据，切换只是改一个 id。
 *
 * 【为什么文件名带随机后缀】
 *   角色名可以重复、可以带斜杠和奇怪字符。用名字做文件名迟早出事，
 *   所以 id 独立生成，名字只是显示。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadCard, normalizeCard, saveCard, toV2Payload } from './character'
import type { CharacterCard } from './character'

export interface CardSummary {
  id: string
  name: string
  emoji: string
  address: string
  ageRating: string
  /** 文件修改时间（ISO） */
  updatedAt: string
  isActive: boolean
}

interface ActivePointer {
  id?: string
}

const ACTIVE_FILE = '.active.json'
const CARD_SUFFIX = '.card.json'

function newId(): string {
  return 'role-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as T
  } catch {
    return null
  }
}

export class CardStore {
  private readonly dir: string

  /**
   * @param dataDir 运行数据根目录（记忆、会话、角色卡都在这下面）
   */
  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'cards')
  }

  root(): string {
    return this.dir
  }

  /** 确保目录存在（第一次启动时调用） */
  ensure(): void {
    fs.mkdirSync(this.dir, { recursive: true })
  }

  private cardFile(id: string): string {
    return path.join(this.dir, id + CARD_SUFFIX)
  }

  /** 指针里记的 id（不检查文件是否存在）。删除场景必须用它，否则先删后判永远为假。 */
  private pointerRaw(): string {
    const pointer = readJson<ActivePointer>(path.join(this.dir, ACTIVE_FILE))
    return typeof pointer?.id === 'string' ? pointer.id : ''
  }

  private activeId(): string {
    const id = this.pointerRaw()
    if (id && fs.existsSync(this.cardFile(id))) return id
    return ''
  }

  /**
   * 当前生效的卡文件。
   * 指针坏了 / 卡被删了 → 退回目录里第一张；一张都没有 → 返回空串。
   */
  activeFile(): string {
    const id = this.activeId()
    if (id) return this.cardFile(id)
    const first = this.list()[0]
    return first ? this.cardFile(first.id) : ''
  }

  /** 当前生效的卡（没有卡时返回空壳，不抛） */
  activeCard(fallbackFile = ''): CharacterCard {
    const file = this.activeFile() || fallbackFile
    return file ? loadCard(file) : normalizeCard({}, '')
  }

  list(): CardSummary[] {
    this.ensure()
    const active = this.activeId()
    let names: string[]
    try {
      names = fs.readdirSync(this.dir).filter((n) => n.endsWith(CARD_SUFFIX))
    } catch {
      return []
    }

    const rows: CardSummary[] = []
    for (const fileName of names) {
      const id = fileName.slice(0, -CARD_SUFFIX.length)
      const file = path.join(this.dir, fileName)
      const card = loadCard(file)
      let updatedAt = ''
      try {
        updatedAt = fs.statSync(file).mtime.toISOString()
      } catch {
        updatedAt = ''
      }
      rows.push({
        id,
        name: card.name,
        emoji: card.emoji,
        address: card.cosplay.address,
        ageRating: card.ageRating,
        updatedAt,
        isActive: id === active,
      })
    }

    // 按创建顺序排：老的在上面、新加的在下面。
    //
    // 原来是"当前卡提到最前、其余按修改时间倒序"—— 结果是新建一个角色它会插到最顶上，
    // 用户要的是"追加到已有角色下面"。改成按 id 升序：id 是 role-<base36 时间戳>-<随机>，
    // 字典序约等于创建先后，而且不会被"编辑过"打乱（按 mtime 排就会出现
    // "改一下老角色，它就跳到最下面"）。
    rows.sort((a, b) => a.id.localeCompare(b.id))
    return rows
  }

  read(id: string): CharacterCard | null {
    const file = this.cardFile(id)
    if (!fs.existsSync(file)) return null
    return loadCard(file)
  }

  /** 新建一张空卡，返回落盘后的卡 */
  create(name = '新角色', options?: { configure?: (card: CharacterCard) => void; activate?: boolean }): CharacterCard {
    this.ensure()
    const id = newId()
    const file = this.cardFile(id)
    const card = normalizeCard({ data: { name } }, file)
    card.cosplay.id = id
    options?.configure?.(card)
    saveCard(card)
    try {
      if (options?.activate || !this.activeId()) {
        if (!this.setActive(id)) throw new Error('无法切换到新角色')
      }
    } catch (err) {
      this.remove(id)
      throw err
    }
    return card
  }

  /** 复制一张卡（名字加「副本」，id 重新生成） */
  duplicate(id: string): CharacterCard | null {
    const source = this.read(id)
    if (!source) return null
    const copy: CharacterCard = {
      ...source,
      file: this.cardFile(newId()),
      name: source.name + ' 副本',
      cosplay: { ...source.cosplay },
    }
    copy.cosplay.id = path.basename(copy.file, CARD_SUFFIX)
    saveCard(copy)
    return copy
  }

  /** 删除；如果删的是当前卡，指针自动转移到剩下的第一张 */
  remove(id: string): boolean {
    const file = this.cardFile(id)
    if (!fs.existsSync(file)) return false

    // 必须在删除【之前】读指针：activeId() 会检查文件是否存在，
    // 文件一删，它永远返回空串，判断"删的是不是当前卡"就永远是假。
    const wasActive = this.pointerRaw() === id

    try {
      fs.unlinkSync(file)
    } catch {
      return false
    }

    if (wasActive) {
      const next = this.list()[0]
      if (next) this.setActive(next.id)
      else fs.rmSync(path.join(this.dir, ACTIVE_FILE), { force: true })
    }
    return true
  }

  /** 保存（覆盖）一张卡。id 来自 file 名。 */
  save(card: CharacterCard): CharacterCard {
    saveCard(card)
    return card
  }

  /** 切换当前卡 */
  setActive(id: string): boolean {
    if (!fs.existsSync(this.cardFile(id))) return false
    this.ensure()
    fs.writeFileSync(path.join(this.dir, ACTIVE_FILE), JSON.stringify({ id }, null, 2) + '\n', 'utf8')
    return true
  }

  /**
   * 导入：接受 chara_card_v2 或扁平结构。
   * 名字重复时自动加序号 —— 导入失败最常见的原因就是重名，这里直接处理掉。
   */
  importJson(text: string): { ok: true; card: CharacterCard } | { ok: false; error: string } {
    let raw: unknown
    try {
      raw = JSON.parse(text.replace(/^\uFEFF/, ''))
    } catch (err) {
      return { ok: false, error: '不是合法的 JSON：' + (err as Error).message }
    }
    const id = newId()
    const card = normalizeCard(raw, this.cardFile(id))
    if (!card.name || card.name === '新角色') {
      return { ok: false, error: '这张卡没有角色名（data.name 为空）' }
    }
    card.name = this.uniqueName(card.name)
    card.cosplay.id = id
    saveCard(card)
    return { ok: true, card }
  }

  /** 导出成 chara_card_v2 文本 */
  exportJson(id: string): string | null {
    const card = this.read(id)
    if (!card) return null
    return JSON.stringify(toV2Payload(card), null, 2) + '\n'
  }

  private uniqueName(base: string): string {
    const taken = new Set(this.list().map((c) => c.name))
    if (!taken.has(base)) return base
    for (let i = 2; i < 100; i++) {
      const candidate = `${base} ${i}`
      if (!taken.has(candidate)) return candidate
    }
    return base + ' ' + Date.now()
  }
}
