//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region src/renderer/src/cards-ui.ts
var cards_ui_exports = /* @__PURE__ */ __exportAll({
	readDimsFromDom: () => readDimsFromDom,
	syncCardsToRail: () => syncCardsToRail,
	syncDimsFromCard: () => syncDimsFromCard,
	syncIdentityInputs: () => syncIdentityInputs,
	syncPreviewReplyName: () => syncPreviewReplyName
});
function cardsApi() {
	return window.costudy?.cards ?? null;
}
/** 与原型里 avatar() 产出的结构保持一致，样式才不会错位 */
function avatarMarkup(emoji, size = 30) {
	return `<span class="avatar" style="--sz:${size}px">${emoji.replace(/[<>&]/g, "")}</span>`;
}
/**
* 角色卡上的删除按钮样式。
*
* 为什么注入一份而不是改 studio.js：
*   那三个变体是原型代码，卡片行（.card-item）由它们负责画；这里只在需要时
*   追加一条自己的样式，不去动它的 CSS。
*   变体切换时主进程那边会把挂载后新增的 <style> 全部清掉（installVariantPicker
*   的 clearVariantStyles），所以每次重画列表都要检查一遍有没有被清走。
*/
var DEL_STYLE = `
.v-studio .card-item .card-del {
  margin-left: auto;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 15px;
  line-height: 1;
  color: var(--label-2);
  opacity: .32;
  transition: opacity .12s ease, background-color .12s ease, color .12s ease;
}
.v-studio .card-item:hover .card-del,
.v-studio .card-item .card-del.is-armed { opacity: 1; }
.v-studio .card-item .card-del:hover { background: rgba(255, 59, 48, .12); color: #ff3b30; }
.v-studio .card-item .card-del.is-armed {
  width: auto;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 59, 48, .14);
  color: #ff3b30;
}
@media (hover: none) { .v-studio .card-item .card-del { opacity: 1; } }
`;
function ensureDelStyle() {
	if (document.querySelector("[data-carddel-style]")) return;
	const el = document.createElement("style");
	el.setAttribute("data-carddel-style", "");
	el.textContent = DEL_STYLE;
	document.head.appendChild(el);
}
function renderRail(rail, list) {
	if (list.length === 0) {
		rail.innerHTML = "<p class=\"small muted\" style=\"margin:6px;line-height:1.6\">还没有角色<br />点上面「＋新建」造一个</p>";
		return;
	}
	rail.innerHTML = list.map((card) => {
		const id = card.id.replace(/[&<>"']/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[c]);
		return `
    <button class="card-item${card.isActive ? " is-on" : ""}" data-card="${id}">
      ${avatarMarkup(card.emoji || "✧")}
      <span class="card-meta">
        <span class="card-name">${card.name.replace(/[<>&]/g, "")}</span>
        <span class="card-line">${card.isActive ? "当前角色" : card.name === "新角色" ? "还没开始塑造" : "已保存"}</span>
      </span>
      <span class="card-del" data-card-del="${id}" title="删除这个角色" aria-label="删除">×</span>
    </button>`;
	}).join("");
}
/** 把卡片的身份字段填进编辑器（名字 / 称呼） */
async function fillEditor(api, id) {
	const card = await api.get(id);
	if (!card) return;
	const name = String(card.name ?? "");
	const address = String(card.address ?? "");
	const nameInput = document.querySelector(".v-studio [data-in=\"name\"]");
	if (nameInput && name) {
		nameInput.value = name;
		nameInput.dispatchEvent(new Event("input", { bubbles: true }));
	}
	const addressInput = document.querySelector(".v-studio [data-in=\"address\"], .v-studio [data-in=\"learner\"]");
	if (addressInput && address) {
		addressInput.value = address;
		addressInput.dispatchEvent(new Event("input", { bubbles: true }));
	}
}
/**
* 同步一次。返回是否用真实卡替换了列表。
* 每次变体挂载后调用一次即可（Studio 才有角色栏）。
*/
async function syncCardsToRail() {
	const api = cardsApi();
	if (!api) return false;
	const rail = document.querySelector(".v-studio [data-cards]");
	if (!rail) return false;
	let list = [];
	try {
		list = await api.list();
	} catch {
		return false;
	}
	if (!list.length) {
		ensureDelStyle();
		renderRail(rail, list);
		return true;
	}
	ensureDelStyle();
	renderRail(rail, list);
	let armedEl = null;
	let armedTimer = 0;
	const disarmAll = () => {
		rail.querySelectorAll(".card-del").forEach((node) => {
			node.classList.remove("is-armed");
			node.textContent = "×";
		});
		armedEl = null;
	};
	rail.querySelectorAll("[data-card-del]").forEach((el) => {
		el.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			const id = el.dataset.cardDel ?? "";
			if (!id) return;
			if (armedEl !== el) {
				disarmAll();
				armedEl = el;
				el.classList.add("is-armed");
				el.textContent = "删?";
				window.clearTimeout(armedTimer);
				armedTimer = window.setTimeout(() => disarmAll(), 3e3);
				return;
			}
			window.clearTimeout(armedTimer);
			const rowName = el.closest(".card-item")?.querySelector(".card-name")?.textContent?.trim() ?? "这个角色";
			armedEl = null;
			(async () => {
				if (!await api.remove(id)) {
					window.__toast?.("删不掉：这张卡可能已经不在磁盘上了");
					disarmAll();
					return;
				}
				await syncCardsToRail();
				window.dispatchEvent(new CustomEvent("costudy:card-changed"));
				window.__toast?.("已删除「" + rowName + "」");
			})();
		});
	});
	rail.querySelectorAll("[data-card]").forEach((el) => {
		el.addEventListener("click", () => {
			const id = el.dataset.card ?? "";
			if (!id) return;
			(async () => {
				await api.setActive(id);
				rail.querySelectorAll("[data-card]").forEach((node) => {
					node.classList.toggle("is-on", node === el);
					const caption = node.querySelector(".card-line");
					if (caption) caption.textContent = node === el ? "当前角色" : "已保存";
				});
				await fillEditor(api, id);
				if (window.costudy?.rolePromptPreview) {
					await syncIdentityInputs();
					await syncDimsFromCard();
				}
				window.dispatchEvent(new CustomEvent("costudy:card-changed"));
			})();
		});
	});
	const active = list.find((c) => c.isActive) ?? list[0];
	if (active) await fillEditor(api, active.id);
	return true;
}
/**
* 把「身份」面板的输入框接到当前卡上。
*
* 之前这里是写死的「温柔学姐」—— 卡片改了名字，面板还显示旧值，
* 属于典型的 UI 夹具。现在挂载后按当前卡回填一次。
*/
async function syncIdentityInputs() {
	const api = window.costudy;
	if (!api?.cards) return false;
	try {
		const list = await api.cards.list();
		const active = list.find((c) => c.isActive) ?? list[0];
		if (!active) return false;
		const card = await api.cards.get(active.id);
		if (!card) return false;
		const nameEl = document.querySelector(".v-studio [data-in=\"name\"]");
		const nickEl = document.querySelector(".v-studio [data-in=\"nickname\"]");
		if (nameEl && nameEl.value !== card.name) {
			nameEl.value = card.name;
			nameEl.dispatchEvent(new Event("input", { bubbles: true }));
		}
		if (nickEl && card.address && nickEl.value !== card.address) {
			nickEl.value = card.address;
			nickEl.dispatchEvent(new Event("input", { bubbles: true }));
		}
		if (window.costudy?.rolePromptPreview) {
			const phrase = document.querySelector(".v-studio [data-in=\"catchphrase\"]");
			if (phrase) {
				phrase.value = card.catchphrase ?? "";
				phrase.dispatchEvent(new Event("input", { bubbles: true }));
			}
			const choices = {
				stage: card.stage ?? "高中",
				exercise: card.exercise ?? "中",
				error: card.errorMode ?? "立刻纠正"
			};
			for (const [name, value] of Object.entries(choices)) document.querySelectorAll(".v-studio [data-segmented=\"" + name + "\"] [data-value]").forEach((button) => {
				if (button.dataset.value === value) button.click();
			});
		}
		return true;
	} catch {
		return false;
	}
}
/** 从 DOM 读 12 维滑条的当前值（保存时用） */
function readDimsFromDom() {
	const out = {};
	document.querySelectorAll(".v-studio [data-dims] [data-dim]").forEach((row) => {
		const key = row.getAttribute("data-dim");
		const input = row.querySelector("[data-slider]");
		if (key && input) out[key] = Number(input.value);
	});
	return out;
}
/**
* 把卡片里的 12 维值灌进滑条。
*
* 之前滑条只活在 studio.js 的 state.dims 里，和 card.dims 是两套数据：
* 换一张卡，滑条还停在上一个角色的值 —— 典型的 UI 夹具。
* 这里逐个 dispatch input，让 studio 自己的 onDimChange 跑一遍，
* 这样内部 state 也跟着同步，不用去碰它的私有变量。
*/
async function syncDimsFromCard() {
	const api = window.costudy;
	if (!api?.cards) return false;
	try {
		const list = await api.cards.list();
		const active = list.find((c) => c.isActive) ?? list[0];
		if (!active) return false;
		const card = await api.cards.get(active.id);
		if (!card?.dims) return false;
		let applied = 0;
		const selector = api.rolePromptPreview ? ".v-studio [data-dim]" : ".v-studio [data-dims] [data-dim]";
		document.querySelectorAll(selector).forEach((row) => {
			const key = row.getAttribute("data-dim");
			const value = key ? card.dims[key] ?? (api.rolePromptPreview ? key === "explain" ? 38 : 50 : void 0) : void 0;
			if (!key || typeof value !== "number") return;
			const input = row.querySelector("[data-slider]");
			if (!input || Number(input.value) === value) return;
			input.value = String(value);
			input.dispatchEvent(new Event("input", { bubbles: true }));
			applied += 1;
		});
		return applied > 0;
	} catch {
		return false;
	}
}
/**
* 预览区的角色名接当前卡，并给"示例回复"打个标记。
*
* 两件事：
* 1. .reply-name 之前写死「温柔学姐」—— 换卡后名字不对，属于夹具
* 2. 预览回复本身是模板文案（没调模型），必须标出来，
*    否则用户会以为是真的在对话（这也是教训录 L13：别让人误以为真）
*/
async function syncPreviewReplyName() {
	const api = window.costudy;
	if (!api?.cards) return false;
	if (api.rolePromptPreview) return false;
	try {
		const list = await api.cards.list();
		const active = list.find((c) => c.isActive) ?? list[0];
		if (!active) return false;
		const card = await api.cards.get(active.id);
		if (!card) return false;
		const nameEl = document.querySelector(".v-studio .reply-name");
		if (nameEl && nameEl.textContent !== card.name) nameEl.textContent = card.name;
		const reply = document.querySelector(".v-studio .reply");
		if (reply && !reply.querySelector("[data-sample-badge]")) {
			const badge = document.createElement("span");
			badge.setAttribute("data-sample-badge", "");
			badge.textContent = "示例文案 · 未接模型";
			badge.style.cssText = "display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;font-size:10px;color:#5a6a7a;background:rgba(120,148,178,.16)";
			const head = reply.querySelector(".reply-name");
			if (head) head.appendChild(badge);
			else reply.prepend(badge);
		}
		return true;
	} catch {
		return false;
	}
}
//#endregion
export { syncIdentityInputs as a, syncDimsFromCard as i, readDimsFromDom as n, syncPreviewReplyName as o, syncCardsToRail as r, __exportAll as s, cards_ui_exports as t };
