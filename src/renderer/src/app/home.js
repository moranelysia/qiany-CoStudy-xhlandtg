/**
 * 首页（v-home）：伴学仪表盘。
 *
 * 【排版参考】按用户给的第二张参考图（CoStudy）的**结构**来：
 *   顶部品牌 + 灵动岛（应用级导航）→ 大标语 + 右侧「待复习 / 开始学习」→
 *   四张指标卡 → 两栏：左边「今日学习计划 / 接下来要复习 / 最近学习记录」，
 *   右边「我的伴学角色 / 本周学习趋势 / 今日观察」。
 *
 * 【红线：不摆假数据】方案表里写明界面上不能有编出来的数字。所有数字来自：
 *   learnOverview（待复习 / 错题 / 知识点）、learnTopic（目标 / 科目）、
 *   会话列表与逐条消息的 at 时间戳（今日对话数、本周趋势、连续天数、最近记录）。
 *   拿不到就显示「—」或整块不显示；「今日观察」是**按真实计数拼的规则文案**，
 *   不是模型生成的黑箱结论。
 *
 * 纯 JS，不要在这里写 TS 类型注解。
 */

const CSS_ID = 'home-variant-style'

const CSS = `
.v-home { min-height: 100vh; box-sizing: border-box; padding: 92px 40px 44px; }
/* 全局 tokens.css 里 .app 有 max-width: var(--content)（1440），会把首页卡住，
   用户要求"放大到整个屏幕"，所以这里显式放开 —— 变体样式是后注入的，能压过 tokens.css */
.v-home.app { max-width: none; }
/* 不设宽度上限：内容跟着窗口宽度铺开 */
.hm-shell { width: 100%; margin: 0 auto; display: grid; gap: 18px; }

/* ---------- 大标语 ---------- */
/* 一行话：「欢迎回来，{称呼}，今天也一起进步」—— 原来拆成"小欢迎语 + 大标题"两行，
   用户要求直接并成这一句。右侧是待复习 chip + 开始学习。 */
.hm-hero { display: grid; gap: 6px; padding: 2px 2px 4px; }
.hm-hero-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.hm-hero-l { min-width: 0; }
.hm-title {
  margin: 0;
  font-size: clamp(28px, 2.45vw, 52px);
  line-height: 1.15; font-weight: 800; letter-spacing: -0.03em;
  background-image: linear-gradient(96deg, #0a63c8 0%, #4a4bdc 42%, #7b3fe4 72%, #c43aa8 100%);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: #0a63c8;
  width: fit-content; max-width: 100%;
}
.hm-hero-r { display: flex; align-items: center; gap: 10px; flex: none; padding-bottom: 4px; }
.hm-chip {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 10px 16px; border-radius: 999px; font-size: 13.5px; font-weight: 600;
  color: rgba(40, 52, 66, 0.86); background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 2px rgba(92, 118, 152, 0.08);
  cursor: pointer; border: 0; font-family: inherit;
}
.hm-chip svg { width: 15px; height: 15px; color: rgba(10, 122, 230, 0.9); }
.hm-cta {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 22px; border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 15px; font-weight: 650; color: #fff;
  background: linear-gradient(180deg, #2f9bff, #0a7ae6);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.34), 0 10px 24px rgba(10, 122, 230, 0.3);
}
.hm-cta svg { width: 16px; height: 16px; }
.hm-cta:active { transform: scale(0.98); }

/* ---------- 四张指标卡 ----------
   2026-11-02：这些是**指标**，不是按钮 —— 用户要求去掉点击交互。
   所以标签从 <button> 换成 <div>，并去掉 cursor:pointer / hover / active 三件套。
   （键盘 Tab 也不会再聚焦到它们身上，因为不再是可聚焦元素。） */
.hm-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.hm-stat {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 18px; border-radius: 20px;
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(120, 148, 178, 0.14);
  text-align: left; font: inherit; color: inherit;
  cursor: default; user-select: none;
}
.hm-stat-i {
  width: 46px; height: 46px; flex: none; border-radius: 14px; display: grid; place-items: center;
  background: rgba(10, 132, 255, 0.12); color: #0a7ae6;
}
.hm-stat-i svg { width: 23px; height: 23px; }
.hm-stat-i[data-tone='violet'] { background: rgba(96, 92, 235, 0.13); color: #5450db; }
.hm-stat-i[data-tone='green'] { background: rgba(16, 168, 122, 0.13); color: #0f9c72; }
.hm-stat-i[data-tone='orange'] { background: rgba(255, 149, 40, 0.15); color: #d9760d; }
.hm-stat-k { display: block; font-size: 12.5px; color: rgba(58, 70, 86, 0.66); }
.hm-stat-v {
  display: block; margin-top: 3px;
  font-size: 28px; font-weight: 750; letter-spacing: -0.03em; color: #10151c;
  font-variant-numeric: tabular-nums; line-height: 1.15;
}
.hm-stat-v small { font-size: 12.5px; font-weight: 500; color: rgba(58, 70, 86, 0.6); margin-left: 3px; }

/* ---------- 两栏 ---------- */
.hm-grid { display: grid; grid-template-columns: minmax(0, 1.92fr) minmax(0, 1fr); gap: 16px; align-items: start; }
/* 卡片按内容定高：等分高度会把"只有一行"的卡撑成一大块空白，比不对齐更难看 */
.hm-col { display: grid; gap: 16px; min-width: 0; align-content: start; }

/* ---------- 卡片 ---------- */
.hm-card {
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(120, 148, 178, 0.14);
  border-radius: 22px;
  padding: 18px 20px;
  min-width: 0;
}
.hm-card-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.hm-card-t { display: inline-flex; align-items: center; gap: 8px; font-size: 16.5px; font-weight: 700; letter-spacing: -0.012em; color: #10151c; }
.hm-card-t svg { width: 17px; height: 17px; color: rgba(10, 122, 230, 0.9); }
.hm-card-a {
  display: inline-flex; align-items: center; gap: 5px;
  border: 0; background: transparent; cursor: pointer; font: inherit;
  font-size: 12.5px; color: rgba(10, 92, 196, 0.85); padding: 3px 6px; border-radius: 9px; flex: none;
}
.hm-card-a:hover { background: rgba(10, 132, 255, 0.1); }
.hm-card-a svg { width: 13px; height: 13px; }

/* 今日学习计划 */
.hm-plan { display: flex; align-items: center; gap: 18px; }
.hm-plan-b { flex: 1; min-width: 0; display: grid; gap: 9px; }
.hm-plan-k { font-size: 12px; color: rgba(58, 70, 86, 0.62); }
.hm-plan-goal { display: flex; align-items: flex-start; gap: 8px; font-size: 15.5px; font-weight: 650; color: #10151c; line-height: 1.45; }
.hm-plan-goal i { width: 7px; height: 7px; border-radius: 50%; background: #0a84ff; margin-top: 8px; flex: none; }
.hm-plan-d { font-size: 12.5px; color: rgba(58, 70, 86, 0.66); line-height: 1.6; }
.hm-progress { height: 8px; border-radius: 999px; background: rgba(120, 148, 178, 0.16); overflow: hidden; }
.hm-progress i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #4aa8ff, #0a7ae6); }
.hm-progress-row { display: flex; align-items: center; gap: 10px; }
.hm-progress-row .hm-progress { flex: 1; }
.hm-progress-n { font-size: 12px; color: rgba(58, 70, 86, 0.66); flex: none; font-variant-numeric: tabular-nums; }

/* 列表行（复习 / 最近记录） */
.hm-rowlist { display: grid; gap: 8px; }
.hm-row {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 12px; border-radius: 16px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(120, 148, 178, 0.1);
}
.hm-row-i {
  width: 34px; height: 34px; flex: none; border-radius: 11px; display: grid; place-items: center;
  background: rgba(96, 92, 235, 0.12); color: #5450db;
}
.hm-row-i svg { width: 17px; height: 17px; }
.hm-row-b { flex: 1; min-width: 0; }
.hm-row-n { font-size: 13.5px; font-weight: 600; color: #10151c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hm-row-s { font-size: 11.5px; color: rgba(58, 70, 86, 0.62); margin-top: 2px; }
.hm-tag {
  flex: none; padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 650;
  background: rgba(10, 132, 255, 0.12); color: #0a52a8;
}
.hm-tag[data-tone='done'] { background: rgba(16, 168, 122, 0.14); color: #0b7d5b; }
.hm-tag[data-tone='due'] { background: rgba(255, 149, 40, 0.16); color: #b26205; }
.hm-row-btn {
  flex: none; padding: 7px 14px; border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 12.5px; font-weight: 600;
  background: rgba(10, 132, 255, 0.1); color: #0a5cc4;
}
.hm-row-btn:hover { background: rgba(10, 132, 255, 0.18); }
.hm-empty { font-size: 12.5px; color: rgba(58, 70, 86, 0.6); padding: 6px 2px; }

/* 我的伴学角色 */
.hm-role { display: flex; align-items: center; gap: 16px; }
.hm-role-ava {
  width: 84px; height: 84px; flex: none; border-radius: 26px; display: grid; place-items: center;
  font-size: 38px;
  background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.9), rgba(198, 226, 250, 0.5));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 6px 18px rgba(92, 118, 152, 0.12);
}
.hm-role-b { flex: 1; min-width: 0; }
.hm-role-n { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; color: #10151c; }
.hm-role-d {
  margin-top: 4px; font-size: 12.5px; line-height: 1.5; color: rgba(58, 70, 86, 0.66);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.hm-role-btn {
  margin-top: 10px; display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 16px; border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 650; color: #0a5cc4;
  background: rgba(10, 132, 255, 0.12);
}
.hm-role-btn svg { width: 14px; height: 14px; }

/* 本周趋势：曲线（不是柱状图） */
.hm-chart { position: relative; height: 152px; }
.hm-chart svg { display: block; width: 100%; height: 100%; overflow: visible; }
.hm-chart text { font-family: inherit; font-size: 11.5px; fill: rgba(58, 70, 86, 0.55); font-variant-numeric: tabular-nums; }
.hm-chart text[data-val] { font-size: 10.5px; font-weight: 650; fill: #0a7ae6; }
.hm-chart text[data-today-label] { fill: #0a5cc4; font-weight: 650; }

/* 底部一行：连续学习（拉长）+ 今日观察，两块底部对齐 */
.hm-bottom { display: grid; grid-template-columns: minmax(0, 1.92fr) minmax(0, 1fr); gap: 16px; margin-top: 16px; align-items: stretch; }
.hm-stat-wide { width: 100%; height: 100%; }
/* ---------- 整体放大 + 撑满到底端（追加在最后，压过前面的规则） ---------- */
/* ---------- 液态玻璃（纯 CSS，不引库） ----------
   参考的是 yzrt 那套「纯 CSS 液态玻璃」的做法：不靠 SVG 位移滤镜，而是
   ① 半透明白 + backdrop-filter 模糊/提饱和  ② 顶部一道高光（模拟折射的亮边）
   ③ 底部一点内阴影（模拟厚度）  ④ 大圆角 + 很轻的外阴影。真机上看是"玻璃片"，不是"白色卡片"。 */
.v-home .hm-card,
.v-home .hm-stat,
.v-home .hm-bottom > .hm-card {
  /* 完全透明：不留白色底板。玻璃感全靠 backdrop-filter 的模糊+提饱和，
     以及边缘光/高光那几层 —— 跟"水滴"一致：玻璃本身不该有颜色。 */
  background: transparent;
  border: 1px solid rgba(255,255,255,0.55);
  box-shadow:
    inset 0 1.5px 0 rgba(255,255,255,0.95),
    inset 0 -1px 0 rgba(255,255,255,0.35),
    0 14px 34px rgba(24,42,74,0.13),
    0 1px 2px rgba(24,42,74,0.08);
  -webkit-backdrop-filter: blur(26px) saturate(190%) brightness(1.06);
  backdrop-filter: blur(26px) saturate(190%) brightness(1.06);
  position: relative;
  overflow: hidden;
  transition: transform .18s ease, box-shadow .18s ease;
}
/* 顶部折射高光条：一条很淡的横向光带 */
.v-home .hm-card::before,
.v-home .hm-stat::before {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  top: 6px;
  height: 42%;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0));
  pointer-events: none;
  opacity: .45;
}
/* 鼠标悬停像玻璃被轻推一下（只给可点的 .hm-card；指标卡已经不可点，不参与） */
.v-home .hm-card:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.95),
    inset 0 -1px 0 rgba(255,255,255,0.30),
    0 14px 36px rgba(24,42,74,0.14),
    0 1px 2px rgba(24,42,74,0.06);
}
/* 不支持 backdrop-filter 的老环境：退回到稍厚一点的白色，保证文字可读 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .v-home .hm-card, .v-home .hm-stat { background: rgba(255,255,255,0.82); }
}
/* ---------- 玻璃进阶：边缘光 + 镜面高光 + 边缘折射（用遮罩模拟） ----------
   说明：真正的"逐像素折射"需要把背景画进 WebGL 纹理再做位移采样（就是那个仓库干的事），
   CSS 层做不到。这里用三招逼近：
     ① 边缘光：conic-gradient 描边 + 内侧亮线
     ② 镜面高光：跟随鼠标的光斑（CSS 变量 --gx/--gy 由 JS 写）
     ③ 边缘折射：外圈 2px 的遮罩层单独用更强的 backdrop-filter，形成"边缘被压弯"的观感 */
.v-home .hm-card::after,
.v-home .hm-stat::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  /* 跟随鼠标的镜面高光 */
  background:
    radial-gradient(220px 160px at var(--gx, 50%) var(--gy, 0%),
      rgba(255,255,255,0.55), rgba(255,255,255,0.10) 45%, rgba(255,255,255,0) 70%);
  mix-blend-mode: screen;
  opacity: 0;
  transition: opacity .22s ease;
}
.v-home .hm-card:hover::after { opacity: 1; }

/* 边缘光：一圈会随角度变化的细边 */
.v-home .hm-card > .hm-edge,
.v-home .hm-stat > .hm-edge { display: none; }

/* 用 <div class="hm-glass-edge"> 由 JS 注入，专门做"边缘折射"层 */
.hm-glass-edge {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  padding: 2px;
  background: conic-gradient(from 210deg,
    rgba(255,255,255,0.85), rgba(255,255,255,0.15) 25%,
    rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.12) 72%,
    rgba(255,255,255,0.85));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 1;
}
.hm-glass-edge::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: inherit;
  -webkit-backdrop-filter: blur(34px) saturate(210%);
  backdrop-filter: blur(34px) saturate(210%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  padding: 6px;
  opacity: .55;
}
/* ---------- 背景：纯白 ----------
   2026-11-02：用户要求"背景板全部换成纯白，和苹果官网产品展示同色"。
   原来这里铺的是四块彩色光斑 + 32px 细网格，专门给液态玻璃当"折射内容"；
   纯白之后玻璃没东西可模糊，卡片的边界改由边框 + 阴影交代（见下面 hm-card）。 */
.v-home::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: #ffffff;
}
.v-home::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  display: none;
}
.v-home > .hm-shell { position: relative; z-index: 1; }
/* 放大但不拉伸：卡片保持自然高度，只把字号/内边距/间距放大，底部留一点白 */
.v-home { padding: 68px 40px 28px; }
.v-home .hm-card { padding: 22px 24px; min-height: 188px; }
.v-home .hm-shell { gap: 26px; }
.v-home .hm-grid { align-items: stretch; gap: 26px; }
/* 右栏最后一卡（本周学习趋势）长高，把下面的空白吃掉；曲线区跟着拉伸 */
.v-home .hm-col > .hm-card:last-child { display: flex; flex-direction: column; }
.v-home .hm-col:nth-child(2) > .hm-card:last-child .hm-chart { flex: 1 1 auto; height: auto; min-height: 170px; }
.v-home .hm-bottom { margin-top: 26px; }

/* 字体整体放大一档 */
.v-home { font-size: 15px; }
.v-home .hm-stat-k { font-size: 13.5px; }
.v-home .hm-stat-v { font-size: 30px; }
.v-home .hm-stat-v small { font-size: 14px; }
.v-home .hm-card-t { font-size: 17px; }
.v-home .hm-card-a { font-size: 13.5px; }
.v-home .hm-plan-l { font-size: 13.5px; }
.v-home .hm-plan-goal { font-size: 16px; }
.v-home .hm-plan-d, .v-home .hm-empty, .v-home .hm-observe-t { font-size: 14px; }
.v-home .hm-row-n { font-size: 14.5px; }
.v-home .hm-role-n { font-size: 17px; }
.v-home .hm-role-d, .v-home .hm-progress-n { font-size: 13px; }
.v-home .hm-role-btn { font-size: 14px; }
.v-home .hm-chart text { font-size: 12.5px; }
@media (max-width: 1180px) { .hm-bottom { grid-template-columns: 1fr; } }
.hm-observe { display: flex; gap: 12px; align-items: flex-start; }
.hm-observe-i {
  width: 34px; height: 34px; flex: none; border-radius: 11px; display: grid; place-items: center;
  background: rgba(10, 132, 255, 0.12); color: #0a7ae6;
}
.hm-observe-i svg { width: 17px; height: 17px; }
.hm-observe-t { font-size: 13px; line-height: 1.7; color: rgba(40, 52, 66, 0.88); }
.hm-observe-t b { color: #0a52a8; font-weight: 650; }

/* ---------- 窄窗口 ---------- */
@media (max-width: 1080px) {
  .hm-grid { grid-template-columns: minmax(0, 1fr); }
  .hm-stats { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 820px) {
  .v-home { padding: 88px 16px 32px; }
  .hm-hero-row { flex-direction: column; align-items: flex-start; gap: 14px; }
  .hm-plan { flex-direction: column; align-items: stretch; }
  .hm-stats { grid-template-columns: 1fr; }
}
/* 窗口矮的时候整体收一档（默认 1180×800 就是这种），别把小窗口挤爆 */
@media (max-height: 900px) {
  .v-home { padding: 78px 28px 20px; }
  .hm-shell { gap: 10px; }
  .hm-hero { gap: 6px; }
  .hm-title { font-size: clamp(23px, 1.9vw, 34px); }
  .hm-stat { padding: 11px 14px; }
  .hm-stat-v { font-size: 20px; }
  .hm-stat-i { width: 34px; height: 34px; border-radius: 11px; }
  .hm-card { padding: 13px 16px; }
  .hm-card-h { margin-bottom: 10px; }
  .hm-card-t { font-size: 14.5px; }
  .hm-chart { height: 84px; }
  .hm-col, .hm-grid { gap: 10px; }
  .hm-row { padding: 9px 10px; }
  .hm-plan { gap: 14px; }
  .hm-role { gap: 12px; }
  .hm-role-ava { width: 58px; height: 58px; border-radius: 18px; font-size: 26px; }
  .hm-role-n { font-size: 15.5px; }
}
`

