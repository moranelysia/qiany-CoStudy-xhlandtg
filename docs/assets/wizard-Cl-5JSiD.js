import { a as PRESETS, c as TEMPLATES, d as blurSwap, f as esc, g as toggleRow, h as syncSlider, i as LESSON, l as avatar, m as sliderRow, n as ERROR_OPTIONS, o as STAGE_OPTIONS, p as segmented, r as EXERCISE_OPTIONS, s as TEACHING, t as DIMS, u as bindSlider } from "./index-DT_C8qLB.js";
//#region src/renderer/src/app/wizard.js
var STYLE = `/* Wizard · 布局层 */
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

.v-wiz .wiz-head { padding-bottom: 4px; }

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
.v-wiz .tpl-head { display: flex; align-items: center; gap: 8px; }
.v-wiz .tpl-mark {
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--tone-2); color: var(--ink);
  font-size: var(--fs-caption); font-weight: 600;
  flex: none;
}
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
`;
var step = 0;
var STEPS = [
	{
		t: "选个起点",
		s: "从模板开始，或空手建"
	},
	{
		t: "调性格",
		s: "12 个维度，拖到你满意"
	},
	{
		t: "定教法",
		s: "怎么讲、怎么练、怎么纠错"
	},
	{
		t: "确认",
		s: "看一眼编译结果"
	}
];
var state = {
	templateId: "senior",
	name: "温柔学姐",
	emoji: "🌸",
	nickname: "同学",
	catchphrase: "来，我们一起看看",
	stage: "高中",
	exercise: "中",
	errorMode: "引导自检",
	dims: JSON.parse(JSON.stringify(DIMS)),
	teaching: JSON.parse(JSON.stringify(TEACHING)),
	learnMode: "plan"
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
	return STEPS.map((s, i) => `
    <div class="step${i < step ? " is-done" : ""}${i === step ? " is-now" : ""}">
      <span class="step-dot">${i < step ? "✓" : i + 1}</span>
      <span>
        <span class="step-label">${esc(s.t)}</span>
        <span class="step-sub" style="display:block">${esc(s.s)}</span>
      </span>
      <span class="step-line"></span>
    </div>`).join("");
}
function stepBody() {
	if (step === 0) return `
      <div class="tpl-grid">
        ${TEMPLATES.slice(0, 6).map((t) => `
          <button class="tpl${t.id === state.templateId ? " is-on" : ""}" data-tpl="${t.id}">
            <div class="tpl-head">
              <span class="tpl-mark">${esc([...t.name][0])}</span>
              <span class="tpl-name">${esc(t.name)}</span>
            </div>
            <div class="tpl-line">${esc(t.line)}</div>
          </button>`).join("")}
      </div>
      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label><span class="small muted">角色名</span><input class="input" data-in="name" value="${esc(state.name)}" /></label>
        <label><span class="small muted">怎么称呼你</span><input class="input" data-in="nickname" value="${esc(state.nickname)}" /></label>
      </div>`;
	if (step === 1) return `<div class="dims2">${state.dims.map((d) => sliderRow(d)).join("")}</div>`;
	if (step === 2) return `
      <div style="display:grid;gap:14px">
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
          ${state.teaching.filter((t) => t.label).map(toggleRow).join("")}
        </div>
      </div>`;
	return `
    <div class="review-card">
      <dl class="kv" style="margin:0">
        <dt>角色</dt><dd>${esc(state.emoji)} ${esc(state.name)}</dd>
        <dt>称呼你</dt><dd>${esc(state.nickname)}</dd>
        <dt>口头禅</dt><dd>${esc(state.catchphrase)}</dd>
        <dt>学段</dt><dd>${esc(state.stage)}</dd>
        <dt>教法</dt><dd>讲解 ${state.teaching.find((x) => x.key === "explain").value}% · 练习${esc(state.exercise)} · ${esc(state.errorMode)}</dd>
        <dt>开关</dt><dd>${state.teaching.filter((t) => t.label && t.on).map((t) => esc(t.label)).join("、") || "全部关闭"}</dd>
      </dl>
    </div>
    <p class="small muted" style="margin:12px 0 0">
      保存后，这个角色会有自己独立的记忆与画像，跟其他角色互不干扰。
    </p>`;
}
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
              ${LESSON.points.map((k, i) => `
                <div class="kp ${k.state === "done" ? "is-done" : k.state === "doing" ? "is-doing" : ""}">
                  <span class="kp-mark">${k.state === "done" ? "✓" : i + 1}</span>
                  <span>
                    <span class="kp-name">${esc(k.name)}</span>
                    <span class="kp-sub" style="display:block">${k.state === "done" ? "已掌握" : k.state === "doing" ? "进行中 · 你自己讲一遍就算过" : "还没开始"}</span>
                  </span>
                  <span class="mastery">
                    <span class="bar"><i style="width:${pct(k.mastery)}%"></i></span>
                    <span class="mastery-num">${pct(k.mastery)}%</span>
                  </span>
                </div>`).join("")}
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
            ${LESSON.review.map((r) => `<div class="side-item"><b>${esc(r.text)}</b><span class="pill-due">${esc(r.due)}</span>
                  <div class="why">因为上次在「${esc(r.point)}」卡住过</div></div>`).join("")}
          </div>

          <div class="side-card card">
            <div class="side-title">你的高频错误</div>
            ${LESSON.errors.map((e) => `<div class="side-item"><b>${esc(e.text)}</b>
                  <div class="why">${esc(e.point)} · ${esc(e.when)} · 出现 ${e.repeat} 次</div></div>`).join("")}
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
	root.querySelectorAll("[data-start],[data-skip],[data-profile],[data-back]").forEach((b) => b.addEventListener("click", () => {
		if (b.hasAttribute("data-back")) {
			state.learnMode = "wizard";
			render(root);
			return;
		}
		window.__toast?.(b.textContent.trim());
	}));
}
function render(root) {
	if (state.learnMode === "plan") {
		learnSurface(root);
		return;
	}
	const canNext = step < 3;
	const body = stepBody();
	root.innerHTML = `
  <div class="nav">
    <div class="nav-inner">
      <span class="avatar" style="--sz:26px">${state.emoji}</span>
      <span class="nav-title">新建角色</span>
      <span class="nav-sub">第 ${step + 1} / 4 步</span>
      <span class="nav-spacer"></span>
      <button class="btn sm" data-preview-learn>预览学习界面</button>
    </div>
  </div>
  <div class="app v-wiz">
    <aside class="steps">
      ${renderSteps()}
      <button class="btn ghost sm" style="margin-top:14px" data-preview-learn>预览学习界面 →</button>
    </aside>
    <main class="wiz-main">
      <div class="wiz-head">
        
        <h1 class="wiz-title">${esc(STEPS[step].t)}</h1>
        <p class="wiz-sub">${esc(STEPS[step].s)}</p>
      </div>
      <section class="card wiz-body blur-bridge" data-wizbody>${body}</section>
      <div class="wiz-foot">
        <button class="btn ghost" data-prev ${step === 0 ? "disabled" : ""}>← 上一步</button>
        <span style="flex:1"></span>
        ${canNext ? "<button class=\"btn primary\" data-next>下一步 →</button>" : "<button class=\"btn primary\" data-done>保存并开始学习</button>"}
      </div>
    </main>
  </div>`;
	if (step === 0) {
		root.querySelectorAll("[data-tpl]").forEach((btn) => btn.addEventListener("click", () => {
			applyPreset(btn.dataset.tpl);
			render(root);
		}));
		root.querySelectorAll("[data-in]").forEach((el) => el.addEventListener("input", () => {
			state[el.dataset.in] = el.value;
		}));
	}
	if (step === 1) state.dims.forEach((d) => {
		bindSlider(root, d.key, (k, v) => {
			const t = state.dims.find((x) => x.key === k);
			if (t) t.value = v;
		});
	});
	if (step === 2) {
		const exp = root.querySelector("[data-dim=\"explain\"] [data-slider]");
		exp.addEventListener("input", () => {
			const v = Number(exp.value);
			syncSlider(root, "explain", v);
			state.teaching.find((x) => x.key === "explain").value = v;
		});
		root.querySelector("[data-stage]").innerHTML = segmented("stage", STAGE_OPTIONS, state.stage, "学段");
		root.querySelector("[data-exercise]").innerHTML = segmented("exercise", EXERCISE_OPTIONS, state.exercise, "出题频率");
		root.querySelector("[data-errormode]").innerHTML = segmented("error", ERROR_OPTIONS, state.errorMode, "错误处理");
		root.querySelectorAll("[data-segmented]").forEach((seg) => {
			seg.addEventListener("click", (e) => {
				const b = e.target.closest("[data-value]");
				if (!b) return;
				seg.querySelectorAll("[data-value]").forEach((x) => {
					x.classList.toggle("is-on", x === b);
					x.setAttribute("aria-checked", String(x === b));
				});
				const n = seg.dataset.segmented;
				if (n === "stage") state.stage = b.dataset.value;
				if (n === "exercise") state.exercise = b.dataset.value;
				if (n === "error") state.errorMode = b.dataset.value;
			});
		});
		root.querySelectorAll("[data-toggle]").forEach((row) => {
			const input = row.querySelector("[data-switch]");
			input.addEventListener("change", () => {
				const t = state.teaching.find((x) => x.key === row.dataset.toggle);
				if (t) t.on = input.checked;
			});
		});
	}
	root.querySelector("[data-prev]")?.addEventListener("click", () => {
		if (step === 0) return;
		blurSwap(root.querySelector("[data-wizbody]"), () => {
			step -= 1;
			render(root);
		});
	});
	root.querySelector("[data-next]")?.addEventListener("click", () => {
		if (root.closest(".mh-wizard")) {
			step += 1;
			render(root);
			return;
		}
		blurSwap(root.querySelector("[data-wizbody]"), () => {
			step += 1;
			render(root);
		});
	});
	root.querySelector("[data-done]")?.addEventListener("click", () => {
		(async () => {
			const api = window.costudy;
			if (!api?.cards) {
				window.__toast?.("角色卡接口不可用");
				return;
			}
			const created = await api.cards.create(state.name || "新角色");
			if (!created) {
				window.__toast?.("新建角色卡失败");
				return;
			}
			const target = created;
			await api.cards.setActive(target.id);
			const dims = {};
			state.dims.forEach((d) => {
				dims[d.key] = d.value;
			});
			const patch = {
				name: state.name,
				emoji: state.emoji,
				address: state.nickname,
				catchphrase: state.catchphrase,
				dims
			};
			try {
				const detail = await api.cards.get(target.id);
				if (!String(detail?.postHistoryInstructions ?? "").trim()) {
					const explain = state.teaching.find((x) => x.key === "explain");
					const on = state.teaching.filter((t) => t.label && t.on).map((t) => t.label);
					patch.postHistoryInstructions = "教法：讲解 " + (explain ? explain.value : 50) + "%、练习" + state.exercise + "、错误处理「" + state.errorMode + "」" + (on.length ? "；开启：" + on.join("、") : "；开关全部关闭") + "。";
				}
			} catch (e) {}
			const res = await api.cards.save(target.id, patch);
			if (!res.ok) {
				window.__toast?.("保存失败：" + (res.error ?? "未知原因"));
				return;
			}
			window.dispatchEvent(new CustomEvent("costudy:card-changed"));
			window.__toast?.("「" + state.name + "」已保存，开始学习");
			window.__costudySetActive?.(2);
			window.setTimeout(() => window.__costudyEnterLearn?.(), 320);
		})();
	});
	root.querySelector("[data-preview-learn]")?.addEventListener("click", () => {
		state.learnMode = "plan";
		render(root);
	});
}
function mount(root) {
	const styleEl = document.createElement("style");
	styleEl.textContent = STYLE;
	document.head.appendChild(styleEl);
	step = 0;
	state.learnMode = "wizard";
	applyPreset("senior");
	render(root);
}
//#endregion
export { mount };
