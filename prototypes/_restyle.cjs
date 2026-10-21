const fs = require('node:fs')
const path = require('node:path')

const DIR = path.join(__dirname, 'costudy-ui')

const STUDIO = `/* Studio · 布局层（原子样式来自 tokens.css） */
.v-studio { display: grid; grid-template-columns: 236px minmax(0, 1fr) 376px; gap: 20px; align-items: start; padding-top: 4px; }

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
.v-studio .card-line { display: block; font-size: var(--fs-footnote); color: var(--label-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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

/* 右栏：预览作为浮起的面 -->
.v-studio .preview {
  position: sticky; top: 68px;
  background: var(--bg-elevated); border-radius: var(--r-xl);
  padding: 16px 16px 18px;
  box-shadow: var(--shadow-sheet);
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
  padding: 10px 11px; max-height: 112px; overflow: auto; white-space: pre-wrap;
}
.v-studio .footer-bar { display: flex; align-items: center; gap: 8px; margin-top: 14px; padding-top: 13px; border-top: 0.5px solid var(--separator); }
.v-studio .footer-bar .grow { flex: 1; }

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
`

const WIZARD = `/* Wizard · 布局层 */
.v-wiz { display: grid; grid-template-columns: 258px minmax(0, 1fr); gap: 26px; align-items: start; padding-top: 4px; }

.v-wiz .steps { position: sticky; top: 68px; padding: 4px 0 0; }
.v-wiz .step { display: flex; align-items: flex-start; gap: 11px; padding: 9px 4px; position: relative; }
.v-wiz .step-dot {
  width: 24px; height: 24px; border-radius: 50%; flex: none;
  display: grid; place-items: center; font-size: 11px; font-weight: 600;
  background: var(--fill-1); color: var(--label-2);
  transition: background-color var(--dur-pop) ease, color var(--dur-pop) ease, box-shadow var(--dur-pop) ease;
  position: relative; z-index: 1;
}
.v-wiz .step.is-done .step-dot { background: var(--blue); color: #fff; }
.v-wiz .step.is-now .step-dot { background: var(--bg-elevated); color: var(--label); box-shadow: 0 0 0 1.5px var(--blue); }
.v-wiz .step-label { display: block; font-size: var(--fs-body); font-weight: 500; color: var(--label-3); letter-spacing: -0.004em; transition: color var(--dur-pop) ease; }
.v-wiz .step.is-now .step-label { color: var(--label); font-weight: 600; }
.v-wiz .step-sub { display: block; font-size: var(--fs-footnote); color: var(--label-3); }
.v-wiz .step-line { position: absolute; left: 16px; top: 34px; bottom: -8px; width: 0.5px; background: var(--separator); }
.v-wiz .step:last-child .step-line { display: none; }

.v-wiz .wiz-head { margin-bottom: 18px; }
.v-wiz .wiz-kicker { font-size: var(--fs-footnote); font-weight: 500; color: var(--blue); letter-spacing: 0; }
.v-wiz .wiz-title { font-family: var(--font-display); font-size: var(--fs-display); line-height: 1.1; letter-spacing: -0.024em; font-weight: 700; margin-top: 2px; }
.v-wiz .wiz-sub { color: var(--label-2); margin-top: 6px; max-width: 52ch; font-size: var(--fs-body); }
.v-wiz .wiz-body { padding: 18px; }
.v-wiz .wiz-foot { display: flex; align-items: center; gap: 8px; margin-top: 18px; }

.v-wiz .tpl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.v-wiz .tpl {
  text-align: left; padding: 14px; border-radius: var(--r-md); border: 0;
  background: var(--fill-1); cursor: pointer;
  transition: background-color var(--dur-tip) ease, transform var(--dur-press) var(--ease-out), box-shadow var(--dur-tip) ease;
}
.v-wiz .tpl:hover { background: var(--fill-2); }
.v-wiz .tpl:active { transform: scale(0.985); }
.v-wiz .tpl.is-on { background: var(--bg-elevated); box-shadow: 0 0 0 2px var(--blue), var(--shadow-1); }
.v-wiz .tpl-emoji { font-size: 20px; }
.v-wiz .tpl-name { font-size: var(--fs-body); font-weight: 600; margin-top: 7px; letter-spacing: -0.006em; }
.v-wiz .tpl-line { font-size: var(--fs-footnote); color: var(--label-2); line-height: 1.45; margin-top: 2px; }

.v-wiz .dims2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; }
.v-wiz .dims2 .dim { padding: 8px 0; }
.v-wiz .field-label { display: block; font-size: var(--fs-footnote); color: var(--label-2); margin-bottom: 5px; }
.v-wiz .setting-row { display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: center; min-height: 42px; }
.v-wiz .setting-row + .setting-row { border-top: 0.5px solid var(--separator); }

.v-wiz .review-card { padding: 4px 0; }
.v-wiz .kv { display: grid; grid-template-columns: 88px 1fr; gap: 11px 16px; font-size: var(--fs-body); }
.v-wiz .kv dt { color: var(--label-2); }

/* 学习界面：课表优先 */
.v-wiz .learn { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
.v-wiz .learn-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.v-wiz .goal { padding: 14px 16px; border-radius: var(--r-md); background: var(--blue-tint); margin-bottom: 16px; }
.v-wiz .goal-k { font-size: var(--fs-caption); font-weight: 600; color: var(--blue); }
.v-wiz .goal-t { font-size: var(--fs-body); margin-top: 3px; letter-spacing: -0.004em; }

.v-wiz .kp-list { padding: 2px 0; }
.v-wiz .kp { display: grid; grid-template-columns: 26px 1fr 100px; align-items: center; gap: 12px; padding: 12px 0; }
.v-wiz .kp + .kp { border-top: 0.5px solid var(--separator); }
.v-wiz .kp-mark {
  width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
  font-size: 11px; font-weight: 600; background: var(--fill-1); color: var(--label-2);
}
.v-wiz .kp.is-done .kp-mark { background: var(--green); color: #fff; }
.v-wiz .kp.is-doing .kp-mark { background: var(--blue); color: #fff; }
.v-wiz .kp-name { font-size: var(--fs-body); font-weight: 500; letter-spacing: -0.004em; }
.v-wiz .kp-sub { font-size: var(--fs-footnote); color: var(--label-2); }
.v-wiz .mastery { display: flex; align-items: center; gap: 8px; }
.v-wiz .bar { flex: 1; height: 4px; border-radius: var(--r-full); background: var(--fill-2); overflow: hidden; }
.v-wiz .bar > i { display: block; height: 100%; border-radius: var(--r-full); background: var(--blue); transition: width var(--dur-modal) var(--ease-out); }
.v-wiz .mastery-num { font-size: var(--fs-caption); font-variant-numeric: tabular-nums; color: var(--label-2); min-width: 28px; text-align: right; }

.v-wiz .side-card { padding: 14px 16px; }
.v-wiz .side-card + .side-card { margin-top: 14px; }
.v-wiz .side-title { font-size: var(--fs-footnote); font-weight: 500; color: var(--label-2); margin-bottom: 8px; }
.v-wiz .side-item { padding: 8px 0; font-size: var(--fs-subhead); }
.v-wiz .side-item + .side-item { border-top: 0.5px solid var(--separator); }
.v-wiz .side-item b { font-weight: 600; letter-spacing: -0.004em; }
.v-wiz .side-item .why { color: var(--label-2); font-size: var(--fs-footnote); margin-top: 2px; }
.v-wiz .pill-due {
  display: inline-block; padding: 1px 6px; border-radius: var(--r-xs);
  background: var(--blue-tint); color: var(--blue); font-size: var(--fs-caption); margin-left: 5px;
}
.v-wiz .start-teach { display: flex; gap: 8px; margin-top: 18px; }
`

