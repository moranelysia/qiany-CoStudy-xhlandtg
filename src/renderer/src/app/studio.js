/* ==========================================================
   Variant A — "Studio"
   Axis: DIRECT MANIPULATION.
   Everything on one screen. Sliders on the left, live preview on
   the right, card list in a rail. Nothing is hidden behind steps.
   Motion story: only press feedback, slider thumb, and a blur
   bridge on the preview text.
   ========================================================== */
import { esc, sliderRow, toggleRow, segmented, avatar, bindSlider, blurSwap, syncSlider } from './ui.js';
import { DIMS, TEACHING, TEMPLATES, PRESETS, PREVIEW_PROMPTS, REPLIES, LESSON, STAGE_OPTIONS, EXERCISE_OPTIONS, ERROR_OPTIONS } from './data.js';

const STYLE = `/* Studio · 布局层（原子样式来自 tokens.css） */
.v-studio {
  display: grid;
  grid-template-columns:
    clamp(200px, 16vw, 260px)
    minmax(0, 1fr)
    clamp(320px, 26vw, 420px);
  gap: clamp(16px, 1.6vw, 28px);
  align-items: start;
  padding-top: 4px;
}

/* 左栏 */
.v-studio .rail { position: sticky; top: 68px; }
.v-studio .rail-title { font-size: var(--fs-footnote); font-weight: 500; color: var(--label-2); margin: 0 0 7px 6px; }
.v-studio .rail-foot { margin-top: 20px; padding-top: 16px; border-top: 0.5px solid var(--separator); }
.v-studio .card-item {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 9px 11px; border: 0; border-radius: var(--r-md);
  background: transparent; cursor: pointer; text-align: left;
  transition: background-color var(--dur-tip) ease, transform var(--dur-press) var(--ease-out);
}
.v-studio .card-item:hover { background: var(--fill-1); }
.v-studio .card-item:active { transform: scale(0.985); }
.v-studio .card-item.is-on { background: var(--bg-elevated); box-shadow: var(--shadow-1); }
.v-studio .card-meta { min-width: 0; }
.v-studio .card-name { display: block; font-size: var(--fs-body); font-weight: 600; letter-spacing: -0.006em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-studio .card-line { display: block; font-size: var(--fs-footnote); color: var(--label-2); white-space: normal; overflow: visible; line-height: 1.4; }

/* 中栏 */
.v-studio .col-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.v-studio .col-title { font-family: var(--font-display); font-size: var(--fs-title1); line-height: 1.15; letter-spacing: -0.021em; font-weight: 600; }
.v-studio .panel { padding: 2px 16px 14px; }
.v-studio .panel + .panel { margin-top: 16px; }
.v-studio .panel-head { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; margin-bottom: 2px; }
.v-studio .panel-name { font-size: var(--fs-footnote); font-weight: 500; color: var(--label-2); }
.v-studio .dims { display: grid; gap: 0; }
.v-studio .dims .dim + .dim { border-top: 0.5px solid var(--separator); }
.v-studio .field-label { display: block; font-size: var(--fs-footnote); color: var(--label-2); margin-bottom: 5px; }

/* 右栏：预览作为浮起的面 */
.v-studio .preview {
  position: sticky; top: 68px;
  /* 背景与圆角交给全局设计系统（panel-gradient / squircle）。
     这里绝不能写 background 简写 —— 它会把玻璃渐变清成纯白，
     于是圆角外面露出一条白边。 */
  padding: 16px 16px 18px;
}
.v-studio .prev-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
.v-studio .prev-title { font-size: var(--fs-footnote); font-weight: 500; color: var(--label-2); }

/* iOS 消息气泡 */
.v-studio .ask-wrap { display: flex; justify-content: flex-end; margin-bottom: 9px; }
.v-studio .bubble-ask {
  max-width: 86%; padding: 9px 13px;
  border-radius: 18px 18px 5px 18px;
  background: var(--blue); color: #fff;
  font-size: var(--fs-subhead); line-height: 1.45;
}
.v-studio .reply {
  padding: 12px 14px;
  border-radius: 18px 18px 18px 5px;
  background: var(--fill-1);
  font-size: var(--fs-body); line-height: 1.55;
  min-height: 128px;
}
.v-studio .reply-name { font-size: var(--fs-caption); font-weight: 600; color: var(--label-2); margin-bottom: 4px; }
.v-studio .ask-picker { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 4px; }
.v-studio .ask-chip {
  border: 0; background: var(--fill-1); border-radius: var(--r-full);
  padding: 5px 11px; font-size: var(--fs-caption); color: var(--label-2);
  cursor: pointer; transition: background-color var(--dur-tip) ease, transform var(--dur-press) var(--ease-out);
}
.v-studio .ask-chip:hover { background: var(--fill-2); }
.v-studio .ask-chip:active { transform: scale(0.97); }
.v-studio .ask-chip.is-on { background: var(--label); color: #fff; }

.v-studio .prev-compiled { margin-top: 14px; padding-top: 13px; border-top: 0.5px solid var(--separator); }
.v-studio .compiled-text {
  font-size: var(--fs-caption); line-height: 1.6; color: var(--label-2);
  background: var(--fill-1); border: 0; border-radius: var(--r-sm);
  padding: 10px 11px; max-height: 168px; overflow: auto; white-space: pre-wrap;
}
.v-studio .footer-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--hairline); }
.v-studio .footer-bar .grow { flex: 1 0 100%; order: -1; height: 0; }

/* 学习界面 */
.v-studio .learn-msg-row { display: flex; justify-content: flex-end; }
.v-studio .learn-bubble-ai {
  padding: 12px 14px; border-radius: 18px 18px 18px 5px;
  background: var(--fill-1); font-size: var(--fs-body); line-height: 1.6;
}
.v-studio .kp-line { display: grid; grid-template-columns: 20px 1fr 78px; gap: 10px; align-items: center; padding: 7px 0; }
.v-studio .kp-line + .kp-line { border-top: 0.5px solid var(--separator); }
.v-studio .kp-name { font-size: var(--fs-subhead); letter-spacing: -0.004em; }
.v-studio .bar { height: 5px; border-radius: var(--r-full); background: var(--fill-2); overflow: hidden; }
.v-studio .bar > i { display: block; height: 100%; border-radius: var(--r-full); background: var(--blue); transition: width var(--dur-modal) var(--ease-out); }
.v-studio .side-block + .side-block { border-top: 0.5px solid var(--separator); padding-top: 12px; margin-top: 12px; }
`;

