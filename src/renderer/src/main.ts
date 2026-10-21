async function boot(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) return

  const info = await window.costudy?.info()

  // 内容放进 .glass（样式在 index.html）—— 窗口透明，玻璃下面透出桌面
  root.innerHTML = `
    <section class="glass">
      <h1>伴学 · Cosplay 学习助手</h1>
      <p>窗口背景透明，下面是桌面。骨架：Electron + Vite + TypeScript</p>
      <dl class="meta">
        <dt>应用</dt><dd>${info?.name ?? '—'}</dd>
        <dt>版本</dt><dd>${info?.version ?? '—'}</dd>
        <dt>Electron</dt><dd>${info?.electron ?? '—'}</dd>
        <dt>Node</dt><dd>${info?.node ?? '—'}</dd>
        <dt>平台</dt><dd>${info?.platform ?? '—'}</dd>
      </dl>
    </section>
  `
}

void boot()
