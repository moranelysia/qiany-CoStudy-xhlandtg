/* ==========================================================
   Variant C — "Companion"
   Axis: CONVERSATIONAL AUTHORING.
   You never touch a slider unless you want to. The AI interviews you
   and writes the card. Learning is a warm chat with a floating dock;
   the plan lives in a collapsible drawer so it never crowds the chat.
   Motion story: messages rise in; dock popover scales from its trigger.
   ========================================================== */
import { esc, sliderRow, toggleRow, segmented, avatar, bindSlider, blurSwap } from './ui.js';
import { DIMS, TEACHING, TEMPLATES, PRESETS, LESSON, REPLIES, PREVIEW_PROMPTS } from './data.js';

const STYLE = `/* Companion · 布局层 */
.v-comp {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(320px, 26vw, 400px);
  gap: clamp(16px, 1.6vw, 28px);
  align-items: start;
  padding-top: 4px;
}

.v-comp .chat-pane { padding: 20px 22px 24px; min-height: min(62vh, 620px); display: flex; flex-direction: column; }
.v-comp .comp-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.v-comp .comp-hero { padding: 2px 0 18px; }


.v-comp .thread { display: grid; gap: 9px; margin-bottom: 18px; align-content: start; }
.v-comp .msg { display: flex; gap: 8px; align-items: flex-end; animation: rise var(--dur-modal) var(--ease-out) both; }
.v-comp .msg.me { flex-direction: row-reverse; }
.v-comp .bubble {
  max-width: 78%; padding: 9px 13px;
  border-radius: 18px 18px 18px 5px;
  font-size: var(--fs-body); line-height: 1.55;
  background: var(--fill-1);
}
.v-comp .msg.me .bubble { background: var(--blue); color: #fff; border-radius: 18px 18px 5px 18px; }

.v-comp .quick { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 16px; }
.v-comp .quick button {
  border: 0; background: var(--fill-1); border-radius: var(--r-full);
  padding: 6px 12px; font-size: var(--fs-footnote); color: var(--label);
  cursor: pointer;
  transition: background-color var(--dur-tip) ease, transform var(--dur-press) var(--ease-out);
}
.v-comp .quick button:hover { background: var(--fill-2); }
.v-comp .quick button:active { transform: scale(0.97); }

.v-comp .composer { display: flex; gap: 8px; align-items: center; margin-top: auto; }
.v-comp .composer .input { flex: 1; }

/* 生成中的卡片 */
.v-comp .gen { position: sticky; top: 68px; padding: 16px 16px 18px; box-shadow: var(--shadow-sheet); border-radius: var(--r-xl); background: var(--bg-elevated); }
.v-comp .gen-head { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; }
.v-comp .gen-name { font-size: var(--fs-body); font-weight: 600; letter-spacing: -0.006em; }
.v-comp .gen-line { font-size: var(--fs-footnote); color: var(--label-2); }
.v-comp .chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 12px 0; }
.v-comp .chip { padding: 3px 8px; border-radius: var(--r-xs); background: var(--fill-1); font-size: var(--fs-caption); color: var(--label-2); }
.v-comp .chip b { font-weight: 600; color: var(--label); }
.v-comp .mini-dims { display: grid; gap: 0; margin-top: 4px; }
.v-comp .mini-dims .dim { padding: 6px 0; }
.v-comp .mini-dims .dim + .dim { border-top: 0.5px solid var(--separator); }
.v-comp .toggles { margin-top: 14px; padding-top: 4px; border-top: 0.5px solid var(--separator); }
.v-comp .toggles .switch-row { padding-left: 0; padding-right: 0; min-height: 40px; }
.v-comp .toggles .switch-row + .switch-row::before { left: 0; }
.v-comp .gen-foot { display: flex; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 0.5px solid var(--separator); }
.v-comp .gen-foot .btn { flex: 1; }

/* 学习界面：对话优先 */
.v-comp .learn-wrap { max-width: 760px; margin: 0 auto; position: relative; }
.v-comp .learn-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.v-comp .learn-top h1 { font-size: var(--fs-title2); letter-spacing: -0.018em; }
.v-comp .goal-mini { padding: 11px 14px; border-radius: var(--r-md); background: var(--blue-tint); font-size: var(--fs-subhead); margin-bottom: 18px; }
.v-comp .goal-mini b { color: var(--blue); font-weight: 600; }
.v-comp .learn-thread { display: grid; gap: 11px; padding-bottom: 64px; }
.v-comp .learn-msg { display: flex; gap: 9px; align-items: flex-start; animation: rise var(--dur-modal) var(--ease-out) both; }
.v-comp .learn-msg.me { flex-direction: row-reverse; }
.v-comp .learn-bubble {
  max-width: 80%; padding: 11px 14px;
  border-radius: 18px 18px 18px 5px;
  background: var(--bg-elevated); box-shadow: var(--shadow-1);
  font-size: var(--fs-body); line-height: 1.6;
}
.v-comp .learn-msg.me .learn-bubble { background: var(--blue); color: #fff; box-shadow: none; border-radius: 18px 18px 5px 18px; }

/* 浮动 dock：半透明材质 */
.v-comp .dock {
  position: sticky; bottom: 20px; margin-top: -54px;
  display: flex; align-items: center; gap: 4px; padding: 6px;
  background: rgba(255, 255, 255, 0.72);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-sheet);
  border-top: 1px solid rgba(255, 255, 255, 0.6);
  transition: background-color var(--dur-pop) ease;
}
.v-comp .dock .input { flex: 1; border: 0; background: transparent; box-shadow: none; padding: 7px 8px; }
.v-comp .dock .input:focus { background: transparent; box-shadow: none; }
.v-comp .dock-btn {
  width: 34px; height: 34px; border-radius: var(--r-full); border: 0;
  background: transparent; cursor: pointer; font-size: 15px;
  display: grid; place-items: center; color: var(--label-2);
  transition: background-color var(--dur-tip) ease, transform var(--dur-press) var(--ease-out);
}
.v-comp .dock-btn:hover { background: var(--fill-1); }
.v-comp .dock-btn:active { transform: scale(0.94); }
.v-comp .dock-btn.send { background: var(--blue); color: #fff; }
.v-comp .dock-btn.send:hover { background: var(--blue-press); }

.v-comp .drawer { margin-top: 16px; padding: 14px 16px; border-radius: var(--r-lg); background: var(--bg-elevated); }
.v-comp .drawer-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.v-comp .kp-mini { display: grid; gap: 9px; }
.v-comp .kp-row { display: grid; grid-template-columns: 1fr 80px; align-items: center; gap: 12px; font-size: var(--fs-subhead); }
.v-comp .bar { height: 4px; border-radius: var(--r-full); background: var(--fill-2); overflow: hidden; }
.v-comp .bar > i { display: block; height: 100%; background: var(--blue); border-radius: var(--r-full); transition: width var(--dur-modal) var(--ease-out); }
.v-comp .chip-due {
  margin-left: 6px; padding: 1px 6px; border-radius: var(--r-xs);
  background: var(--blue-tint); color: var(--blue); font-size: var(--fs-caption);
}
.v-comp .hidden { display: none; }

/* ---------- 全屏对话布局（ChatGPT 式） ---------- */
/* 窗口高度整块给对话：标题与目标固定在顶部，消息区自己滚动，输入条钉在底部。
   这样输入条不会再随页面滚走。 */
.app.v-comp {
  height: 100vh;
  max-width: 820px;
  margin: 0 auto;
  box-sizing: border-box;
  /* 顶部留出灵动岛的安全区：岛在 y=9~43，这里从 56px 起 */
  padding-top: 56px;
  padding-bottom: 16px;
  display: flex;
  flex-direction: column;
  grid-template-columns: none;
  gap: 0;
}

.v-comp .learn-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  position: static;
}

/* 顶部两块不参与滚动 */
.v-comp .learn-top,
.v-comp .goal-mini { flex: 0 0 auto; }

/* 消息区：唯一可滚动的区域 */
.v-comp .learn-thread {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 6px;
  margin-bottom: 14px;
}

/* 输入条钉在底部 */
.v-comp .dock {
  flex: 0 0 auto;
  margin-top: auto;
}

/* 抽屉展开时不要挤压消息区到不可用 */
.v-comp .drawer { flex: 0 0 auto; max-height: 38vh; overflow-y: auto; }
`;

