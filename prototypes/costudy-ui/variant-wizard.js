/* ==========================================================
   Variant B — "Wizard"
   Axis: SEQUENTIAL GUIDED FLOW.
   Creation is 4 steps with a persistent rail; the learning surface
   is plan-first (knowledge points + mastery), not chat-first.
   Motion story: step changes cross-fade with a blur bridge; the rail
   advances with a spring feel via CSS. Nothing animates from scale(0).
   ========================================================== */
import { esc, sliderRow, toggleRow, segmented, avatar, bindSlider, blurSwap } from './ui.js';
import {
  DIMS, TEACHING, TEMPLATES, PRESETS, LESSON,
  STAGE_OPTIONS, EXERCISE_OPTIONS, ERROR_OPTIONS,
} from './data.js';

const STYLE = `
.v-wiz { display: grid; grid-template-columns: 264px minmax(0,1fr); gap: 22px; align-items: start; }

/* ---- left rail ---- */
.v-wiz .steps { position: sticky; top: 0; padding: 4px 0; }
.v-wiz .step {
  display: flex; align-items: flex-start; gap: 11px; padding: 10px 4px;
  position: relative; cursor: default;
}
.v-wiz .step-dot {
  width: 22px; height: 22px; border-radius: 50%; flex: none;
  display: grid; place-items: center; font-size: 11px; font-weight: 600;
  background: #fff; border: 1.5px solid var(--line-strong); color: var(--ink-3);
  transition: background-color var(--dur-pop) ease, border-color var(--dur-pop) ease, color var(--dur-pop) ease;
  position: relative; z-index: 1;
}
.v-wiz .step.is-done .step-dot { background: var(--ink); border-color: var(--ink); color: #fff; }
.v-wiz .step.is-now .step-dot { border-color: var(--ink); color: var(--ink); box-shadow: 0 0 0 4px rgba(28,27,26,.07); }
.v-wiz .step-label { font-size: 13px; font-weight: 500; color: var(--ink-3); transition: color var(--dur-pop) ease; }
.v-wiz .step.is-now .step-label { color: var(--ink); font-weight: 600; }
.v-wiz .step-sub { font-size: 11.5px; color: var(--ink-3); }
.v-wiz .step-line { position: absolute; left: 15px; top: 32px; bottom: -10px; width: 1.5px; background: var(--line); }
.v-wiz .step:last-child .step-line { display: none; }

/* ---- main ---- */
.v-wiz .wiz-main { min-width: 0; }
.v-wiz .wiz-head { margin-bottom: 18px; }
.v-wiz .wiz-kicker { font-size: 11.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--accent); }
.v-wiz .wiz-title { font-size: 24px; margin-top: 4px; }
.v-wiz .wiz-sub { color: var(--ink-2); margin-top: 5px; max-width: 52ch; }
.v-wiz .wiz-body { padding: 20px 22px; }
.v-wiz .wiz-foot {
  display: flex; align-items: center; gap: 8px; margin-top: 16px;
}

/* template grid */
.v-wiz .tpl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.v-wiz .tpl {
  text-align: left; padding: 13px; border-radius: 13px; border: 1px solid var(--line);
  background: #fff; cursor: pointer;
  transition: border-color var(--dur-tip) ease, transform var(--dur-press) var(--ease-out), box-shadow var(--dur-tip) ease;
}
.v-wiz .tpl:hover { border-color: var(--line-strong); box-shadow: var(--shadow-1); }
.v-wiz .tpl:active { transform: scale(0.985); }
.v-wiz .tpl.is-on { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
.v-wiz .tpl-emoji { font-size: 20px; }
.v-wiz .tpl-name { font-size: 13.5px; font-weight: 600; margin-top: 6px; }
.v-wiz .tpl-line { font-size: 11.5px; color: var(--ink-3); line-height: 1.45; margin-top: 2px; }

/* step 2 dims */
.v-wiz .dims2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 26px; }
.dim { padding: 8px 0; }
.dim-head { display: flex; align-items: baseline; gap: 8px; }
.dim-name { font-size: 13px; font-weight: 500; min-width: 58px; }
.dim-poles { flex: 1; font-size: 10.5px; }
.dim-val { font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; min-width: 24px; text-align: right; color: var(--ink-2); }
.dim input[type="range"] { display: block; margin-top: 4px; }
.dim-hint { display: none; }

/* switches + segmented (shared visual) */
.switch-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; cursor: pointer; }
.switch-text { flex: 1; }
.switch-label { display: block; font-size: 13px; }
.switch-hint { display: block; font-size: 11.5px; }
.switch-row input { position: absolute; opacity: 0; pointer-events: none; }
.switch-track { position: relative; width: 34px; height: 20px; border-radius: 999px; background: var(--line-strong); flex: none; transition: background-color var(--dur-press) ease; }
.switch-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-1); transition: transform var(--dur-press) var(--ease-out); }
.switch-row input:checked + .switch-track { background: var(--ink); }
.switch-row input:checked + .switch-track .switch-thumb { transform: translateX(14px); }
.segmented { display: inline-flex; gap: 2px; padding: 3px; background: #f3f0ed; border-radius: 9px; }
.segmented-item { border: 0; background: transparent; border-radius: 7px; padding: 4px 11px; font-size: 12.5px; font-weight: 500; color: var(--ink-2); cursor: pointer; transition: color var(--dur-tip) ease; }
.segmented-item:hover { color: var(--ink); }
.segmented-item.is-on { background: #fff; color: var(--ink); box-shadow: var(--shadow-1); }
.segmented-item:active { transform: scale(0.97); }

/* step 3 review */
.v-wiz .review-card { padding: 16px; border-radius: 13px; background: #fbfaf9; border: 1px solid var(--line); }
.v-wiz .kv { display: grid; grid-template-columns: 84px 1fr; gap: 7px 14px; font-size: 13px; }
.v-wiz .kv dt { color: var(--ink-3); }
.v-wiz .kv dd { margin: 0; }

/* ---- learning surface ---- */
.v-wiz .learn { display: grid; grid-template-columns: minmax(0,1fr) 296px; gap: 18px; align-items: start; }
.v-wiz .learn-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.v-wiz .learn-head h1 { font-size: 18px; }
.v-wiz .goal {
  padding: 14px 16px; border-radius: 13px; background: var(--accent-soft);
  border: 1px solid var(--accent-line); margin-bottom: 16px;
}
.v-wiz .goal-k { font-size: 11.5px; font-weight: 600; color: var(--accent); letter-spacing: .04em; text-transform: uppercase; }
.v-wiz .goal-t { font-size: 14px; margin-top: 3px; }

.v-wiz .kp-list { display: grid; gap: 2px; }
.v-wiz .kp {
  display: grid; grid-template-columns: 26px 1fr 96px; align-items: center; gap: 12px;
  padding: 11px 4px; border-bottom: 1px solid var(--line);
  transition: background-color var(--dur-tip) ease;
}
.v-wiz .kp:last-child { border-bottom: 0; }
.v-wiz .kp-mark {
  width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
  font-size: 11px; border: 1.5px solid var(--line-strong); color: var(--ink-3); background: #fff;
}
.v-wiz .kp.is-done .kp-mark { background: #ecfdf3; border-color: #86efac; color: var(--ok); }
.v-wiz .kp.is-doing .kp-mark { border-color: var(--accent); color: var(--accent); }
.v-wiz .kp-name { font-size: 13.5px; font-weight: 500; }
.v-wiz .kp-sub { font-size: 11.5px; color: var(--ink-3); }
.v-wiz .mastery { display: flex; align-items: center; gap: 7px; }
.v-wiz .bar { flex: 1; height: 5px; border-radius: 999px; background: var(--line); overflow: hidden; }
.v-wiz .bar > i { display: block; height: 100%; border-radius: 999px; background: var(--ink); transition: width 320ms var(--ease-out); }
.v-wiz .mastery-num { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--ink-3); min-width: 28px; text-align: right; }

.v-wiz .side-card { padding: 15px 16px; }
.v-wiz .side-card + .side-card { margin-top: 12px; }
.v-wiz .side-title { font-size: 12px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 9px; }
.v-wiz .side-item { padding: 8px 0; border-bottom: 1px dashed var(--line); font-size: 12.5px; }
.v-wiz .side-item:last-child { border-bottom: 0; }
.v-wiz .side-item b { font-weight: 600; }
.v-wiz .side-item .why { color: var(--ink-3); font-size: 11.5px; }
.v-wiz .pill-due { display: inline-block; padding: 1px 6px; border-radius: 5px; background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent-line); font-size: 10.5px; margin-left: 4px; }

.v-wiz .start-teach { display: flex; gap: 8px; margin-top: 16px; }
`;