/* ---------- state ---------- */
let state = {
  dims: JSON.parse(JSON.stringify(DIMS)),
  teaching: JSON.parse(JSON.stringify(TEACHING)),
  activeCard: 'senior',
  name: '温柔学姐',
  emoji: '🌸',
  stage: '高中',
  exercise: '中',
  errorMode: '立刻纠正',
  nickname: '同学',
  catchphrase: '来，我们一起看看',
  askIdx: 0,
  view: 'edit',
};

function currentPreset() {
  return PRESETS[state.activeCard] || PRESETS.senior;
}

/* ---------- compiled prompt preview (the real product behaviour) ---------- */
function compile() {
  const d = Object.fromEntries(state.dims.map((x) => [x.key, x.value]));
  const out = [];
  const band = (v) => (v >= 75 ? 2 : v >= 55 ? 1 : v <= 25 ? -2 : v <= 45 ? -1 : 0);

  const lines = {
    warmth: [
      '语气克制、平实，不用感叹表达情绪',
      '语气自然，热情但不刻意',
      '语气积极有活力（不必浮夸），会为对方的进展高兴',
    ],
    formality: [
      '说话轻松、不端着，尽量口语',
      '说话自然，适度口语',
      '用词正式、句子完整，称呼对方时用敬称',
    ],
    humor: [
      '不用玩笑和段子，保持直接',
      '偶尔用一句类比缓和气氛',
      '常用类比和玩笑调节气氛，但玩笑不能盖过知识点',
    ],
    patience: [
      '一次讲清，没懂就换方法，不反复重述',
      '同一概念最多换两种说法',
      '有耐心，同一概念可以换三种以上说法反复陪讲，直到对方真的懂',
    ],
    strict: [
      '对错误要宽容，重点是让他继续往前走，不反复纠错',
      '指出错误但语气平和，先肯定做对的部分',
      '对错误要求严格，必须说清错在哪一步、为什么错',
    ],
    proactive: [
      '等对方提问，不主动扩展话题',
      '在明显卡住时主动给一个提示',
      '主动提问、主动安排步骤、主动检查理解程度',
    ],
    praise: [
      '很少夸奖，用进度本身作为反馈',
      '做对时给一句简短肯定',
      '正反馈密度高，会明确指出对方哪一步想得对',
    ],
    verbosity: [
      '回答尽量短，一次只说一件事',
      '回答长度中等，控制在三四句',
      '回答可以详细，会把背景和来龙去脉讲清',
    ],
    abstract: [
      '从具体例子切入，先给一个能摸到的场景，再抽象',
      '例子和原理各占一半',
      '直接从原理和定义切入，例子只作验证',
    ],
    tempo: [
      '句子偏长、节奏舒缓，允许停顿',
      '节奏自然',
      '句子短促、干脆利落，不铺垫',
    ],
    closeness: [
      '保持礼貌距离，不谈学习之外的事',
      '适度关心，偶尔问一句状态',
      '会用亲昵称呼，会关心对方的学习状态和情绪',
    ],
    stability: [
      '语气有起伏，情绪会外显',
      '语气平稳，偶有起伏',
      '语气始终平和稳定，不因对方情绪大幅波动',
    ],
  };

  out.push(`你是「${state.name}」，一位伴学角色。`);
  out.push(`称呼学习者「${state.nickname}」。${state.catchphrase ? `常用开场：「${state.catchphrase}」。` : ''}`);
  const picked = [];
  for (const key of Object.keys(lines)) {
    const b = band(d[key] ?? 50);
    if (b !== 0 && lines[key][b + 1]) picked.push(lines[key][b + 1]);
  }
  if (picked.length) out.push('你的性格：' + picked.join('；') + '。');

  const t = Object.fromEntries(state.teaching.map((x) => [x.key, x]));
  const exp = t.explain.value;
  out.push(
    `教学取向：${
      exp < 25 ? '以提问引导为主，尽量不直接给答案' : exp > 75 ? '以讲解为主，讲完再让对方复述' : '讲解与提问各占一半'
    }。学段：${state.stage}。练习量：${state.exercise}。错误处理：${state.errorMode}。`
  );
  if (t.socratic.on) out.push('优先用反问推进，让对方自己说出下一步。');
  if (t.diagnose.on) out.push('开始一个新知识点前，先用两三个问题探测真实水平。');
  if (t.review.on) out.push('如果上次有没弄懂的地方，主动提一句，不要等对方想起来。');
  out.push('【硬约束】全年龄向：不做心理诊断、不索取真实个人信息、不建立情感依赖话术、不适龄内容一律拒绝。');
  return out.join('\n\n');
}

