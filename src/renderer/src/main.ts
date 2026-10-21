async function boot(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) return

  const info = await window.costudy?.info()

  root.innerHTML = `
    <main style="font-family:system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;padding:40px;line-height:1.7">
      <h1 style="margin:0 0 8px">伴学 · Cosplay 学习助手</h1>
      <p style="color:#666;margin:0 0 24px">骨架已就绪：Electron + Vite + TypeScript</p>
      <dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 18px;max-width:520px">
        <dt style="color:#888">应用</dt><dd style="margin:0">${info?.name ?? '—'}</dd>
        <dt style="color:#888">版本</dt><dd style="margin:0">${info?.version ?? '—'}</dd>
        <dt style="color:#888">Electron</dt><dd style="margin:0">${info?.electron ?? '—'}</dd>
        <dt style="color:#888">Node</dt><dd style="margin:0">${info?.node ?? '—'}</dd>
        <dt style="color:#888">平台</dt><dd style="margin:0">${info?.platform ?? '—'}</dd>
      </dl>
      <p style="margin-top:28px;color:#999">
        下一步：搬 <code>脑/</code> 里的提示词、记忆、工具三层，做单学习模式。
      </p>
    </main>
  `
}

void boot()
