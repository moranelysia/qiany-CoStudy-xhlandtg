import type { WebAttachment } from '../../shared/web-attachment'

export const WEB_ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.txt,.md,.csv,.json'

const pending = new Map<string, File[]>()

export function pendingFiles(id: string): File[] {
  return pending.get(id) ?? []
}

function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return Math.max(1, Math.ceil(bytes / 1024)) + ' KB'
}

function paintAttachments(root: Element, id: string): void {
  const tray = root.querySelector<HTMLElement>('[data-attach-tray]')
  if (!tray) return
  const files = pendingFiles(id)
  tray.hidden = files.length === 0
  tray.replaceChildren()
  for (const file of files) {
    const chip = document.createElement('div')
    chip.className = 'web-attach-chip'
    const label = document.createElement('span')
    label.className = 'web-attach-name'
    label.textContent = file.name
    label.title = file.name
    const size = document.createElement('small')
    size.textContent = fileSize(file.size)
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = '×'
    remove.setAttribute('aria-label', '移除 ' + file.name)
    remove.addEventListener('click', () => removeSentFiles(root, id, [file]))
    chip.append(label, size, remove)
    tray.appendChild(chip)
  }
}

export function showAttachmentComposer(root: Element, id: string): void {
  root.setAttribute('data-attach-session', id)
  paintAttachments(root, id)
}

export function removeSentFiles(root: Element | null, id: string, files: File[]): void {
  const remainder = pendingFiles(id).filter((item) => !files.includes(item))
  if (remainder.length) pending.set(id, remainder)
  else pending.delete(id)
  if (root?.getAttribute('data-attach-session') === id) paintAttachments(root, id)
}

export function bindWebAttachmentPicker(root: Element): void {
  const picker = root.querySelector<HTMLInputElement>('[data-attach-input]')
  const button = root.querySelector<HTMLButtonElement>('[data-web-attach]')
  const validate = window.costudy?.webAttachmentsValidate
  if (!picker || !button || !validate) return
  button.hidden = false
  picker.accept = WEB_ATTACHMENT_ACCEPT

  const addFiles = (files: File[]): void => {
    const id = root.getAttribute('data-attach-session')
    if (!id) {
      window.__toast?.('正在加载对话，请稍后添加附件。')
      return
    }
    const selected = [...pendingFiles(id)]
    let error: string | null = null
    for (const file of files) {
      const issue = validate(selected.concat(file))
      if (issue) error ??= issue
      else selected.push(file)
    }
    if (selected.length) pending.set(id, selected)
    paintAttachments(root, id)
    if (error) window.__toast?.(error)
  }

  button.addEventListener('click', () => {
    if (!root.getAttribute('data-attach-session')) {
      window.__toast?.('正在加载对话，请稍后添加附件。')
      return
    }
    picker.click()
  })
  picker.addEventListener('change', () => {
    addFiles(Array.from(picker.files ?? []))
    picker.value = ''
  })
  root.querySelector('.dock input.input')?.addEventListener('paste', (event) => {
    const clipboard = (event as ClipboardEvent).clipboardData
    const images = Array.from(clipboard?.files ?? []).filter((file) => file.type.startsWith('image/'))
    if (!images.length) return
    event.preventDefault()
    addFiles(images)
  })
}

export function renderAttachmentList(
  message: HTMLElement,
  attachments: Array<Pick<WebAttachment, 'name' | 'bytes'> & Partial<Pick<WebAttachment, 'id'>>>,
): void {
  if (!attachments.length) return
  const row = document.createElement('div')
  row.className = 'web-attach-message'
  row.setAttribute('aria-label', '附件')
  for (const item of attachments) {
    const chip = document.createElement(item.id ? 'button' : 'span')
    chip.className = 'web-attach-chip'
    const name = document.createElement('span')
    name.className = 'web-attach-name'
    name.textContent = item.name
    name.title = item.name
    const size = document.createElement('small')
    size.textContent = fileSize(item.bytes)
    chip.append(name, size)
    const id = item.id
    if (id && chip instanceof HTMLButtonElement) {
      chip.type = 'button'
      chip.setAttribute('aria-label', '下载附件 ' + item.name)
      chip.addEventListener('click', async () => {
        try {
          const blob = await window.costudy?.webAttachmentGet?.(id)
          if (!blob) throw new Error('附件无法读取')
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = item.name
          link.click()
          window.setTimeout(() => URL.revokeObjectURL(url), 30000)
        } catch {
          window.__toast?.('找不到这份附件，可能是浏览器存储已被清理。')
        }
      })
    }
    row.appendChild(chip)
  }
  message.appendChild(row)
}