let step = 0;
const STEPS = [
  { t: '选个起点', s: '从模板开始，或空手建' },
  { t: '调性格', s: '12 个维度，拖到你满意' },
  { t: '定教法', s: '怎么讲、怎么练、怎么纠错' },
  { t: '确认', s: '看一眼编译结果' },
];

let state = {
  templateId: 'senior',
  name: '温柔学姐',
  emoji: '🌸',
  nickname: '同学',
  catchphrase: '来，我们一起看看',
  stage: '高中',
  exercise: '中',
  errorMode: '引导自检',
  dims: JSON.parse(JSON.stringify(DIMS)),
  teaching: JSON.parse(JSON.stringify(TEACHING)),
  learnMode: 'plan',
};

function applyPreset(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  state.templateId = id;
  state.name = t.name;
  state.emoji = t.emoji;
  const p = PRESETS[id] || {};
  state.dims.forEach((d) => {
    if (p[d.key] != null) d.value = p[d.key];
  });
}

function renderSteps() {
  return STEPS.map(
    (s, i) => `
    <div class="step${i < step ? ' is-done' : ''}${i === step ? ' is-now' : ''}">
      <span class="step-dot">${i < step ? '✓' : i + 1}</span>
      <span>
        <span class="step-label">${esc(s.t)}</span>
        <span class="step-sub" style="display:block">${esc(s.s)}</span>
      </span>
      <span class="step-line"></span>
    </div>`
  ).join('');
}