/* ---------- reply selection: template preset + live slider influence ---------- */
function pickReply() {
  const preset = currentPreset();
  const d = Object.fromEntries(state.dims.map((x) => [x.key, x.value]));
  const pool = REPLIES[state.activeCard] || REPLIES.senior;
  let text = pool[state.askIdx % pool.length];

  // make slider changes visibly affect the reply (so the preview is honest)
  if (d.verbosity < 30 && text.length > 90) {
    text = text.split(/[。？！]/)[0] + '。';
  }
  if (d.warmth > 80 && !/[！~～]/.test(text)) {
    text = text.replace(/。$/, '。慢慢来，不急。');
  }
  if (d.strict > 75 && !/^(先|别|不)/.test(text)) {
    text = '先把思路写下来。' + text;
  }
  if (d.formality > 70) {
    text = text.replace(/别急，/g, '不必着急，').replace(/诶/g, '');
  }
  return text;
}

export function mount(root) {
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);
  state.view = 'edit';
  paint(root);
}

let mountRoot = null;
function paint(root) {
  mountRoot = root;
  if (state.view === 'learn') renderLearn(root);
  else renderEditor(root);
}

/* ---------- learning surface: chat + plan side by side ---------- */
function renderLearn(root) {
  const pct = (v) => Math.round(v * 100);
  root.innerHTML = `
  <div class="nav">
    <div class="nav-inner">
      <span class="avatar" style="--sz:26px">${state.emoji}</span>
      <span class="nav-title">${esc(LESSON.course)}</span>
      <span class="nav-sub">${esc(state.name)} · 今天第 2 次会话</span>
      <span class="nav-spacer"></span>
      <button class="btn sm" data-back>改角色</button>
    </div>
  </div>
  <div class="app v-studio" style="grid-template-columns: minmax(0,1fr) 372px">
    <main style="min-width:0">
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:14px">
        ${avatar(state.name, state.emoji, 36)}
        <div style="flex:1">
          <h1 style="font-size:17px">${esc(LESSON.course)}</h1>
          <div class="small muted">${esc(state.name)} · ${esc(state.stage)} · 今天第 2 次会话</div>
        </div>
        <button class="btn ghost" data-back>← 改角色</button>
      </div>

      <div class="panel card" style="margin-bottom:12px">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span class="tag">今日目标</span>
          <span style="font-size:13.5px;flex:1">${esc(LESSON.goal)}</span>
        </div>
      </div>

      <div class="panel card">
        <div class="panel-head"><span class="panel-name">对话</span><span class="small muted">${esc(state.name)} 记得上次的错</span></div>
        <div style="display:grid;gap:10px;margin-top:12px">
          <div class="ask-wrap" style="margin:0">
            <div class="bubble-ask">先做题吧，我怕我忘了。</div>
          </div>
          <div class="reply" style="min-height:0">
            <div class="reply-name">${esc(state.name)}</div>
            <div>好。这道你先自己看：<b>x² − 2x + 5 = 0</b> 有几个实根？<br /><br />
            别急着算，先告诉我你打算用哪个判断条件。</div>
          </div>
          <div class="ask-wrap" style="margin:0">
            <div class="bubble-ask">判别式吧……但我不确定 Δ 小于 0 是什么情况。</div>
          </div>
          <div class="reply blur-bridge" data-reply style="min-height:0">
            <div class="reply-name">${esc(state.name)}</div>
            <div data-replytext>这个「不确定」很关键，我们停一下。Δ = (−2)² − 4·1·5 = −16，是负数。
              你先说说：一个平方数有可能等于负数吗？</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <input class="input" placeholder="说说你的思路…" style="flex:1" />
          <button class="btn primary" data-send>发送</button>
        </div>
      </div>
    </main>

    <aside>
      <div class="panel card">
        <div class="panel-head"><span class="panel-name">知识点进度</span><span class="small muted">${LESSON.points.length} 个</span></div>
        <div style="display:grid;gap:9px;margin-top:12px">
          ${LESSON.points
            .map(
              (k, i) => `
            <div style="display:grid;grid-template-columns:20px 1fr 78px;gap:9px;align-items:center">
              <span style="font-size:11px;color:${k.state === 'done' ? 'var(--ok)' : 'var(--ink-3)'}">${k.state === 'done' ? '✓' : i + 1}</span>
              <span style="font-size:12.5px;${k.state === 'doing' ? 'font-weight:600' : ''}">${esc(k.name)}</span>
              <span style="display:flex;align-items:center;gap:6px">
                <span style="flex:1;height:5px;border-radius:999px;background:var(--line);overflow:hidden">
                  <i style="display:block;height:100%;width:${pct(k.mastery)}%;background:var(--ink);border-radius:999px"></i>
                </span>
                <span style="font-size:10.5px;color:var(--ink-3);width:26px;text-align:right">${pct(k.mastery)}%</span>
              </span>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="panel card">
        <div class="panel-head"><span class="panel-name">今天该复习</span></div>
        <div style="display:grid;gap:8px;margin-top:10px">
          ${LESSON.review
            .map(
              (r) => `<div style="font-size:12.5px"><b>${esc(r.text)}</b>
                <span class="tag" style="height:18px;font-size:10px;margin-left:5px">${esc(r.due)}</span>
                <div class="small muted">因为上次在「${esc(r.point)}」卡住过</div></div>`
            )
            .join('')}
        </div>
      </div>

      <div class="panel card">
        <div class="panel-head"><span class="panel-name">你的高频错误</span></div>
        <div style="display:grid;gap:8px;margin-top:10px">
          ${LESSON.errors
            .map(
              (e) => `<div style="font-size:12.5px"><b>${esc(e.text)}</b>
                <div class="small muted">${esc(e.point)} · ${esc(e.when)} · 出现 ${e.repeat} 次</div></div>`
            )
            .join('')}
        </div>
      </div>

      <div class="panel card">
        <div class="panel-head"><span class="panel-name">学习者画像</span></div>
        <div style="display:grid;gap:7px;margin-top:10px;font-size:12.5px">
          <div><span class="muted">习惯</span> ${esc(LESSON.profile.habit)}</div>
          <div><span class="muted">强项</span> ${esc(LESSON.profile.strength)}</div>
          <div><span class="muted">薄弱</span> ${esc(LESSON.profile.weakness)}</div>
          <div><span class="muted">节奏</span> ${esc(LESSON.profile.pace)}</div>
        </div>
      </div>
    </aside>
  </div>`;

  root.querySelector('[data-back]').addEventListener('click', () => {
    state.view = 'edit';
    paint(root);
  });
  root.querySelector('[data-send]').addEventListener('click', () =>
    window.__toast?.(`${state.name} 正在判断你卡在哪一步…`)
  );
}

function renderEditor(root) {
  root.innerHTML = `
  <div class="nav">
    <div class="nav-inner">
      <span class="nav-spacer"></span>
      <button class="btn sm" data-ai>AI 帮我写</button>
      <button class="btn sm primary" data-save>保存</button>
    </div>
  </div>
  <div class="app v-studio">
    <header class="hero">
      <h1 class="hero-title grad-text">先造一个 TA，<br />再一起学。</h1>
      <p class="hero-sub">12 个性格维度决定 TA 怎么讲、怎么练、怎么纠错 —— 不是换皮，是换教法。</p>
      <span class="hero-pill">
        <b>性格</b><span class="sep"></span><b>教法</b><span class="sep"></span><b>记忆</b>
      </span>
    </header>
    <aside class="rail">
      <div class="rail-head">
        <span class="rail-title">我的角色</span>
        <button class="btn ghost" style="height:26px;padding:0 8px;font-size:12px" data-new>+ 新建</button>
      </div>
      <div data-cards></div>
      <div class="rail-foot">
        <p class="small muted" style="margin:0 0 6px">模板起步</p>
        <div data-templates style="display:grid;gap:4px"></div>
      </div>
    </aside>

    <main>


      <section class="panel card">
        <div class="panel-head">
          <span class="panel-name">身份</span>
          <span class="small muted">这些会进入提示词第一层</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          <label style="display:block">
            <span class="small muted">角色名</span>
            <input class="input" data-in="name" value="温柔学姐" />
          </label>
          <label style="display:block">
            <span class="small muted">怎么称呼学习者</span>
            <input class="input" data-in="nickname" value="同学" />
          </label>
          <label style="display:block">
            <span class="small muted">口头禅</span>
            <input class="input" data-in="catchphrase" value="来，我们一起看看" />
          </label>
          <div style="grid-column: 1 / -1">
            <span class="small muted">学段</span>
            <div data-stage style="margin-top:4px"></div>
          </div>
        </div>
      </section>

      <section class="panel card">
        <div class="panel-head">
          <span class="panel-name">性格维度</span>
          <button class="btn ghost" style="height:26px;padding:0 8px;font-size:12px" data-neutral>恢复中性</button>
        </div>
        <div class="dims" data-dims></div>
      </section>

      <section class="panel card">
        <div class="panel-name">教学取向</div>
        <div class="teach-grid">
          <div class="dim" data-dim="explain">
            <div class="dim-head">
              <span class="dim-name">讲解比例</span>
              <span class="dim-poles small muted">纯提问 ↔ 纯讲解</span>
              <span class="dim-val" data-val>38</span>
            </div>
            <div class="ice-range">
              <div class="ice-track">
                <div class="ice-fill" data-fill style="width:38%"></div>
              </div>
              <div class="ice-thumb" data-thumb style="--pct:38%"></div>
              <input type="range" class="ice-input" min="0" max="100" value="38" style="--pct:38%" data-slider
                     aria-label="讲解比例" aria-valuenow="38" />
            </div>
          </div>
          <div class="teach-line">
            <span class="teach-label">出题频率</span>
            <div data-exercise></div>
          </div>
          <div class="teach-line">
            <span class="teach-label">错误处理</span>
            <div data-errormode></div>
          </div>
          <div data-toggles style="margin-top:2px"></div>
        </div>
      </section>
    </main>

    <aside class="preview">
      <div class="prev-head">
        <span class="prev-title">实时预览</span>
        <span class="small muted" data-hint>换个问题看反应</span>
      </div>

      <div class="ask-wrap"><div class="bubble-ask" data-ask>我不懂这道题，x² − 5x + 6 = 0 怎么解？</div></div>

      <div class="ask-picker" data-asks></div>

      <div class="reply blur-bridge" data-reply>
        <div class="reply-name" data-replyname>温柔学姐</div>
        <div data-replytext></div>
      </div>

      <div class="prev-compiled">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span class="small" style="font-weight:600">编译后的提示词</span>
          <button class="btn ghost" style="height:24px;padding:0 8px;font-size:11px" data-recompile>重新编译</button>
        </div>
        <div class="compiled-text" data-compiled></div>
      </div>

      <div class="footer-bar">
        <button class="btn" data-discard>放弃</button>
        <span class="grow"></span>
        <button class="btn" data-ai>AI 帮我写</button>
        <button class="btn primary" data-save>保存角色</button>
        <button class="btn" data-golearn>去学习 →</button>
      </div>
    </aside>
  </div>`;

  /* ---------- render: cards + templates ---------- */
  const cardsEl = root.querySelector('[data-cards]');
  cardsEl.innerHTML = TEMPLATES.slice(0, 3)
    .map(
      (t) => `
    <button class="card-item${t.id === state.activeCard ? ' is-on' : ''}" data-card="${t.id}">
      ${avatar(t.name, t.emoji, 30)}
      <span class="card-meta">
        <span class="card-name">${esc(t.name)}</span>
        <span class="card-line">${esc(t.line)}</span>
      </span>
    </button>`
    )
    .join('');

  const tplEl = root.querySelector('[data-templates]');
  tplEl.innerHTML = TEMPLATES.slice(3)
    .map(
      (t) => `
    <button class="card-item" data-template="${t.id}" style="padding:6px 8px">
      <span class="card-meta">
        <span class="card-name" style="font-size:12.5px">${esc(t.name)}</span>
      </span>
    </button>`
    )
    .join('');

  /* ---------- render: dims ---------- */
  const dimsEl = root.querySelector('[data-dims]');
  // 常见路径先摆出来：只显示 5 个最常调的维度，其余收进「更多」
  const PRIMARY = ['warmth', 'patience', 'strict', 'humor', 'verbosity'];
  const primary = state.dims.filter((d) => PRIMARY.includes(d.key));
  const rest = state.dims.filter((d) => !PRIMARY.includes(d.key));
  dimsEl.innerHTML =
    primary.map((d) => sliderRow(d)).join('') +
    `<div class="more-wrap">
       <button class="more-btn" data-more aria-expanded="false">还有 ${rest.length} 个维度（不常用）</button>
       <div class="more-body" data-morebody>${rest.map((d) => sliderRow(d)).join('')}</div>
     </div>`;
  state.dims.forEach((d) => bindSlider(root, d.key, onDimChange));

  // teaching explain slider (lives outside state.dims)
  const expInput = root.querySelector('[data-dim="explain"] [data-slider]');
  expInput.addEventListener('input', () => {
    const v = Number(expInput.value);
    syncSlider(root, 'explain', v);
    const t = state.teaching.find((x) => x.key === 'explain');
    if (t) t.value = v;
    refreshPreview();
  });

  /* ---------- render: segmented + switches ---------- */
  root.querySelector('[data-stage]').innerHTML = segmented('stage', STAGE_OPTIONS, state.stage, '学段');
  root.querySelector('[data-exercise]').innerHTML = segmented('exercise', EXERCISE_OPTIONS, state.exercise, '出题频率');
  root.querySelector('[data-errormode]').innerHTML = segmented('error', ERROR_OPTIONS, state.errorMode, '错误处理');
  root.querySelector('[data-toggles]').innerHTML = state.teaching.filter((t) => t.label).map(toggleRow).join('');

  /* ---------- render: ask chips ---------- */
  const asksEl = root.querySelector('[data-asks]');
  asksEl.innerHTML = PREVIEW_PROMPTS.map(
    (p, i) => `<button class="ask-chip${i === state.askIdx ? ' is-on' : ''}" data-ask-idx="${i}">${esc(p.slice(0, 18))}…</button>`
  ).join('');

  /* ---------- wiring ---------- */
  // 撤销栈：每次拖动都留一条退路（apple-design §16.2 Agency）
  const undoStack = [];
  const lastValues = Object.fromEntries(state.dims.map((d) => [d.key, d.value]));

  function pushUndo(key, oldValue) {
    if (oldValue === undefined) return;
    undoStack.push({ key, oldValue });
    if (undoStack.length > 30) undoStack.shift();
    renderUndo();
  }

  // 撤销条的 UI 已按需求移除：
  //   「已修改 N 处 / 撤销」原本会在每次拖动滑条时插进导航栏，用户明确不要。
  //   撤销栈仍然记录（pushUndo 照旧），只是不再渲染任何界面。
  function renderUndo() {
    root.querySelector('.undo-bar')?.remove();
  }

  function onDimChange(key, v) {
    const d = state.dims.find((x) => x.key === key);
    if (!d) return;
    if (d.value !== v) pushUndo(key, d.value);
    d.value = v;
    lastValues[key] = v;
    refreshPreview();
  }

  function refreshPreview() {
    const replyEl = root.querySelector('[data-reply]');
    blurSwap(replyEl, () => {
      root.querySelector('[data-replytext]').textContent = pickReply();
      root.querySelector('[data-compiled]').textContent = compile();
    });
  }

  function paintAll() {
    root.querySelector('[data-cardtitle]')?.replaceChildren(state.name);
    root.querySelector('[data-replyname]').textContent = state.name;
    root.querySelector('[data-replytext]').textContent = pickReply();
    root.querySelector('[data-compiled]').textContent = compile();
    root.querySelector('[data-ask]').textContent = PREVIEW_PROMPTS[state.askIdx];
  }

  // cards
  cardsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-card]');
    if (!btn) return;
    applyTemplate(btn.dataset.card);
  });
  tplEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-template]');
    if (!btn) return;
    applyTemplate(btn.dataset.template);
  });

  /** 同步"当前选中的角色"高亮：我的角色 + 模板起步 两张列表一起管 */
  function markSelection(id) {
    root.querySelectorAll('[data-card]').forEach((el) => el.classList.toggle('is-on', el.dataset.card === id));
    root.querySelectorAll('[data-template]').forEach((el) => el.classList.toggle('is-on', el.dataset.template === id));
  }

  function applyTemplate(id) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    state.activeCard = id;
    state.name = t.name;
    state.emoji = t.emoji;
    const preset = PRESETS[id];
    if (preset) {
      state.dims.forEach((d) => {
        if (preset[d.key] != null) d.value = preset[d.key];
      });
    }
    // repaint sliders
    state.dims.forEach((d) => syncSlider(root, d.key, d.value));
    root.querySelector('[data-in="name"]').value = state.name;
    // 选中态要同时覆盖"我的角色"（data-card）与"模板起步"（data-template）。
    // 之前只切 [data-card]，从模板区选会一个高亮都不剩（真 bug）。
    markSelection(id);
    paintAll();
    blurSwap(root.querySelector('[data-reply]'), () => {
      root.querySelector('[data-replytext]').textContent = pickReply();
      root.querySelector('[data-compiled]').textContent = compile();
    });
  }

  // identity inputs
  root.querySelectorAll('[data-in]').forEach((el) => {
    el.addEventListener('input', () => {
      state[el.dataset.in] = el.value;
      root.querySelector('[data-cardtitle]')?.replaceChildren(state.name);
      root.querySelector('[data-replyname]').textContent = state.name;
      if (el.dataset.in !== 'catchphrase') refreshPreview();
      else root.querySelector('[data-compiled]').textContent = compile();
    });
  });

  // segmented
  root.querySelectorAll('[data-segmented]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-value]');
      if (!btn) return;
      const name = seg.dataset.segmented;
      seg.querySelectorAll('[data-value]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
      });
      if (name === 'stage') state.stage = btn.dataset.value;
      if (name === 'exercise') state.exercise = btn.dataset.value;
      if (name === 'error') state.errorMode = btn.dataset.value;
      refreshPreview();
    });
  });

  // toggles
  root.querySelectorAll('[data-toggle]').forEach((row) => {
    const input = row.querySelector('[data-switch]');
    input.addEventListener('change', () => {
      const t = state.teaching.find((x) => x.key === row.dataset.toggle);
      if (t) t.on = input.checked;
      refreshPreview();
    });
  });

  // ask chips
  asksEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ask-idx]');
    if (!btn) return;
    state.askIdx = Number(btn.dataset.askIdx);
    asksEl.querySelectorAll('[data-ask-idx]').forEach((b) => b.classList.toggle('is-on', b === btn));
    root.querySelector('[data-ask]').textContent = PREVIEW_PROMPTS[state.askIdx];
    refreshPreview();
  });

  // 渐进披露：常见路径先摆出来，其余收进下一层（apple-design §16.6）
  const moreBtn = root.querySelector('[data-more]');
  const moreBody = root.querySelector('[data-morebody]');
  if (moreBtn && moreBody) {
    moreBtn.addEventListener('click', () => {
      const open = moreBody.classList.toggle('is-open');
      moreBtn.setAttribute('aria-expanded', String(open));
      moreBtn.textContent = open
        ? '收起不常用的维度'
        : '还有 ' + moreBody.querySelectorAll('.dim').length + ' 个维度（不常用）';
    });
  }

  // neutral reset
  root.querySelector('[data-neutral]').addEventListener('click', () => {
    undoStack.length = 0;
    renderUndo();
    state.dims.forEach((d) => {
      d.value = 50;
      syncSlider(root, d.key, 50);
    });
    refreshPreview();
  });

  // save -> toast + state indication
  root.querySelector('[data-save]').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = '已保存 ✓';
    window.setTimeout(() => {
      btn.textContent = original;
    }, 1400);
    window.__toast?.('「' + state.name + '」已保存');
  });

  root.querySelector('[data-recompile]').addEventListener('click', refreshPreview);
  root.querySelector('[data-ai]').addEventListener('click', () => window.__toast?.('AI 写卡：给三个关键词就能生成整张卡'));
  root.querySelector('[data-new]').addEventListener('click', () => window.__toast?.('新建角色卡'));
  root.querySelector('[data-discard]').addEventListener('click', () => window.__toast?.('已放弃本次修改'));
  root.querySelector('[data-golearn]').addEventListener('click', () => {
    state.view = 'learn';
    paint(root);
  });

  paintAll();
}