function ensureStyle() {
  if (document.getElementById(CSS_ID)) return
  const el = document.createElement('style')
  el.id = CSS_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  )
}

const S = (inner) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  inner +
  '</svg>'

const ICON = {
  arrow: S('<path d="M5 12h13M13 6l6 6-6 6"/>'),
  calendar: S('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  refresh: S('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/>'),
  books: S('<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H11v16H6.5A2.5 2.5 0 0 0 4 22.5z"/><path d="M13 4h4.5A2.5 2.5 0 0 1 20 6.5v13a2.5 2.5 0 0 0-2.5-2.5H13z"/>'),
  flame: S('<path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-2 1-3.4 2-4.5.4 1.6 1.3 2.5 2.2 2.5 1.1 0 1.6-1.1 1.3-2.6C12.3 5.6 12 4.3 12 3z"/>'),
  chart: S('<path d="M4 19V9M10 19V5M16 19v-6M22 19H2"/>'),
  list: S('<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
  sparkle: S('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 16l.9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9z"/>'),
  user: S('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/>'),
}

function setActiveIndex(i) {
  const setActive = window.__costudySetActive
  if (typeof setActive !== 'function') {
    window.__toast?.('切换界面失败（入口未就绪）')
    return false
  }
  setActive(i)
  return true
}

function openLearn() {
  if (!setActiveIndex(2)) return
  window.setTimeout(() => {
    const enter = window.__costudyEnterLearn
    if (typeof enter === 'function') enter()
  }, 120)
}

function openOverview() {
  const open = window.__costudyOpenOverview
  if (typeof open === 'function') open()
  else window.__toast?.('学情浮层还没就绪')
}

export function mount(stage) {
  ensureStyle()

  stage.innerHTML = `
  <div class="app v-home">
    <div class="hm-shell">
      <header class="hm-hero">
        <div class="hm-hero-row">
          <div class="hm-hero-l">
            <h1 class="hm-title" data-hm-title data-hm-hi>欢迎回来，今天也一起进步</h1>
          </div>
          <div class="hm-hero-r">
            <!-- 「今日待复习」胶囊已按需求移除，右上角只留「开始学习」 -->
            <button class="hm-cta" type="button" data-hm-start>开始学习${ICON.arrow}</button>
          </div>
      </header>

      <section class="hm-stats">
        <div class="hm-stat">
          <span class="hm-stat-i">${ICON.clock}</span>
          <span><span class="hm-stat-k">今日对话</span><span class="hm-stat-v" data-hm-today>— <small>条</small></span></span>
        </div>
        <div class="hm-stat">
          <span class="hm-stat-i" data-tone="violet">${ICON.refresh}</span>
          <span><span class="hm-stat-k">待复习</span><span class="hm-stat-v" data-hm-due>— <small>条</small></span></span>
        </div>
        <div class="hm-stat">
          <span class="hm-stat-i" data-tone="green">${ICON.books}</span>
          <span><span class="hm-stat-k">知识点</span><span class="hm-stat-v" data-hm-points>— <small>个</small></span></span>
        </div>
        <div class="hm-stat">
          <span class="hm-stat-i" data-tone="orange">${ICON.flame}</span>
          <span><span class="hm-stat-k">连续学习</span><span class="hm-stat-v" data-hm-streak>— <small>天</small></span></span>
        </div>
      </section>

      <div class="hm-grid">
        <div class="hm-col">
          <section class="hm-card">
            <div class="hm-card-h">
              <span class="hm-card-t">${ICON.calendar}今日学习计划</span>
            </div>
            <div class="hm-plan">
              <div class="hm-plan-b">
                <div class="hm-plan-k">当前学习目标</div>
                <div class="hm-plan-goal"><i></i><span data-hm-goal>还没定</span></div>
                <div class="hm-plan-d" data-hm-plan-note>进学习页说一句想学什么，目标就会定下来。</div>
                <div class="hm-progress-row">
                  <span class="hm-progress"><i data-hm-progress style="width:0%"></i></span>
                  <span class="hm-progress-n" data-hm-progress-n>—</span>
                </div>
              </div>
          </section>

          <section class="hm-card">
            <div class="hm-card-h">
              <span class="hm-card-t">${ICON.refresh}接下来要复习</span>
            </div>
            <div class="hm-rowlist" data-hm-due-list>
              <div class="hm-empty">还没有到期的知识点。</div>
            </div>
          </section>

          <section class="hm-card">
            <div class="hm-card-h">
              <span class="hm-card-t">${ICON.list}最近学习记录</span>
            </div>
            <div class="hm-rowlist" data-hm-recent>
              <div class="hm-empty">还没有学习记录。</div>
            </div>
          </section>
        </div>

        <div class="hm-col">
          <section class="hm-card">
            <div class="hm-card-h">
              <span class="hm-card-t">${ICON.user}我的伴学角色</span>
            </div>
            <div class="hm-role">
              <div class="hm-role-ava" data-hm-emoji>✧</div>
              <div class="hm-role-b">
                <div class="hm-role-n" data-hm-name>—</div>
                <div class="hm-role-d" data-hm-role-d>—</div>
                <button class="hm-role-btn" type="button" data-hm-role>角色工坊${ICON.arrow}</button>
              </div>
            </div>
          </section>

          <section class="hm-card">
            <div class="hm-card-h">
              <span class="hm-card-t">${ICON.chart}本周学习趋势</span>
            </div>
            <div class="hm-chart" data-hm-chart></div>
            <div class="hm-empty" data-hm-chart-foot style="display:none"></div>
          </section>

        </div>
      </div>

      <section class="hm-bottom">
        <div class="hm-stat hm-stat-wide">
          <span class="hm-stat-i" data-tone="green">${ICON.clock}</span>
          <span><span class="hm-stat-k">今日学习</span><span class="hm-stat-v" data-hm-minutes>— <small>分</small></span></span>
        </div>
        <section class="hm-card">
          <div class="hm-card-h"><span class="hm-card-t">${ICON.sparkle}今日观察</span></div>
          <div class="hm-observe">
            <span class="hm-observe-i">${ICON.sparkle}</span>
            <div class="hm-observe-t" data-hm-observe>正在看今天的数据…</div>
          </div>
        </section>
      </section>
    </div>
  </div>`

  // 玻璃手感：每张卡注入边缘光环层，并让镜面高光跟随鼠标
  const glassCards = () => stage.querySelectorAll('.hm-card, .hm-stat')
  const paintGlass = () => {
    glassCards().forEach((el) => {
      if (!el.querySelector(':scope > .hm-glass-edge')) {
        const edge = document.createElement('div')
        edge.className = 'hm-glass-edge'
        el.appendChild(edge)
      }
      el.style.position = el.style.position || 'relative'
    })
  }
  paintGlass()
  // 卡片会随数据重绘，观察一下再补
  new MutationObserver(paintGlass).observe(stage, { childList: true, subtree: true })
  stage.addEventListener(
    'pointermove',
    (ev) => {
      const card = ev.target instanceof Element ? ev.target.closest('.hm-card, .hm-stat') : null
      if (!card) return
      const r = card.getBoundingClientRect()
      card.style.setProperty('--gx', ((ev.clientX - r.left) / Math.max(1, r.width)) * 100 + '%')
      card.style.setProperty('--gy', ((ev.clientY - r.top) / Math.max(1, r.height)) * 100 + '%')
    },
    { passive: true },
  )
  const on = (sel, fn) => stage.querySelector(sel)?.addEventListener('click', fn)
  // 指标卡（今日对话/待复习/知识点/连续学习/今日学习）不接点击：它们是展示，不是入口
  on('[data-hm-start]', openLearn)
  on('[data-hm-role]', () => setActiveIndex(0))
  on('[data-hm-profile]', openOverview)
  on('[data-hm-profile4]', openOverview)
  on('[data-hm-profile5]', openOverview)
  on('[data-hm-profile6]', openOverview)
  on('[data-hm-profile7]', openOverview)

  void fill(stage)
}

/** 把 ISO 时间转成本地日期键 YYYY-MM-DD（会话里的 at 是 UTC，直接切字符串会差一天） */
function dayKey(d) {
  const t = d instanceof Date ? d : new Date(d)
  if (isNaN(t.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate())
}

/** 把一个时间戳说成「今天 / 昨天 / 10 月 29 日」 */
function relativeDay(ts) {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  const today = dayKey(new Date())
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const k = dayKey(d)
  if (k === today) return '今天'
  if (k === dayKey(y)) return '昨天'
  return d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日'
}

/**
 * 今日累计学习时长（分钟）：把今天的消息时间戳按段落合并 —— 相邻两条间隔 ≤10 分钟算同一段，
 * 单段最多计 90 分钟（防止"开着窗口挂一天"被算成学习）。
 * 只统计"有活动的时间窗"，不是"最后一个减第一个"，这样中间去吃个饭不会算进去。
 */
function calcMinutes(list) {
  if (!list || !list.length) return 0
  const ts = list.slice().sort((a, b) => a - b)
  const GAP = 10 * 60 * 1000
  const CAP = 90 * 60 * 1000
  let total = 0
  let start = ts[0]
  let prev = ts[0]
  for (let i = 1; i < ts.length; i += 1) {
    if (ts[i] - prev > GAP) {
      total += Math.min(CAP, prev - start)
      start = ts[i]
    }
    prev = ts[i]
  }
  total += Math.min(CAP, prev - start)
  return Math.round(total / 60000)
}

/** 连续学习天数：从今天（今天还没学就从昨天）往回数，遇到空白天就断 */
function calcStreak(byDay) {
  const d = new Date()
  if (!byDay[dayKey(d)]) d.setDate(d.getDate() - 1)
  let n = 0
  for (let i = 0; i < 400; i += 1) {
    if (!byDay[dayKey(d)]) break
    n += 1
    d.setDate(d.getDate() - 1)
  }
  return n
}

async function loadStats() {
  const api = window.costudy
  const out = { byDay: {}, total: 0, days: 0, today: 0, lastAt: 0, sessions: [], streak: 0 }
  if (!api?.sessionList || !api?.sessionMessages) return out
  let list = []
  try {
    list = (await api.sessionList()) || []
  } catch {
    return out
  }
  // 最近 3 条留作"最近学习记录"，其余只用来算每天条数
  out.sessions = list.slice(0, 3).map((s) => ({
    title: String(s.title || '新会话'),
    count: Number(s.count || 0),
    updatedAt: s.updatedAt || '',
    phase: String(s.phase || ''),
  }))
  /**
   * 每天多少条 —— 交给主进程数（`src/main/learn/daily-stats.ts`）。
   *
   * 以前这里自己扫最近 8 条会话，有两个毛病：
   *   1. 清空对话只是把 jsonl 挪进 `会话/已删除/`，扫在线会话就整周归零 ——
   *      用户看到的不是"我清空了聊天"，而是"我这周没学习"；
   *   2. 扫到"今天的消息"那一行引用了从没声明过的 todayTs，
   *      直接抛 ReferenceError，整个 stats 回退成默认值（四张卡 + 曲线全 0）。
   *      只要今天说过一句话就会中招。
   * 新口径：在线会话 + 已删除备份，去重后按天计数。
   */
  const todayTs = []
  let daily = null
  try {
    daily = api.statsDaily ? await api.statsDaily() : null
  } catch {
    daily = null
  }
  if (daily && daily.byDay) {
    out.byDay = daily.byDay
    out.total = Number(daily.total) || 0
    out.days = Number(daily.days) || 0
    if (Array.isArray(daily.todayTs)) {
      for (const t of daily.todayTs) if (Number.isFinite(t)) todayTs.push(t)
    }
  } else {
    // 老接口兜底（正常不会走到）：至少别让整块变空
    for (const s of list.slice(0, 8)) {
      let msgs = []
      try {
        msgs = (await api.sessionMessages(s.id)) || []
      } catch {
        continue
      }
      const todayKey = dayKey(new Date())
      for (const m of msgs) {
        const k = dayKey(m.at)
        if (!k) continue
        out.byDay[k] = (out.byDay[k] || 0) + 1
        out.total += 1
        const t = new Date(m.at).getTime()
        if (Number.isNaN(t)) continue
        if (t > (out.lastAt || 0)) out.lastAt = t
        if (k === todayKey) todayTs.push(t)
      }
    }
    out.days = Object.keys(out.byDay).length
  }
  // 优先用真实计时（伴学页每秒探一次累加的），没有记录时才用消息间隔推算
  out.inferredMinutes = calcMinutes(todayTs)
  let tracked = 0
  try {
    const st = await (api && api.studyToday ? api.studyToday() : Promise.resolve(null))
    if (st && Number.isFinite(Number(st.minutes))) tracked = Number(st.minutes)
  } catch {
    /* 拿不到就用推算值 */
  }
  out.trackedMinutes = tracked
  out.todayMinutes = Math.max(tracked, out.inferredMinutes)
  out.today = out.byDay[dayKey(new Date())] || 0
  out.streak = calcStreak(out.byDay)
  return out
}

const PHASE_CN = {
  opening: '开场',
  goal: '目标确认',
  probe: '学情探测',
  breakdown: '知识点拆解',
  teach: '逐点教学',
  check: '阶段检验',
  wrap: '收尾',
}
const PHASE_ORDER = ['opening', 'goal', 'probe', 'breakdown', 'teach', 'check', 'wrap']

async function fill(stage) {
  const api = window.costudy
  if (!api) {
    console.log('[DIAG]' + JSON.stringify({ stage: 'home-fill-skip', why: 'no-api' }))
    return
  }
  let ov = null
  let topic = null
  let stats = { byDay: {}, total: 0, days: 0, today: 0, lastAt: 0, sessions: [], streak: 0 }
  try {
    const r = await Promise.allSettled([
      api.learnOverview ? api.learnOverview() : Promise.resolve(null),
      api.learnTopic ? api.learnTopic() : Promise.resolve(null),
      loadStats(),
    ])
    if (r[0].status === 'fulfilled') ov = r[0].value
    if (r[1].status === 'fulfilled') topic = r[1].value
    if (r[2].status === 'fulfilled' && r[2].value) stats = r[2].value
  } catch {
    /* 全部拿不到就走占位 */
  }
  if (!stage.isConnected) {
    console.log('[DIAG]' + JSON.stringify({ stage: 'home-fill-skip', why: 'detached' }))
    return
  }

  const card = (ov && ov.card) || null
  const counts = (ov && ov.profile && ov.profile.counts) || null
  const address = String((card && card.address) || '同学').trim()
  const phase = String((ov && ov.session && ov.session.phase) || '')

  /* ---------- 标语 ---------- */
  // 一句话：「欢迎回来，{称呼}，今天也一起进步」。
  // 称呼取角色卡里的"怎么称呼学习者"（cards.address），没填就退回「同学」。
  const title = stage.querySelector('[data-hm-title]')
  const chip = stage.querySelector('[data-hm-chip]')
  if (title) title.textContent = '欢迎回来，' + address + '，今天也一起进步'
  if (chip) chip.textContent = counts ? '今日待复习 ' + counts.dueToday + ' 条' : '今日待复习 —'

  /* ---------- 四张指标卡 ---------- */
  const setNum = (sel, v) => {
    const el = stage.querySelector(sel)
    if (!el) return
    const unit = el.querySelector('small')
    el.textContent = (v === null || v === undefined ? '—' : String(v)) + ' '
    if (unit) el.appendChild(unit)
  }
  setNum('[data-hm-today]', stats.today)
  setNum('[data-hm-due]', counts ? counts.dueToday : null)
  setNum('[data-hm-points]', counts ? counts.points : null)
  setNum('[data-hm-minutes]', stats.todayMinutes || 0)
  setNum('[data-hm-streak]', stats.streak || 0)

  /* ---------- 今日学习计划 ---------- */
  // 数据源优先级：用户自己声明的「学习主题」> 会话 goal。
  // 不用 session.goal 优先：latestSession() 会拿会话标题兜底，而标题是第一条用户消息，
  // 直接显示就成了"目标：我想先试试判别式"。
  const topicGoal = String((topic && topic.goal) || '').trim()
  const course = String((topic && topic.course) || '').trim()
  const rawGoal = String((ov && ov.session && ov.session.goal) || '').trim()
  const PLACEHOLDER_GOALS = ['新会话', '开场', '开场白', '会话']
  const sessionGoal =
    phase && phase !== 'opening' && rawGoal && !PLACEHOLDER_GOALS.includes(rawGoal) ? rawGoal : ''
  const goal = topicGoal || course || sessionGoal
  const goalEl = stage.querySelector('[data-hm-goal]')
  if (goalEl) goalEl.textContent = goal || '还没定 —— 进学习页说一句想学什么'

  const note = stage.querySelector('[data-hm-plan-note]')
  const due = (ov && ov.due) || []
  const weak = (ov && ov.profile && ov.profile.weakPoints) || []
  if (note) {
    if (due.length) {
      note.textContent = '有 ' + due.length + ' 个知识点到期，先复习再往下学，记得更牢。'
    } else if (weak.length && weak[0].name) {
      note.textContent = '最薄弱的是「' + weak[0].name + '」，可以今天就攻它。'
    } else {
      note.textContent = '进学习页说一句想学什么，我会按你的进度安排今天的内容。'
    }
  }
  const phaseIdx = PHASE_ORDER.indexOf(phase)
  const prog = stage.querySelector('[data-hm-progress]')
  const progN = stage.querySelector('[data-hm-progress-n]')
  if (phaseIdx >= 0) {
    if (prog) prog.style.width = Math.round(((phaseIdx + 1) / PHASE_ORDER.length) * 100) + '%'
    if (progN) progN.textContent = PHASE_CN[phase] + ' ' + (phaseIdx + 1) + '/' + PHASE_ORDER.length
  } else {
    if (prog) prog.style.width = '0%'
    if (progN) progN.textContent = '还没开始'
  }

  /* ---------- 接下来要复习 ---------- */
  // 没有到期的条目时，退回到「最薄弱的知识点」—— 都是真实数据，
  // 比摆一句"还没有"有用得多（那张卡也不会空成一条）。
  const dueHost = stage.querySelector('[data-hm-due-list]')
  if (dueHost) {
    const rows = due.length
      ? due.slice(0, 3).map((d) => ({
          name: d.name,
          sub: (d.subject || '') + ' · 掌握度 ' + Math.round((d.mastery || 0) * 100) + '%',
          tag: '待复习',
          tone: 'due',
          btn: '开始复习',
        }))
      : weak.slice(0, 3).map((w) => ({
          name: w.name,
          sub: '掌握度 ' + Math.round((w.mastery || 0) * 100) + '%',
          tag: '最薄弱',
          tone: 'due',
          btn: '去练一下',
        }))
    dueHost.innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              '<div class="hm-row"><span class="hm-row-i">' + ICON.books + '</span>' +
              '<div class="hm-row-b"><div class="hm-row-n">' + esc(r.name) + '</div>' +
              '<div class="hm-row-s">' + esc(r.sub) + '</div></div>' +
              '<span class="hm-tag" data-tone="' + r.tone + '">' + r.tag + '</span>' +
              '<button class="hm-row-btn" type="button" data-hm-review>' + r.btn + '</button></div>',
          )
          .join('')
      : '<div class="hm-empty">还没有到期的知识点，也还没有记下薄弱点 —— 学起来就有了。</div>'
    dueHost.querySelectorAll('[data-hm-review]').forEach((b) => b.addEventListener('click', openLearn))
  }

  /* ---------- 最近学习记录 ---------- */
  const recentHost = stage.querySelector('[data-hm-recent]')
  if (recentHost) {
    const rows = (stats.sessions || []).filter((s) => s.count > 0)
    recentHost.innerHTML = rows.length
      ? rows
          .map(
            (s) =>
              '<div class="hm-row"><span class="hm-row-i">' + ICON.list + '</span>' +
              '<div class="hm-row-b"><div class="hm-row-n">' + esc(s.title) + '</div>' +
              '<div class="hm-row-s">' + esc(relativeDay(s.updatedAt)) + ' · ' + s.count + ' 条对话</div></div>' +
              '<span class="hm-tag" data-tone="done">' + esc(PHASE_CN[s.phase] || '记录') + '</span></div>',
          )
          .join('')
      : '<div class="hm-empty">还没有学习记录 —— 进学习页开个头。</div>'
  }

  /* ---------- 我的伴学角色 ---------- */
  const emojiEl = stage.querySelector('[data-hm-emoji]')
  const nameEl = stage.querySelector('[data-hm-name]')
  const roleD = stage.querySelector('[data-hm-role-d]')
  if (emojiEl && card && card.emoji) emojiEl.textContent = card.emoji
  if (nameEl) nameEl.textContent = (card && card.name) || '还没有角色卡'
  if (roleD) {
    const p = String((card && card.personality) || '').trim()
    roleD.textContent = p ? p.slice(0, 40) : '在角色工坊里设定性格、教法与称呼'
  }

  /* ---------- 本周学习趋势（曲线） ---------- */
  drawWeek(stage, stats)

  /* ---------- 今日观察（真实计数拼的规则文案，不是模型结论） ---------- */
  const observe = stage.querySelector('[data-hm-observe]')
  if (observe) {
    const bits = []
    if (stats.total === 0) {
      bits.push('还没有对话记录 —— 说说你今天想弄懂什么，观察就会从这里开始。')
    } else {
      bits.push('你已经和 TA 聊了 <b>' + stats.total + '</b> 条，覆盖 <b>' + (stats.days || 0) + '</b> 天。')
      if (counts && counts.dueToday > 0) {
        bits.push('今天有 <b>' + counts.dueToday + '</b> 个知识点到期，先复习再学新的效率最高。')
      } else {
        bits.push('今天没有到期的复习，可以放心往前走。')
      }
      if (counts && counts.openMistakes > 0) {
        bits.push('还有 <b>' + counts.openMistakes + '</b> 道错题没纠正，别让它们一直挂着。')
      }
    }
    observe.innerHTML = bits.join(' ')
  }
}

function drawWeek(stage, stats) {
  const host = stage.querySelector('[data-hm-chart]')
  if (!host) return
  const days = []
  const now = new Date()
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    days.push({ d, key: dayKey(d), n: stats.byDay[dayKey(d)] || 0, today: i === 0 })
  }
  // 参考图是「周一…周日」，所以用带"周"的星期名
  const CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  /* 曲线分布（不是柱状图）。
     为什么自己算坐标而不用固定 viewBox：
       preserveAspectRatio="none" 会把线宽横向拉扁，卡片一变宽线就粗细不均；
       所以要按容器的实际像素画，并在 resize 后重画一次。 */
  const paint = () => {
    if (!host.isConnected) return
    const W = Math.max(220, Math.round(host.clientWidth))
    const H = Math.max(72, Math.round(host.clientHeight))
    const padL = 12
    const padR = 12
    const padT = 18
    const padB = 22
    const iw = Math.max(1, W - padL - padR)
    const ih = Math.max(1, H - padT - padB)
    const max = Math.max(1, ...days.map((x) => x.n))
    const baseY = padT + ih

    const pts = days.map((x, i) => ({
      x: padL + (iw * i) / (days.length - 1),
      // 全 0 的那天贴底但抬 1.5px：正好压在轴线上会看不清线在哪
      y: x.n === 0 ? baseY - 1.5 : padT + ih - (x.n / max) * ih * 0.9,
      n: x.n,
      key: x.key,
      label: CN[x.d.getDay()],
      today: x.today,
    }))

    const line = smoothPath(pts)
    const area =
      line + ' L ' + pts[pts.length - 1].x.toFixed(1) + ' ' + baseY.toFixed(1) +
      ' L ' + pts[0].x.toFixed(1) + ' ' + baseY.toFixed(1) + ' Z'

    const dots = pts
      .map(
        (p) =>
          '<circle data-dot cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' +
          (p.today ? 4.2 : 3.2) + '" fill="' + (p.today ? '#0a7ae6' : '#ffffff') +
          '" stroke="#2f8ef0" stroke-width="2"><title>' + esc(p.key + '：' + p.n + ' 条') + '</title></circle>',
      )
      .join('')
    const vals = pts
      .filter((p) => p.n > 0)
      .map(
        (p) =>
          '<text data-val x="' + p.x.toFixed(1) + '" y="' + (p.y - 9).toFixed(1) + '" text-anchor="middle">' +
          p.n + '</text>',
      )
      .join('')
    const labels = pts
      .map(
        (p) =>
          '<text' + (p.today ? ' data-today-label' : '') + ' x="' + p.x.toFixed(1) + '" y="' +
          (baseY + 15).toFixed(1) + '" text-anchor="middle">' + p.label + '</text>',
      )
      .join('')

    host.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="最近 7 天对话分布">' +
      '<defs><linearGradient id="hm-week-fill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#2f8ef0" stop-opacity="0.30"/>' +
      '<stop offset="100%" stop-color="#2f8ef0" stop-opacity="0.02"/></linearGradient></defs>' +
      '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (W - padR) + '" y2="' + baseY +
      '" stroke="rgba(120,148,178,0.22)" stroke-width="1"/>' +
      '<path d="' + area + '" fill="url(#hm-week-fill)"/>' +
      '<path data-line d="' + line + '" fill="none" stroke="#2f8ef0" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>' +
      dots + vals + labels + '</svg>'
  }

  paint()
  // 卡片宽度变了（窗口缩放 / 最大化）要重画，否则线会被拉变形
  window.addEventListener('resize', paint)

  const sum = days.reduce((a, b) => a + b.n, 0)
  const foot = stage.querySelector('[data-hm-chart-foot]')
  if (foot) {
    if (sum > 0) {
      foot.style.display = ''
      foot.textContent = '最近 7 天一共 ' + sum + ' 条对话。'
    } else {
      foot.style.display = 'none'
    }
  }
}

/**
 * Catmull-Rom → 三次贝塞尔，得到一条穿过所有数据点的平滑曲线。
 * tension 0.5 时最"顺"，再大曲线会在两点之间甩出去（0 值那天被顶起来，很假）。
 */
function smoothPath(pts) {
  if (!pts.length) return ''
  if (pts.length === 1) return 'M ' + pts[0].x + ' ' + pts[0].y
  const t = 0.5
  let d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1)
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1.x + ((p2.x - p0.x) / 6) * t * 2
    const c1y = p1.y + ((p2.y - p0.y) / 6) * t * 2
    const c2x = p2.x - ((p3.x - p1.x) / 6) * t * 2
    const c2y = p2.y - ((p3.y - p1.y) / 6) * t * 2
    d +=
      ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) +
      ', ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
      ', ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1)
  }
  return d
}