const COMPANION = `/* Companion · 布局层 */
.v-comp { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; max-width: 940px; margin: 0 auto; padding-top: 4px; }

.v-comp .chat-pane { padding: 18px 20px; }
.v-comp .comp-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.v-comp .comp-title { font-family: var(--font-display); font-size: var(--fs-title2); line-height: 1.2; letter-spacing: -0.018em; font-weight: 600; }
.v-comp .comp-sub { font-size: var(--fs-footnote); color: var(--label-2); margin-top: 2px; }

.v-comp .thread { display: grid; gap: 9px; margin-bottom: 18px; }
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

.v-comp .composer { display: flex; gap: 8px; align-items: center; }
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
`

function replaceStyle(file, style) {
  const p = path.join(DIR, file)
  const src = fs.readFileSync(p, 'utf8')
  const re = /const STYLE = `[\s\S]*?`;\n/
  if (!re.test(src)) throw new Error('STYLE block not found in ' + file)
  fs.writeFileSync(p, src.replace(re, 'const STYLE = `' + style + '`;\n'), 'utf8')
  console.log('  patched ' + file)
}

replaceStyle('variant-studio.js', STUDIO)
replaceStyle('variant-wizard.js', WIZARD)
replaceStyle('variant-companion.js', COMPANION)
console.log('done')
