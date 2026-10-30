/**
 * 全局关闭悬停文字提示。
 *
 * 【背景】
 *   界面上一大批按钮靠 `title` 提供悬停说明。鼠标停一会儿，Chromium 会弹它自己的
 *   提示框：黑底、系统字体、和这套玻璃界面完全不搭。之前做过一版自定义玻璃提示，
 *   现在按需求干脆全部关掉 —— 按钮的功能靠自身文字表达就够了。
 *
 * 【做法】
 *   把 DOM 里所有 `title` 属性摘掉，并用 MutationObserver 兜住后续动态设置的
 *   （很多按钮是挂载后才异步写 title 的，只扫一次会漏）。
 *   注意：只删 title，aria-label 不动 —— 屏幕阅读器仍然能读出按钮用途。
 */
export function disableNativeTooltips(): void {
  const strip = (root: ParentNode): void => {
    root.querySelectorAll('[title]').forEach((node) => node.removeAttribute('title'))
  }

  strip(document)

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const el = record.target as Element
        if (el.hasAttribute('title')) el.removeAttribute('title')
        continue
      }
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return
        if (node.hasAttribute('title')) node.removeAttribute('title')
        strip(node)
      })
    }
  })

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title'],
  })
}
