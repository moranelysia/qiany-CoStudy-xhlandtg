/* ==========================================================
   Shared UI atoms used by all three variants.
   Everything here follows the craft rules:
   - transform/opacity only
   - press feedback scale(0.97)
   - no scale(0), no ease-in
   ========================================================== */

/** escape for text interpolation */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * A personality slider row.
 * data-key carries the dimension so the variant can bind generically.
 */
export function sliderRow(dim, opts = {}) {
  const compact = opts.compact ? ' is-compact' : '';
  const value = dim.value;
  const label = dim.label ?? dim.left;
  return `
    <div class="dim${compact}" data-dim="${esc(dim.key)}">
      <div class="dim-head">
        <span class="dim-name">${esc(label)}</span>
        <span class="dim-poles small muted">${esc(dim.left)} ↔ ${esc(dim.right)}</span>
        <span class="dim-val" data-val>${value}</span>
      </div>
      <div class="ice-range">
        <div class="ice-track">
          <div class="ice-fill" data-fill style="width:${value}%"></div>
        </div>
        <div class="ice-thumb" data-thumb style="left:${value}%"></div>
        <input type="range" class="ice-input" min="0" max="100" value="${value}"
               aria-label="${esc(label)}"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"
               style="--pct:${value}%" data-slider />
      </div>
      ${opts.hint && dim.hint ? `<p class="dim-hint small muted">${esc(dim.hint)}</p>` : ''}
    </div>`;
}

/** 把某个滑条的视觉与状态一次性同步到 v（程序化改值时也要调它） */
export function syncSlider(root, key, v) {
  const row = root.querySelector(`[data-dim="${key}"]`);
  if (!row) return;
  const input = row.querySelector('[data-slider]');
  const fill = row.querySelector('[data-fill]');
  const thumb = row.querySelector('[data-thumb]');
  const val = row.querySelector('[data-val]');
  if (input) {
    input.value = String(v);
    input.style.setProperty('--pct', v + '%');
    input.setAttribute('aria-valuenow', String(v));
  }
  if (fill) fill.style.width = v + '%';
  if (thumb) thumb.style.left = v + '%';
  if (val) val.textContent = String(v);
}

/** iOS-style switch */
export function toggleRow(item) {
  return `
    <label class="switch-row" data-toggle="${esc(item.key)}">
      <span class="switch-text">
        <span class="switch-label">${esc(item.label)}</span>
        ${item.hint ? `<span class="switch-hint small muted">${esc(item.hint)}</span>` : ''}
      </span>
      <input type="checkbox" ${item.on ? 'checked' : ''} data-switch />
      <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
    </label>`;
}

/** segmented control */
export function segmented(name, options, active, ariaLabel) {
  return `
    <div class="segmented" role="radiogroup" aria-label="${esc(ariaLabel)}" data-segmented="${esc(name)}">
      ${options
        .map(
          (o) => `<button type="button" class="segmented-item${o === active ? ' is-on' : ''}"
                    role="radio" aria-checked="${o === active}" data-value="${esc(o)}">${esc(o)}</button>`
        )
        .join('')}
    </div>`;
}

/** avatar bubble — first grapheme of the name, or emoji */
export function avatar(name, _emoji, size = 40) {
  // tells.md: emoji as icons is banned. Use the first grapheme of the name.
  const initial = [...(name || '?')][0] || '?';
  return `<span class="avatar" style="--sz:${size}px" aria-hidden="true">${esc(initial)}</span>`;
}

/** bind a slider row: updates fill %, aria, and the number readout */
export function bindSlider(root, key, onChange) {
  const row = root.querySelector(`[data-dim="${key}"]`);
  if (!row) return;
  const input = row.querySelector('[data-slider]');
  if (!input) return;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    syncSlider(root, key, v);
    onChange?.(key, v);
  });
}

/** generic mount helper: clears the node then renders */
export function mountHTML(node, html) {
  node.innerHTML = html;
}

/** add the blur-bridge transition to an element while its content changes */
export function blurSwap(el, mutate) {
  el.classList.add('is-updating');
  window.setTimeout(() => {
    mutate();
    // next frame removes the blur so the new content fades in
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-updating')));
  }, 170);
}

/* ==========================================================
   Liquid Glass：高光跟随指针
   iOS 26 的玻璃不是静态的 —— 光源跟着手指走，材质才"活"。
   只在有 hover 的设备上跑，rAF 节流，减少合成开销。
   ========================================================== */
export function initGlass() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SEL = '.nav, .card, .btn, .v-studio .preview, .v-comp .dock';
  let raf = 0;
  let pending = null;

  document.addEventListener(
    'pointermove',
    (e) => {
      const el = e.target instanceof Element ? e.target.closest(SEL) : null;
      if (!el) return;
      pending = { el, x: e.clientX, y: e.clientY };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!pending) return;
        const { el: node, x, y } = pending;
        const r = node.getBoundingClientRect();
        node.style.setProperty('--mx', ((x - r.left) / r.width) * 100 + '%');
        node.style.setProperty('--my', ((y - r.top) / r.height) * 100 + '%');
      });
    },
    { passive: true }
  );
}