const INTERVIEW = [
  { q: '先随便说说你想要什么样的伴学角色？一句话就行。', chips: ['温柔的、会耐心讲的', '严格一点、盯我学习的', '话少但很准的', '像同学一样一起讨论'] },
  { q: '好。你更希望它在你卡住的时候怎么做？', chips: ['给我提示，让我自己推出来', '直接讲清楚，省时间', '先问我是哪一步不会', '出个更简单的题让我试'] },
  { q: '明白了。它的语气你希望偏哪种？', chips: ['轻松日常', '温和克制', '正式一点', '像同龄朋友'] },
  { q: '最后，你平时几点学习、一次大概多久？我记进画像里。', chips: ['晚上 8 点后，35 分钟', '早上，20 分钟', '不固定，看状态', '周末集中两小时'] },
];

const KEYWORDS_TO_PRESET = {
  温柔: 'senior', 耐心: 'senior', 严格: 'coach', 盯: 'coach',
  话少: 'quiet', 准: 'quiet', 同学: 'peer', 讨论: 'peer', 朋友: 'neighbor',
};

let state = {
  mode: 'interview',
  step: 0,
  answers: [],
  name: '温柔学姐',
  emoji: '🌸',
  nickname: '同学',
  dims: JSON.parse(JSON.stringify(DIMS)),
  teaching: JSON.parse(JSON.stringify(TEACHING)),
  drawerOpen: false,
  messages: [],
  input: '',
};

function applyTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  state.name = t.name;
  state.emoji = t.emoji;
  const p = PRESETS[id] || {};
  state.dims.forEach((d) => {
    if (p[d.key] != null) d.value = p[d.key];
  });
}

function inferTemplate(text) {
  for (const k of Object.keys(KEYWORDS_TO_PRESET)) {
    if (text.includes(k)) return KEYWORDS_TO_PRESET[k];
  }
  return 'senior';
}

function compiledSummary() {
  const d = Object.fromEntries(state.dims.map((x) => [x.key, x.value]));
  const bands = [
    ['热情', d.warmth], ['正式', d.formality], ['幽默', d.humor], ['耐心', d.patience],
    ['严格', d.strict], ['主动', d.proactive], ['鼓励', d.praise], ['话量', d.verbosity],
    ['抽象', d.abstract], ['语速', d.tempo], ['亲和', d.closeness], ['稳定', d.stability],
  ];
  return bands;
}

function renderInterview(root) {
  const q = INTERVIEW[Math.min(state.step, INTERVIEW.length - 1)];
  const finished = state.step >= INTERVIEW.length;

  root.innerHTML = `
  <div class="nav">
    <div class="nav-inner">
      <span class="avatar" style="--sz:26px">✦</span>
      <span class="nav-title">创建角色</span>
      <span class="nav-sub">四个问题，我帮你写卡</span>
      <span class="nav-spacer"></span>
      <button class="btn sm" data-restart>重新聊</button>
    </div>
  </div>
  <div class="app v-comp">
    <main class="chat-pane card">
      <header class="comp-hero">
        <h1 class="comp-title">聊聊你想要的角色</h1>
        <p class="comp-sub">四个问题，我帮你生成角色卡。不想聊也可以直接拖右边的滑条。</p>
      </header>

      <div class="thread" data-thread>
        ${state.messages
          .map(
            (m) => `
          <div class="msg ${m.role}">
            ${m.role === 'ai' ? avatar(state.name, state.emoji, 26) : ''}
            <div class="bubble">${esc(m.text)}</div>
          </div>`
          )
          .join('')}
        ${
          finished
            ? `<div class="msg ai">${avatar(state.name, state.emoji, 26)}<div class="bubble">角色卡已经生成好了，在右边。想改哪一项直接拖滑条，或者继续跟我聊。</div></div>`
            : `<div class="msg ai">${avatar('伴', '✦', 26)}<div class="bubble">${esc(q.q)}</div></div>`
        }
      </div>

      ${
        finished
          ? `<div class="quick">
              <button data-restart>重新聊一遍</button>
              <button data-go-learn>开始学习 →</button>
            </div>`
          : `<div class="quick">
              ${q.chips.map((c) => `<button data-chip="${esc(c)}">${esc(c)}</button>`).join('')}
            </div>`
      }

      <div class="composer">
        <input class="input" placeholder="${finished ? '想补充什么？' : '也可以自己打字…'}" data-input value="${esc(state.input)}" />
        <button class="btn primary" data-send>发送</button>
      </div>
    </main>

    <aside class="gen card">
      <div class="gen-head">
        ${avatar(state.name, state.emoji, 40)}
        <div>
          <div class="gen-name">${esc(state.name)}</div>
          <div class="gen-line">${state.step === 0 ? '还没开始塑造' : `第 ${Math.min(state.step, 4)} / 4 步`}</div>
        </div>
      </div>

      <div class="chips">
        ${compiledSummary()
          .map(([k, v]) => `<span class="chip">${k} <b>${v}</b></span>`)
          .join('')}
      </div>

      <div class="mini-dims">
        ${state.dims.slice(0, 6).map((d) => sliderRow(d)).join('')}
      </div>
      <p class="small muted" style="margin:8px 0 0">仅显示 6 项，保存后可在完整编辑器里调剩余 6 项</p>

      <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px">
        ${state.teaching.filter((t) => t.label).map(toggleRow).join('')}
      </div>

      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn ghost" style="flex:1" data-reset>恢复中性</button>
        <button class="btn primary" style="flex:1" data-save>保存</button>
      </div>
    </aside>
  </div>`;

  // bind
  state.dims.slice(0, 6).forEach((d) =>
    bindSlider(root, d.key, (k, v) => {
      const t = state.dims.find((x) => x.key === k);
      if (t) t.value = v;
    })
  );
  root.querySelectorAll('[data-toggle]').forEach((row) => {
    const input = row.querySelector('[data-switch]');
    input.addEventListener('change', () => {
      const t = state.teaching.find((x) => x.key === row.dataset.toggle);
      if (t) t.on = input.checked;
    });
  });

  const input = root.querySelector('[data-input]');
  input.addEventListener('input', () => (state.input = input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  function send(text) {
    const value = (text ?? state.input).trim();
    if (!value) return;
    state.messages.push({ role: 'me', text: value });
    if (state.step < INTERVIEW.length) {
      const tpl = inferTemplate(value);
      applyTemplate(tpl);
      state.answers.push(value);
      state.step += 1;
      if (state.step >= INTERVIEW.length) {
        state.messages.push({ role: 'ai', text: '都记下了。我按你说的塑造了一个角色，你可以继续微调。' });
      }
    } else {
      state.messages.push({ role: 'ai', text: '收到，我记下了。' });
    }
    state.input = '';
    renderInterview(root);
  }

  root.querySelector('[data-send]').addEventListener('click', () => send());
  root.querySelectorAll('[data-chip]').forEach((b) =>
    b.addEventListener('click', () => send(b.dataset.chip))
  );
  root.querySelector('[data-restart]')?.addEventListener('click', () => {
    state.step = 0;
    state.messages = [];
    state.answers = [];
    applyTemplate('senior');
    renderInterview(root);
  });
  root.querySelector('[data-go-learn]')?.addEventListener('click', () => {
    state.mode = 'learn';
    renderLearn(root);
  });
  root.querySelector('[data-reset]').addEventListener('click', () => {
    state.dims.forEach((d) => (d.value = 50));
    renderInterview(root);
  });
  root.querySelector('[data-save]').addEventListener('click', () => {
    window.__toast?.(`「${state.name}」已保存`);
  });
}

function renderLearn(root) {
  const reply = REPLIES.senior;
  root.innerHTML = `
  <div class="app v-comp" style="grid-template-columns:1fr;max-width:820px">
    <div class="learn-wrap">
      <div class="learn-top">
        ${avatar(state.name, state.emoji, 34)}
        <div style="flex:1">
          <h1>${esc(LESSON.course)}</h1>
          <div class="small muted">${esc(state.name)} · 已连续陪你学 3 天</div>
        </div>
        <button class="btn ghost" data-back>改角色</button>
      </div>

      <div class="goal-mini"><b>今天的目标</b> ${esc(LESSON.goal)}</div>

      <div class="learn-thread" data-thread>
        <div class="learn-msg ai">
          ${avatar(state.name, state.emoji, 28)}
          <div class="learn-bubble">
            <div class="learn-who">${esc(state.name)}</div>
            早上好。先提醒一句：昨天你在<b>移项符号</b>上错过两次，今天遇到移项我会盯着。<br /><br />
            昨天你停在「判别式 Δ 的意义」这一节。我们是接着讲，还是先做两道题看看还记得多少？
          </div>
        </div>
        <div class="learn-msg me">
          <div class="learn-bubble"><div class="learn-who" style="color:rgba(255,255,255,.6)">我</div>先做题吧，我怕我忘了。</div>
        </div>
        <div class="learn-msg ai">
          ${avatar(state.name, state.emoji, 28)}
          <div class="learn-bubble">
            <div class="learn-who">${esc(state.name)}</div>
            好，这道你先自己看：<br /><br />
            <b>x² − 2x + 5 = 0</b> 有几个实根？<br /><br />
            别急着算，先告诉我你打算用哪个判断条件。
          </div>
        </div>
      </div>

      <div class="drawer ${state.drawerOpen ? '' : 'hidden'}" data-drawer>
        <div class="drawer-head">
          <span style="font-size:12.5px;font-weight:600">学习计划</span>
          <button class="btn ghost" style="height:22px;padding:0 7px;font-size:11px" data-close>收起</button>
        </div>
        <div class="kp-mini">
          ${LESSON.points
            .map(
              (k) => `
            <div class="kp-row">
              <span>${esc(k.name)}${k.state === 'doing' ? '<span class="chip-due">进行中</span>' : ''}</span>
              <span class="bar"><i style="width:${Math.round(k.mastery * 100)}%"></i></span>
            </div>`
            )
            .join('')}
        </div>
        <div style="margin-top:11px;padding-top:9px;border-top:1px dashed var(--line)">
          <div class="small muted" style="margin-bottom:5px">今天该复习</div>
          ${LESSON.review.map((r) => `<div class="small">· ${esc(r.text)}<span class="chip-due">${esc(r.due)}</span></div>`).join('')}
        </div>
      </div>

      <div class="dock">
        <button class="dock-btn" data-toggle-drawer title="学习计划">☰</button>
        <input class="input" placeholder="说你的思路…" />
        <button class="dock-btn" title="出题" style="font-size:13px">题</button>
        <button class="dock-btn send" title="发送">↑</button>
      </div>
    </div>
  </div>`;

  root.querySelector('[data-back]').addEventListener('click', () => {
    state.mode = 'interview';
    renderInterview(root);
  });
  root.querySelector('[data-toggle-drawer]').addEventListener('click', () => {
    state.drawerOpen = !state.drawerOpen;
    root.querySelector('[data-drawer]').classList.toggle('hidden', !state.drawerOpen);
  });
  root.querySelector('[data-close]')?.addEventListener('click', () => {
    state.drawerOpen = false;
    root.querySelector('[data-drawer]').classList.add('hidden');
  });
  root.querySelectorAll('.dock-btn:not([data-toggle-drawer])').forEach((b) =>
    b.addEventListener('click', () => window.__toast?.(b.title || '操作'))
  );
}

export function mount(root) {
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  state = {
    mode: 'interview',
    step: 0,
    answers: [],
    name: '温柔学姐',
    emoji: '🌸',
    nickname: '同学',
    dims: JSON.parse(JSON.stringify(DIMS)),
    teaching: JSON.parse(JSON.stringify(TEACHING)),
    drawerOpen: false,
    messages: [],
    input: '',
  };
  applyTemplate('senior');
  renderInterview(root);
}