function stepBody() {
  if (step === 0) {
    return `
      <div class="tpl-grid">
        ${TEMPLATES.slice(0, 6)
          .map(
            (t) => `
          <button class="tpl${t.id === state.templateId ? ' is-on' : ''}" data-tpl="${t.id}">
            <div class="tpl-emoji">${t.emoji}</div>
            <div class="tpl-name">${esc(t.name)}</div>
            <div class="tpl-line">${esc(t.line)}</div>
          </button>`
          )
          .join('')}
      </div>
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label><span class="small muted">角色名</span><input class="input" data-in="name" value="${esc(state.name)}" /></label>
        <label><span class="small muted">怎么称呼你</span><input class="input" data-in="nickname" value="${esc(state.nickname)}" /></label>
      </div>`;
  }
  if (step === 1) {
    return `<div class="dims2">${state.dims.map((d) => sliderRow(d)).join('')}</div>`;
  }
  if (step === 2) {
    return `
      <div style="display:grid;gap:14px">
        <div class="dim" data-dim="explain">
          <div class="dim-head">
            <span class="dim-name">讲解比例</span>
            <span class="dim-poles small muted">纯提问 ↔ 纯讲解</span>
            <span class="dim-val" data-val>38</span>
          </div>
          <input type="range" min="0" max="100" value="38" style="--pct:38%" data-slider aria-label="讲解比例" aria-valuenow="38" />
        </div>
        <div style="display:grid;grid-template-columns:100px 1fr;gap:10px;align-items:center">
          <span class="small muted">学段</span><div data-stage></div>
        </div>
        <div style="display:grid;grid-template-columns:100px 1fr;gap:10px;align-items:center">
          <span class="small muted">出题频率</span><div data-exercise></div>
        </div>
        <div style="display:grid;grid-template-columns:100px 1fr;gap:10px;align-items:center">
          <span class="small muted">错误处理</span><div data-errormode></div>
        </div>
        <div style="border-top:1px solid var(--line);margin-top:4px;padding-top:8px" data-toggles>
          ${state.teaching.filter((t) => t.label).map(toggleRow).join('')}
        </div>
      </div>`;
  }
  return `
    <div class="review-card">
      <dl class="kv" style="margin:0">
        <dt>角色</dt><dd>${esc(state.emoji)} ${esc(state.name)}</dd>
        <dt>称呼你</dt><dd>${esc(state.nickname)}</dd>
        <dt>口头禅</dt><dd>${esc(state.catchphrase)}</dd>
        <dt>学段</dt><dd>${esc(state.stage)}</dd>
        <dt>教法</dt><dd>讲解 ${state.teaching.find((x) => x.key === 'explain').value}% · 练习${esc(state.exercise)} · ${esc(state.errorMode)}</dd>
        <dt>开关</dt><dd>${state.teaching.filter((t) => t.label && t.on).map((t) => esc(t.label)).join('、') || '全部关闭'}</dd>
      </dl>
    </div>
    <p class="small muted" style="margin:12px 0 0">
      保存后，这个角色会有自己独立的记忆与画像，跟其他角色互不干扰。
    </p>`;
}

