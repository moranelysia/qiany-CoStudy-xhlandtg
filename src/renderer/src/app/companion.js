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
import { openTopicDialog } from '../topic-ui';

/**
 * 当前学习主题（学段 / 科目 / 今天的目标），来自 记忆/学习主题.json。
 * 拿到之前先用 LESSON 兜底，避免首屏闪一下空标题。
 */
let topic = { stage: '', course: '', goal: '' };
let topicRoot = null;

function courseText() {
  return topic.course || LESSON.course;
}
function goalText() {
  return topic.goal || LESSON.goal;
}

function loadTopic(root) {
  const api = window.costudy;
  if (!api?.learnTopic) return;
  void api.learnTopic().then((t) => {
    if (!t) return;
    topic = t;
    if (state.mode === 'learn' && topicRoot) renderLearn(topicRoot);
  });
}

const STYLE = `/* Companion · 布局层 */
.v-comp {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(320px, 26vw, 400px);
  gap: clamp(16px, 1.6vw, 28px);
  align-items: start;
  /* 顶部让开灵动岛（岛在 y=9~43） */
  padding-top: 56px;
}

.v-comp .chat-pane { padding: 20px 22px 24px; min-height: min(62vh, 620px); display: flex; flex-direction: column; }
.v-comp .comp-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.v-comp .comp-hero { padding: 2px 0 18px; }


.v-comp .thread { display: grid; gap: 9px; margin-bottom: 18px; align-content: start; }
.v-comp .msg { display: flex; gap: 8px; align-items: flex-end; animation: rise var(--dur-modal) var(--ease-out) both; }
.v-comp .msg.me { flex-direction: row-reverse; }
.v-comp .bubble {
  max-width: min(78%, 680px); padding: 9px 13px;
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
.v-comp .learn-wrap { max-width: 100%; margin: 0; position: relative; }
/* 右边留 16px：删掉「开场 / 今天没有要到期的」两个胶囊之后，
   「清空对话」会顶到窗口最右边（容器 padding-right 是 0），看着像被切掉半截。 */
.v-comp .learn-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-right: 16px; }
.v-comp .learn-top h1 { font-size: var(--fs-title2); letter-spacing: -0.018em; }
.v-comp .goal-mini { padding: 11px 14px; border-radius: var(--r-md); background: var(--blue-tint); font-size: var(--fs-subhead); margin-bottom: 18px; }
.v-comp .goal-mini b { color: var(--blue); font-weight: 600; }
.v-comp .learn-thread { display: grid; gap: 11px; padding-bottom: 64px; }
.v-comp .learn-msg { display: flex; flex-wrap: wrap; gap: 9px; align-items: flex-start; animation: rise var(--dur-modal) var(--ease-out) both; }
.v-comp .learn-msg.me { flex-direction: row-reverse; }
/* 助手消息：不套卡片，正文平铺（DSH 那种感觉）—— 读长文时卡片反而像个框 */
.v-comp .learn-bubble {
  max-width: 100%; padding: 2px 0;
  border-radius: 0;
  background: none; box-shadow: none;
  font-size: var(--fs-body); line-height: 1.75;
}
.v-comp .learn-msg.me .learn-bubble { background: var(--blue); color: #fff; box-shadow: none; border-radius: 18px 18px 5px 18px; padding: 10px 14px; max-width: min(78%, 620px); }
/* 行内强调：模型写 **粗体** 或反引号代码时不该把标记符号露出来（2026-11-02 补回）
   注意：这个文件是一整段模板字符串，注释里绝对不能出现反引号 */
.v-comp .learn-bubble strong { font-weight: 700; color: var(--ink, #10151c); }
.v-comp .learn-bubble code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .9em; padding: 1px 5px; border-radius: 5px;
  background: rgba(120, 148, 178, .14); color: #0a3f7a;
}
.v-comp .learn-msg.me .learn-bubble strong { color: #fff; }
.v-comp .learn-msg.me .learn-bubble code { background: rgba(255, 255, 255, .22); color: #fff; }
/* 围栏代码块：必须 pre，空白要保住（ASCII 图、缩进全靠它） */
.v-comp .learn-bubble pre.code-block {
  margin: 8px 0; padding: 10px 12px; border-radius: 10px;
  background: rgba(120, 148, 178, .10); border: .5px solid rgba(120, 148, 178, .24);
  overflow-x: auto; white-space: pre; tab-size: 4;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px; line-height: 1.6; color: #17202b;
}
.v-comp .learn-bubble pre.code-block code { background: none; padding: 0; font-size: inherit; color: inherit; }

/* 消息上的小动作：悬停才出现，平时不占地方 */
.v-comp .learn-msg { position: relative; }
.v-comp .msg-actions {
  position: absolute; top: -12px; right: 2px; z-index: 3;
  display: flex; gap: 6px; opacity: 0; transition: opacity 140ms ease;
}
.v-comp .learn-msg:hover .msg-actions, .v-comp .learn-msg:focus-within .msg-actions { opacity: 1; }
.v-comp .msg-act {
  padding: 3px 9px; border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 11.5px; font-weight: 600;
  color: #0a5cc4; background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 2px 8px rgba(30, 44, 62, 0.14);
}
.v-comp .msg-act:hover { background: #fff; }
/* 图表 / 照片右上角的工具条（下载），和"点击放大"提示错开位置 */
.v-comp .img-tools {
  position: absolute; top: 8px; left: 8px; z-index: 4;
  display: flex; gap: 6px; opacity: 0; transition: opacity 140ms ease;
}
.v-comp .chart-box:hover .img-tools, .v-comp .img-box:hover .img-tools { opacity: 1; }
/* 触屏没有 hover：按钮和复制键一律常显，否则手机上根本点不到 */
/* 朗读胶囊：模型教发音时插 [读:word|slow]，点一下听 */
.v-comp .speak-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 6px 8px 0 0;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid rgba(10,122,230,.28);
  background: rgba(10,122,230,.08);
  color: #0a5fb8;
  font-size: 13px;
  cursor: pointer;
}
.v-comp .speak-chip:hover { background: rgba(10,122,230,.16); }
.v-comp .speak-chip:active { transform: scale(.97); }

/* 上下文占用圆环（输入框右侧），像 codex 那样一眼看出用了多少 */
.v-comp .ctx-ring {
  position: relative;
  flex: none;
  width: 30px;
  height: 30px;
  margin-left: 6px;
  cursor: pointer;
}
.v-comp .ctx-ring svg { width: 30px; height: 30px; display: block; }
.v-comp .ctx-ring .ctx-arc { transition: stroke-dasharray .35s ease, stroke .2s ease; }
.v-comp .ctx-ring .ctx-pct {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  color: var(--label-2);
  pointer-events: none;
}
/* 数学键盘：输入框旁的「∑」+ 弹出面板 */
.v-comp .math-key {
  flex: none;
  width: 30px;
  height: 30px;
  margin-left: 6px;
  border-radius: 999px;
  border: 1px solid rgba(120,148,178,.3);
  background: rgba(255,255,255,.7);
  color: #2b3a4a;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.v-comp .math-key[data-on] { background: rgba(10,122,230,.14); border-color: rgba(10,122,230,.4); }

.v-comp .math-pad {
  position: absolute;
  right: 16px;
  bottom: 64px;
  z-index: 60;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 12px 32px rgba(20,40,70,.18);
  border: 1px solid rgba(120,148,178,.22);
}
.v-comp .math-pad[hidden] { display: none; }
.v-comp .mp-row { display: flex; gap: 4px; margin-bottom: 4px; }
.v-comp .mp-row:last-child { margin-bottom: 0; }
.v-comp .mp-key {
  width: 32px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(120,148,178,.22);
  background: #fff;
  color: #22303f;
  font-size: 14px;
  cursor: pointer;
}
.v-comp .mp-key:hover { background: rgba(10,122,230,.1); }
.v-comp .mp-key:active { transform: scale(.94); }
/* 记忆库：输入框旁的「忆」+ 面板 */
.v-comp .mem-key {
  flex: none;
  width: 30px;
  height: 30px;
  margin-left: 6px;
  border-radius: 999px;
  border: 1px solid rgba(120,148,178,.3);
  background: rgba(255,255,255,.7);
  color: #2b3a4a;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.v-comp .mem-key[data-on] { background: rgba(16,168,122,.16); border-color: rgba(16,168,122,.45); }
.v-comp .mem-pad {
  position: absolute;
  right: 16px;
  bottom: 64px;
  z-index: 60;
  width: 340px;
  max-height: 320px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255,255,255,.97);
  box-shadow: 0 12px 32px rgba(20,40,70,.18);
  border: 1px solid rgba(120,148,178,.22);
}
.v-comp .mem-pad[hidden] { display: none; }
.v-comp .mp-head { font-size: 12px; font-weight: 600; color: #2b3a4a; margin-bottom: 8px; }
.v-comp .mp-empty { font-size: 12px; color: var(--label-2); line-height: 1.6; }
.v-comp .mp-item { display: flex; align-items: center; gap: 6px; padding: 5px 0; border-top: 1px solid rgba(120,148,178,.12); }
.v-comp .mp-badge { flex: none; font-size: 10px; padding: 2px 6px; border-radius: 999px; }
.v-comp .mp-badge.confirmed { background: rgba(16,168,122,.14); color: #0b7d5b; }
.v-comp .mp-badge.pending { background: rgba(180,83,9,.12); color: #b45309; }
.v-comp .mp-text { flex: 1; font-size: 12.5px; color: #22303f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-comp .mp-count { flex: none; font-size: 11px; color: var(--label-2); }
.v-comp .mp-op { flex: none; font-size: 11px; padding: 3px 8px; border-radius: 999px; border: 1px solid rgba(10,122,230,.35); background: rgba(10,122,230,.08); color: #0a5fb8; cursor: pointer; }
.v-comp .mp-op.ghost { border-color: rgba(120,148,178,.3); background: transparent; color: var(--label-2); }
.v-comp .mem-pad .mp-search { display: flex; gap: 6px; margin-bottom: 8px; }
.v-comp .mem-pad .mp-search input { flex: 1; height: 26px; padding: 0 8px; border-radius: 8px; border: 1px solid rgba(120,148,178,.28); font-size: 12px; }
.v-comp .mem-pad .mp-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.v-comp .mem-pad .mp-tags { font-size: 10.5px; color: var(--label-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 复制按钮贴在 AI 回答正文旁边（气泡右上角外侧），悬停出现 */
.v-comp .learn-bubble.has-copy { position: relative; }
.v-comp .learn-bubble.has-copy .msg-actions {
  position: absolute;
  top: -9px;
  right: 6px;
  opacity: 0;
  transition: opacity .15s ease;
}
.v-comp .learn-bubble.has-copy:hover .msg-actions { opacity: 1; }
.v-comp .learn-msg.ai .learn-bubble.has-copy { padding-top: 12px; }
@media (hover: none) {
  .v-comp .img-tools, .v-comp .msg-actions { opacity: 1; }
}
/* 图卡片底下的说明面板（原理 / 步骤） */
.v-comp .chart-panel {
  margin: 8px -4px 2px; padding: 10px 12px; border-radius: 12px;
  background: rgba(10, 132, 255, 0.06); border: 1px solid rgba(10, 132, 255, 0.14);
  font-size: 12.5px; line-height: 1.7; color: rgba(30, 44, 62, 0.92);
}

/* 滚动条：窄、透明轨道，只在需要时淡淡地露出来 */
.v-comp .learn-thread::-webkit-scrollbar { width: 8px; height: 8px; background: transparent; }
.v-comp .learn-thread::-webkit-scrollbar-track { background: transparent; }
.v-comp .learn-thread::-webkit-scrollbar-thumb {
  background: rgba(120, 148, 178, 0.26);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: content-box;
}
.v-comp .learn-thread::-webkit-scrollbar-thumb:hover { background: rgba(120, 148, 178, 0.55); background-clip: content-box; }
.v-comp .learn-thread::-webkit-scrollbar-corner { background: transparent; }
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
/* 联网开关：打开时是蓝底白字，关着是普通按钮 —— 一眼能看出当前在不在联网 */
.v-comp .dock-btn.search-toggle {
  width: auto;
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--label-2);
}
.v-comp .dock-btn.search-toggle[data-on] {
  color: #fff;
  background: var(--blue);
}
.v-comp .dock-btn.search-toggle[data-on]:hover { background: var(--blue-press); }
.v-comp .src-list {
  margin-top: 6px;
  padding-left: 0;
  list-style: none;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--label-2);
  word-break: break-all;
}
.v-comp .src-list a { color: #0a5cc4; text-decoration: none; }
.v-comp .src-list a:hover { text-decoration: underline; }
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
/* 整页锁定：伴学这一屏只允许消息区滚，页面本身不许滚。
   body 在无边框窗口里留了 42px 的标题栏内边距，所以高度必须减掉这 42px ——
   之前写的是 100vh，整块比视口高 42px，结果就是"滚轮能滚整页、消息区滚动条底部被切掉一截"。 */
html:has(.v-comp .learn-wrap),
body:has(.v-comp .learn-wrap) {
  overflow: hidden;
  height: 100%;
}

/* 只对学习界面生效（含 .learn-wrap）。问答界面是左右两栏，不能被这条规则拉成单列。 */
.app.v-comp:has(.learn-wrap) {
  height: calc(100vh - 42px);
  /* 全屏：不再卡 820px，两侧的空白正是消息被挤窄的原因 */
  max-width: none;
  margin: 0 auto;
  box-sizing: border-box;
  /* 顶部留出灵动岛的安全区：岛在 y=9~43，这里从 56px 起 */
  padding-top: 56px;
  padding-bottom: 16px;
  /* 内容靠左内边距、右侧完全贴边：滚动条才能落在窗口最右 */
  padding-left: 16px;
  padding-right: 0;
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

/* 图表：MCP 生成的是固定宽 SVG，必须按容器缩放，否则撑破消息区。
   对齐：TA 发的图靠左（跟文字同一个左边缘，图是正文的一部分）；
   我说的话下面的图靠右（跟右侧蓝色气泡同一侧）。以前所有图都 margin-left:auto，
   助手消息里就出现"文字在左、图飘到右边"，中间一大片空白。 */
.v-comp .chart-box { margin: 12px 0 6px 0; max-width: min(88%, 760px); padding: 12px 14px 10px; background: #fff; border-radius: 16px; box-shadow: 0 2px 12px rgba(30, 44, 62, 0.08); }
.v-comp .learn-msg.me .chart-box { margin-left: auto; max-width: min(78%, 620px); }
.v-comp .chart-box svg { display: block; width: 100%; height: auto; max-width: 100%; }
.v-comp .learn-bubble .tool-tag { align-self: flex-end; text-align: right; margin-top: 4px; font-size: 11px; color: #9aa8b6; opacity: 1; }

/* 消息区：唯一可滚动的区域 */
.v-comp .learn-thread {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;   /* 图不撑出横向滚动条 */
  /* 滚动条推到窗口最右：负边距抵掉容器的左右留白 */
  margin-right: 0;
  padding-right: 18px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 148, 178, 0.32) transparent;
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
  <div class="app v-comp" style="grid-template-columns:1fr;max-width:none">
    <div class="learn-wrap">
      <div class="learn-top">
        ${avatar(state.name, state.emoji, 34)}
        <div style="flex:1">
          <h1>${esc(courseText())}</h1>
          <div class="small muted">${esc(state.name)}${document.documentElement.dataset.platform === 'web' ? '' : ' · 已连续陪你学 3 天'}${topic.stage ? ' · ' + esc(topic.stage) : ''}</div>
        </div>
        <button class="btn ghost" data-topic-edit>改所学内容</button>
      </div>

      <div class="goal-mini"><b>今天的目标</b> ${esc(goalText())}</div>

      <div class="learn-thread" data-thread>
        <div class="learn-msg ai">
          ${avatar(state.name, state.emoji, 28)}
          <div class="learn-bubble">
            <div class="learn-who">${esc(state.name)}</div>
            早上好。今天我们的主题是<b>${esc(courseText())}</b>，目标是：${esc(goalText())}。<br /><br />
            你想先让我讲一遍，还是直接做题看看现在什么水平？
          </div>
        </div>
        <div class="learn-msg me">
          <div class="learn-bubble"><div class="learn-who" style="color:rgba(255,255,255,.6)">我</div>先做题吧，我怕我忘了。</div>
        </div>
        <div class="learn-msg ai">
          ${avatar(state.name, state.emoji, 28)}
          <div class="learn-bubble">
            <div class="learn-who">${esc(state.name)}</div>
            行。那我先问一句，不动笔：<br /><br />
            关于「${esc(courseText())}」，你觉得<b>自己最没把握的是哪一步</b>？<br /><br />
            说出来我就从那儿开始，不浪费时间从头讲。
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
        <button class="dock-btn search-toggle" data-search-toggle aria-pressed="false">联网</button><button class="dock-btn" data-asr-mic>说</button>
        <button class="dock-btn" data-photo title="发照片">图</button>
        <input class="input" placeholder="说你的思路…" />
        <button class="dock-btn send" title="发送">↑</button>
      </div>
    </div>
  </div>`;

  // 按钮已从页头删除，这里必须可选链：null.addEventListener 会让整屏挂载直接抛错、白屏
  root.querySelector('[data-back]')?.addEventListener('click', () => {
    state.mode = 'interview';
    renderInterview(root);
  });
  // 改所学内容：改完弹窗会派发 costudy:topic-changed，mount 里的监听负责重渲染
  root.querySelector('[data-topic-edit]')?.addEventListener('click', () => {
    void openTopicDialog();
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
  // 外部（Studio 的「去学习」、快捷键等）要能切进学习模式：
  // state 在这个模块里，所以入口也由这里提供，而不是让外面去点按钮
  // —— 那个按钮只有"问完 4 步"之后才存在，外面点经常点空。
  window.__costudyEnterLearn = () => {
    state.mode = 'learn'
    renderLearn(root)
  }

  // 学习主题：进页面先读一次，改完之后重渲染头部
  topicRoot = root
  loadTopic(root)
  if (!mount.listening) {
    mount.listening = true
    window.addEventListener('costudy:topic-changed', (e) => {
      const next = e.detail
      if (next && typeof next === 'object') topic = next
      if (topicRoot) renderLearn(topicRoot)
    })
  }

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

  /* 顶部显示的名字 / 头像是原型里写死的「温柔学姐」，和真实角色卡无关。
     这里把当前卡同步进来，并在切换角色卡时重渲染。 */
  const syncCardIdentity = async () => {
    try {
      const api = window.costudy
      const list = await api?.cards?.list?.()
      const active = list && (list.find((c) => c.isActive) || list[0])
      if (!active) return
      const detail = await api.cards.get(active.id)
      if (!detail) return
      if (detail.name) state.name = detail.name
      if (detail.emoji) state.emoji = detail.emoji
      if (detail.address) state.nickname = detail.address
      // 顶栏那枚角色胶囊是另一套 DOM（.proto-picker），一并改掉，别让两处名字打架
      window.__costudyActiveCardName = state.name
      const chip = document.querySelector('.proto-picker-status-title')
      if (chip) chip.textContent = state.name
      if (state.mode === 'learn') renderLearn(root)
      else renderInterview(root)
    } catch (e) {
      /* 拿不到卡就保持默认，不影响进入学习 */
    }
  }
  void syncCardIdentity()
  if (!mount.cardListening) {
    mount.cardListening = true
    window.addEventListener('costudy:card-changed', () => { void syncCardIdentity() })
  }
}