/* ---- learning surface (plan-first) ---- */
function learnSurface(root) {
  const pct = (v) => Math.round(v * 100);
  root.innerHTML = `
  <div class="app v-wiz">
    <aside class="steps">
      ${renderSteps()}
      <button class="btn ghost" style="margin-top:14px;height:28px;font-size:12px" data-back>← 返回角色</button>
    </aside>
    <main class="wiz-main">
      <div class="learn-head">
        ${avatar(state.name, state.emoji, 38)}
        <div style="flex:1">
          <h1>${esc(LESSON.course)}</h1>
          <div class="small muted">${esc(state.name)} · ${esc(state.stage)} · 本次约 35 分钟</div>
        </div>
        <button class="btn" data-profile>学习者画像</button>
      </div>

      <div class="learn">
        <div>
          <div class="goal">
            <div class="goal-k">今天的目标</div>
            <div class="goal-t">${esc(LESSON.goal)}</div>
          </div>

          <section class="card" style="padding:6px 18px 12px">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0 4px">
              <span style="font-size:13px;font-weight:600">知识点进度</span>
              <span class="small muted">4 个点 · 已完成 1 个</span>
            </div>
            <div class="kp-list">
              ${LESSON.points
                .map(
                  (k, i) => `
                <div class="kp ${k.state === 'done' ? 'is-done' : k.state === 'doing' ? 'is-doing' : ''}">
                  <span class="kp-mark">${k.state === 'done' ? '✓' : i + 1}</span>
                  <span>
                    <span class="kp-name">${esc(k.name)}</span>
                    <span class="kp-sub" style="display:block">${
                      k.state === 'done' ? '已掌握' : k.state === 'doing' ? '进行中 · 你自己讲一遍就算过' : '还没开始'
                    }</span>
                  </span>
                  <span class="mastery">
                    <span class="bar"><i style="width:${pct(k.mastery)}%"></i></span>
                    <span class="mastery-num">${pct(k.mastery)}%</span>
                  </span>
                </div>`
                )
                .join('')}
            </div>
          </section>

          <div class="start-teach">
            <button class="btn primary" data-start>从「${esc(LESSON.points[1].name)}」开始</button>
            <button class="btn" data-skip>先做两道题测一下</button>
          </div>
        </div>

        <aside>
          <div class="side-card card">
            <div class="side-title">今天该复习</div>
            ${LESSON.review
              .map(
                (r) => `<div class="side-item"><b>${esc(r.text)}</b><span class="pill-due">${esc(r.due)}</span>
                  <div class="why">因为上次在「${esc(r.point)}」卡住过</div></div>`
              )
              .join('')}
          </div>

          <div class="side-card card">
            <div class="side-title">你的高频错误</div>
            ${LESSON.errors
              .map(
                (e) => `<div class="side-item"><b>${esc(e.text)}</b>
                  <div class="why">${esc(e.point)} · ${esc(e.when)} · 出现 ${e.repeat} 次</div></div>`
              )
              .join('')}
          </div>

          <div class="side-card card">
            <div class="side-title">学习者画像</div>
            <div class="side-item"><div class="why">${esc(LESSON.profile.habit)}</div></div>
            <div class="side-item"><div class="why"><b>强项 · </b>${esc(LESSON.profile.strength)}</div></div>
            <div class="side-item"><div class="why"><b>薄弱 · </b>${esc(LESSON.profile.weakness)}</div></div>
          </div>
        </aside>
      </div>
    </main>
  </div>`;

  root.querySelectorAll('[data-start],[data-skip],[data-profile],[data-back]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.hasAttribute('data-back')) {
        state.learnMode = 'wizard';
        render(root);
        return;
      }
      window.__toast?.(b.textContent.trim());
    })
  );
}

function render(root) {
  if (state.learnMode === 'plan') {
    learnSurface(root);
    return;
  }

  const canNext = step < 3;
  const body = stepBody();

  root.innerHTML = `
  <div class="app v-wiz">
    <aside class="steps">
      ${renderSteps()}
      <button class="btn ghost" style="margin-top:14px;height:28px;font-size:12px" data-preview-learn>预览学习界面 →</button>
    </aside>
    <main class="wiz-main">
      <div class="wiz-head">
        <div class="wiz-kicker">新建角色 · 第 ${step + 1} / 4 步</div>
        <h1 class="wiz-title">${esc(STEPS[step].t)}</h1>
        <p class="wiz-sub">${esc(STEPS[step].s)}</p>
      </div>
      <section class="card wiz-body blur-bridge" data-wizbody>${body}</section>
      <div class="wiz-foot">
        <button class="btn ghost" data-prev ${step === 0 ? 'disabled' : ''}>← 上一步</button>
        <span style="flex:1"></span>
        ${canNext ? '<button class="btn primary" data-next>下一步 →</button>' : '<button class="btn primary" data-done>保存并开始学习</button>'}
      </div>
    </main>
  </div>`;

  // bind step-specific controls
  if (step === 0) {
    root.querySelectorAll('[data-tpl]').forEach((btn) =>
      btn.addEventListener('click', () => {
        applyPreset(btn.dataset.tpl);
        render(root);
      })
    );
    root.querySelectorAll('[data-in]').forEach((el) =>
      el.addEventListener('input', () => {
        state[el.dataset.in] = el.value;
      })
    );
  }
  if (step === 1) {
    state.dims.forEach((d) => {
      bindSlider(root, d.key, (k, v) => {
        const t = state.dims.find((x) => x.key === k);
        if (t) t.value = v;
      });
    });
  }
  if (step === 2) {
    const exp = root.querySelector('[data-dim="explain"] [data-slider]');
    const expVal = root.querySelector('[data-dim="explain"] [data-val]');
    exp.addEventListener('input', () => {
      const v = Number(exp.value);
      exp.style.setProperty('--pct', v + '%');
      exp.setAttribute('aria-valuenow', String(v));
      expVal.textContent = String(v);
      state.teaching.find((x) => x.key === 'explain').value = v;
    });
    root.querySelector('[data-stage]').innerHTML = segmented('stage', STAGE_OPTIONS, state.stage, '学段');
    root.querySelector('[data-exercise]').innerHTML = segmented('exercise', EXERCISE_OPTIONS, state.exercise, '出题频率');
    root.querySelector('[data-errormode]').innerHTML = segmented('error', ERROR_OPTIONS, state.errorMode, '错误处理');
    root.querySelectorAll('[data-segmented]').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-value]');
        if (!b) return;
        seg.querySelectorAll('[data-value]').forEach((x) => {
          x.classList.toggle('is-on', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
        const n = seg.dataset.segmented;
        if (n === 'stage') state.stage = b.dataset.value;
        if (n === 'exercise') state.exercise = b.dataset.value;
        if (n === 'error') state.errorMode = b.dataset.value;
      });
    });
    root.querySelectorAll('[data-toggle]').forEach((row) => {
      const input = row.querySelector('[data-switch]');
      input.addEventListener('change', () => {
        const t = state.teaching.find((x) => x.key === row.dataset.toggle);
        if (t) t.on = input.checked;
      });
    });
  }

  root.querySelector('[data-prev]')?.addEventListener('click', () => {
    if (step === 0) return;
    blurSwap(root.querySelector('[data-wizbody]'), () => {
      step -= 1;
      render(root);
    });
  });
  root.querySelector('[data-next]')?.addEventListener('click', () => {
    blurSwap(root.querySelector('[data-wizbody]'), () => {
      step += 1;
      render(root);
    });
  });
  root.querySelector('[data-done]')?.addEventListener('click', () => {
    window.__toast?.(`「${state.name}」已保存，开始学习`);
    state.learnMode = 'plan';
    render(root);
  });
  root.querySelector('[data-preview-learn]')?.addEventListener('click', () => {
    state.learnMode = 'plan';
    render(root);
  });
}

export function mount(root) {
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  step = 0;
  state.learnMode = 'wizard';
  applyPreset('senior');
  render(root);
}

