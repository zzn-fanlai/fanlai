/* ============================================================
   饭来 · 菜谱库：列表 / 详情 / 编辑 / 导入解析
   ============================================================ */
import { store, select } from "../store.js";
import {
  esc,
  attr,
  uid,
  copyText,
  relativeDay,
  todayISO,
  fmtMDShort,
  truncate,
} from "../lib/util.js";
import {
  CUISINES,
  DISH_EMOJIS,
  DIFFICULTIES,
  ING_CATS,
  CAT_EMOJI,
  guessDishEmoji,
  platformLabel,
  inferIngCategory,
} from "../lib/catalog.js";
import { parseRecipe, detectPlatform } from "../lib/parse.js";
import { recognizeImage, assessOcrQuality } from "../lib/ocr.js";
import { qtyText } from "../lib/ingredients.js";
import { toast, notice, confirmAction, emptyState, chipRow, rerender } from "../ui/kit.js";
import { dishRow, ingredientList, stepList, sectionTitle } from "../ui/parts.js";

/* ---------- 视图内部状态 ---------- */
let listState = { q: "", cuisine: "" };
let importState = { raw: "", step: "input", parsed: null };
let editorDraft = null;

export function resetImport() {
  importState = { raw: "", step: "input", parsed: null, deepText: "" };
}

/* ============================================================
   列表
   ============================================================ */
export function list(ctx) {
  const dishes = select.dishes();
  const filtered = dishes.filter((d) => {
    if (listState.cuisine && d.cuisine !== listState.cuisine) return false;
    if (!listState.q) return true;
    const q = listState.q.toLowerCase();
    return (
      (d.title || "").toLowerCase().includes(q) ||
      (d.ingredients || []).some((i) => (i.name || "").toLowerCase().includes(q)) ||
      (d.tags || []).some((t) => String(t).toLowerCase().includes(q))
    );
  });

  const cuisineChips = [{ value: "", label: "全部" }, ...CUISINES.map((c) => ({ value: c, label: c }))];

  return {
    title: "菜谱库",
    sub: `${dishes.length} 道菜`,
    back: "#/cook",
    tab: "cook",
    top: [
      { emoji: "📥", to: "#/import", label: "导入" },
      { emoji: "＋", to: "#/dish/new", label: "新建" },
    ],
    html: `
      <div class="field" style="margin-bottom:6px">
        <input class="input" id="dish-search" placeholder="搜菜名、食材、标签" value="${attr(listState.q)}" />
      </div>
      ${chipRow(cuisineChips, listState.cuisine, "filter-cuisine")}
      ${
        dishes.length === 0
          ? emptyState({
              emoji: "📖",
              title: "菜谱库还是空的",
              hint: "从小红书/抖音粘一条文案进来，或者手写一道拿手菜。",
              action: `<div class="btn-row">
                <a class="btn btn-primary" href="#/import">导入链接</a>
                <a class="btn" href="#/dish/new">手动新建</a>
              </div>`,
            })
          : filtered.length === 0
          ? emptyState({ emoji: "🔍", title: "没找到这道菜", hint: "换个关键词，或者新建一道。" })
          : `<div class="list" id="dish-list">${filtered.map((d) => dishRow(d, { act: "open-dish" })).join("")}</div>`
      }
    `,
    actions: {
      "filter-cuisine"(el) {
        listState.cuisine = el.dataset.value;
        rerender();
      },
      "open-dish"(el) {
        location.hash = `#/dish/${el.dataset.id}`;
      },
    },
    afterRender(root) {
      const input = root.querySelector("#dish-search");
      if (input) {
        input.addEventListener("input", () => {
          listState.q = input.value.trim();
          const box = root.querySelector("#dish-list");
          if (!box) return;
          const rows = box.querySelectorAll(".row");
          rows.forEach((row) => {
            const title = row.querySelector(".t")?.textContent || "";
            const sub = row.querySelector(".row-sub")?.textContent || "";
            const hit = !listState.q || (title + sub).toLowerCase().includes(listState.q.toLowerCase());
            row.style.display = hit ? "" : "none";
          });
        });
      }
    },
  };
}

/* ============================================================
   详情
   ============================================================ */
export function detail(ctx) {
  const dish = select.dish(ctx.params.id);
  if (!dish || dish.deleted) {
    return {
      title: "菜谱",
      back: "#/dish",
      tab: "cook",
      html: emptyState({ emoji: "🫥", title: "这道菜不在了", hint: "可能被删掉了。", action: `<a class="btn" href="#/dish">回菜谱库</a>` }),
    };
  }

  const meta = [];
  if (dish.cook_minutes) meta.push(`⏱ ${dish.cook_minutes} 分钟`);
  if (dish.servings) meta.push(`🍽 ${dish.servings}`);
  if (dish.difficulty) meta.push(dish.difficulty);
  if (dish.cuisine) meta.push(dish.cuisine);

  return {
    title: dish.title || "菜谱",
    back: "#/dish",
    tab: "cook",
    top: [{ emoji: dish.favorite ? "⭐" : "☆", localAct: "toggle-fav", label: "收藏" }],
    html: `
      <div class="card sticker">
        <div class="flex" style="gap:12px;align-items:flex-start">
          <div style="font-size:44px;line-height:1">${esc(dish.emoji || "🍳")}</div>
          <div class="grow">
            <h2 style="font-size:21px;line-height:1.3">${esc(dish.title || "未命名")}</h2>
            <div class="row-sub mt-6">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
          </div>
        </div>
        ${dish.note ? `<div class="req-note" style="margin-top:12px">${esc(dish.note)}</div>` : ""}
        ${
          dish.source_url
            ? `<div class="mt-10 small"><a href="${attr(dish.source_url)}" target="_blank" rel="noopener noreferrer">查看原链接（${esc(
                platformLabel(dish.source_platform)
              )}）↗</a></div>`
            : ""
        }
      </div>

      <div class="btn-row mb-16">
        <button class="btn btn-primary" data-act="pick-this">点这道菜</button>
        <button class="btn" data-act="plan-this">排进菜单</button>
        <button class="btn btn-ghost" data-act="edit-this">编辑</button>
      </div>

      ${sectionTitle("食材", `<span class="muted tiny">${(dish.ingredients || []).length} 样</span>`)}
      ${ingredientList(dish.ingredients || [])}

      ${sectionTitle("做法", `<span class="muted tiny">${(dish.steps || []).length} 步</span>`)}
      <div class="card">${stepList(dish.steps || [])}</div>

      <button class="btn btn-danger btn-block mt-16" data-act="delete-this">删除这道菜</button>
    `,
    actions: {
      "toggle-fav"() {
        store.update("dishes", dish.id, { favorite: !dish.favorite });
        rerender();
      },
      "pick-this"() {
        location.hash = `#/cook/pick?dish=${dish.id}`;
      },
      "plan-this"() {
        location.hash = `#/cook/menu?dish=${dish.id}`;
      },
      "edit-this"() {
        location.hash = `#/dish/edit/${dish.id}`;
      },
      async "delete-this"() {
        const ok = await confirmAction({
          title: "删掉这道菜？",
          desc: "已经排进菜单的会保留快照，记录不受影响。",
          ok: "删除",
          danger: true,
        });
        if (!ok) return;
        store.remove("dishes", dish.id);
        toast("已删除");
        location.hash = "#/dish";
      },
    },
  };
}

/* ============================================================
   编辑器（新建 / 编辑 / 导入确认共用）
   ============================================================ */
function ingRowHtml(ing = {}) {
  return `<div class="ing-row" data-ing-row>
    <input class="input" data-f="name" placeholder="食材" value="${attr(ing.name || "")}" />
    <input class="input" data-f="qty" placeholder="数量" value="${attr(ing.qty ?? "")}" inputmode="decimal" />
    <input class="input" data-f="unit" placeholder="单位" value="${attr(ing.unit || "")}" />
    <select class="input" data-f="cat">
      ${ING_CATS.map((c) => `<option value="${c}" ${ing.category === c ? "selected" : ""}>${c}</option>`).join("")}
    </select>
    <button type="button" class="btn btn-xs btn-ghost" data-act="del-ing" aria-label="删除">✕</button>
  </div>`;
}

function stepRowHtml(step = {}) {
  return `<div class="step-row" data-step-row>
    <textarea class="input" data-f="text" rows="2" placeholder="这一步做什么">${esc(step.text || "")}</textarea>
    <input class="input" data-f="minutes" placeholder="分钟" inputmode="numeric" style="width:62px;min-height:44px" value="${attr(
      step.minutes ?? ""
    )}" />
    <button type="button" class="btn btn-xs btn-ghost" data-act="del-step" aria-label="删除">✕</button>
  </div>`;
}

function editorHtml({ dish = {}, mode = "new" } = {}) {
  const ings = dish.ingredients?.length ? dish.ingredients : [];
  const steps = dish.steps?.length ? dish.steps : [];
  return `
    <form data-form="save-dish" id="dish-form" novalidate>
      <input type="hidden" name="id" value="${attr(dish.id || "")}" />
      <div class="field">
        <label>菜名</label>
        <input class="input" name="title" maxlength="30" placeholder="比如：可乐鸡翅" value="${attr(dish.title || "")}" />
      </div>

      <div class="field">
        <label>封面表情</label>
        <input type="hidden" name="emoji" id="emoji-value" value="${attr(dish.emoji || "🍳")}" />
        <div class="chips" id="emoji-pick">
          ${DISH_EMOJIS.map(
            (e) =>
              `<button type="button" class="chip ${e === (dish.emoji || "🍳") ? "on" : ""}" data-act="pick-emoji" data-emoji="${e}" style="font-size:18px;padding:6px 10px">${e}</button>`
          ).join("")}
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>分类</label>
          <select class="input" name="cuisine">
            ${CUISINES.map((c) => `<option value="${c}" ${dish.cuisine === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>份量</label>
          <input class="input" name="servings" placeholder="2 人份" value="${attr(dish.servings || "")}" />
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>时长（分钟）</label>
          <input class="input" name="cook_minutes" inputmode="numeric" placeholder="30" value="${attr(
            dish.cook_minutes ?? ""
          )}" />
        </div>
        <div class="field">
          <label>难度</label>
          <select class="input" name="difficulty">
            ${DIFFICULTIES.map((d) => `<option value="${d}" ${dish.difficulty === d ? "selected" : ""}>${d}</option>`).join(
              ""
            )}
          </select>
        </div>
      </div>

      <div class="field">
        <label>食材 <span class="muted tiny">（数量可以写“适量”）</span></label>
        <div id="ing-rows">${(ings.length ? ings : [{}]).map((i) => ingRowHtml(i)).join("")}</div>
        <button type="button" class="btn btn-sm btn-ghost mt-6" data-act="add-ing">＋ 加一样食材</button>
      </div>

      <div class="field">
        <label>步骤</label>
        <div id="step-rows">${(steps.length ? steps : [{}]).map((s) => stepRowHtml(s)).join("")}</div>
        <button type="button" class="btn btn-sm btn-ghost mt-6" data-act="add-step">＋ 加一步</button>
      </div>

      <div class="field">
        <label>来源链接（可选）</label>
        <input class="input" name="source_url" placeholder="https://…" value="${attr(dish.source_url || "")}" />
      </div>

      <div class="field">
        <label>备注（可选）</label>
        <textarea class="input" name="note" maxlength="300" placeholder="比如：她爱吃甜口，糖多放一勺">${esc(
          dish.note || ""
        )}</textarea>
      </div>

      <button class="btn btn-primary btn-block mt-10" type="submit">${mode === "edit" ? "保存修改" : "存进菜谱库"}</button>
    </form>
  `;
}

function readEditor(form) {
  const val = (name) => (form.querySelector(`[name="${name}"]`)?.value || "").trim();

  const ingredients = Array.from(form.querySelectorAll("[data-ing-row]"))
    .map((row) => {
      const name = row.querySelector('[data-f="name"]').value.trim();
      const qtyRaw = row.querySelector('[data-f="qty"]').value.trim();
      const unit = row.querySelector('[data-f="unit"]').value.trim();
      const cat = row.querySelector('[data-f="cat"]').value;
      if (!name) return null;
      const num = Number(qtyRaw);
      const isNum = qtyRaw !== "" && !isNaN(num);
      return {
        name,
        qty: qtyRaw === "" ? "" : isNum ? num : qtyRaw,
        unit: isNum || qtyRaw === "" ? unit : "",
        vague: !isNum && qtyRaw !== "" ? true : false,
        category: cat || inferIngCategory(name),
      };
    })
    .filter(Boolean);

  const steps = Array.from(form.querySelectorAll("[data-step-row]"))
    .map((row) => {
      const text = row.querySelector('[data-f="text"]').value.trim();
      const minRaw = row.querySelector('[data-f="minutes"]').value.trim();
      if (!text) return null;
      const minutes = minRaw && !isNaN(Number(minRaw)) ? Number(minRaw) : null;
      return { text, minutes };
    })
    .filter(Boolean);

  const minutesRaw = val("cook_minutes");

  return {
    id: val("id") || "",
    title: val("title"),
    emoji: val("emoji") || "🍳",
    cuisine: val("cuisine") || "家常",
    servings: val("servings"),
    cook_minutes: minutesRaw && !isNaN(Number(minutesRaw)) ? Number(minutesRaw) : null,
    difficulty: val("difficulty") || "简单",
    ingredients,
    steps,
    source_url: val("source_url"),
    note: val("note"),
  };
}

const editorActions = {
  "pick-emoji"(el) {
    const emoji = el.dataset.emoji;
    const sel = document.getElementById("emoji-value");
    if (sel) sel.value = emoji;
    el.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === el));
  },
  "add-ing"() {
    document.getElementById("ing-rows")?.insertAdjacentHTML("beforeend", ingRowHtml({}));
  },
  "add-step"() {
    document.getElementById("step-rows")?.insertAdjacentHTML("beforeend", stepRowHtml({}));
  },
  "del-ing"(el) {
    const row = el.closest("[data-ing-row]");
    const all = document.querySelectorAll("[data-ing-row]");
    if (all.length <= 1) {
      row.querySelectorAll("input").forEach((i) => (i.value = ""));
      return;
    }
    row.remove();
  },
  "del-step"(el) {
    const row = el.closest("[data-step-row]");
    const all = document.querySelectorAll("[data-step-row]");
    if (all.length <= 1) {
      row.querySelectorAll("textarea,input").forEach((i) => (i.value = ""));
      return;
    }
    row.remove();
  },
};

export function edit(ctx) {
  const id = ctx.params.id;
  const dish = id ? select.dish(id) : null;
  if (id && (!dish || dish.deleted)) {
    return {
      title: "编辑菜谱",
      back: "#/dish",
      tab: "cook",
      html: emptyState({ emoji: "🫥", title: "这道菜不在了" }),
    };
  }
  return {
    title: dish ? "编辑菜谱" : "新建菜谱",
    back: dish ? `#/dish/${dish.id}` : "#/dish",
    tab: "cook",
    html: editorHtml({ dish: dish || {}, mode: dish ? "edit" : "new" }),
    actions: {
      ...editorActions,
      "save-dish"(form) {
        const data = readEditor(form);
        if (!data.title) {
          toast("菜名不能空");
          form.querySelector('[name="title"]')?.focus();
          return;
        }
        if (dish) {
          store.update("dishes", dish.id, data);
          toast("已保存", "ok");
          location.hash = `#/dish/${dish.id}`;
        } else {
          const row = store.create("dishes", {
            ...data,
            favorite: false,
            source_platform: data.source_url ? detectPlatform(data.source_url) : "manual",
          });
          toast("已存进菜谱库", "ok");
          location.hash = `#/dish/${row.id}`;
        }
      },
    },
  };
}

/* ============================================================
   导入（粘贴分享文案 → 本地解析 → 确认编辑）
   ============================================================ */
export function importPage(ctx) {
  // 深链接：#/import?text=<编码后的文本> —— 直接进确认页
  const deepText = ctx && ctx.query && ctx.query.text;
  if (deepText && importState.deepText !== deepText) {
    importState.deepText = deepText;
    importState.raw = deepText;
    importState.parsed = parseRecipe(deepText);
    importState.quality = assessOcrQuality(deepText, importState.parsed);
    importState.step = "confirm";
  }

  if (importState.step === "confirm" && importState.parsed) {
    const p = importState.parsed;
    const conf = p.confidence;
    const level =
      conf.level === "high" ? { text: "识别得挺完整，检查一下就可以存。", kind: "ok" } : conf.level === "medium" ? { text: "认出菜名了，食材和步骤可能不全，补两句吧。", kind: "" } : { text: "没认出菜名，手动填一下吧。", kind: "warn" };

    return {
      title: "确认这道菜",
      back: "#/import",
      tab: "cook",
      html: `
        ${notice(`识别到 <b>${conf.ingredients}</b> 样食材、<b>${conf.steps}</b> 步做法。${level.text}`, level.kind)}
        ${
          importState.quality && !importState.quality.ok
            ? notice(
                `⚠️ 这次识别质量不太好（得分 ${importState.quality.score}）：${esc(
                  (importState.quality.hints || []).join("；")
                )}<br>建议逐条核对，或者回上一页改成「相册长按复制文字 → 粘贴」，准确率会高很多。`,
                "warn"
              )
            : ""
        }
        ${editorHtml({ dish: { ...p, id: "" }, mode: "new" })}
        <details class="card flat mt-16">
          <summary class="small muted" style="cursor:pointer">查看识别到的原始文字（识别不对时点开复制发我）</summary>
          <textarea class="input mt-6" id="raw-echo" readonly style="min-height:140px;font-size:12px">${esc(
            importState.raw || ""
          )}</textarea>
          <button class="btn btn-sm btn-block mt-6" data-act="copy-raw">复制原文</button>
        </details>
        <button class="btn btn-ghost btn-block mt-6" data-act="back-input">换一段文案</button>
      `,
      actions: {
        ...editorActions,
        "back-input"() {
          importState.step = "input";
          rerender();
        },
        async "copy-raw"() {
          const ok = await copyText(importState.raw || "");
          toast(ok ? "已复制，粘给我看看" : "复制失败", ok ? "ok" : "err");
        },
        "save-dish"(form) {
          const data = readEditor(form);
          if (!data.title) {
            toast("先给它起个菜名");
            return;
          }
          const row = store.create("dishes", {
            ...data,
            favorite: false,
            source_url: data.source_url || importState.parsed.source_url || "",
            source_platform: importState.parsed.source_platform || "manual",
          });
          resetImport();
          toast("已存进菜谱库", "ok");
          location.hash = `#/dish/${row.id}`;
        },
      },
    };
  }

  // 支持深链接：#/import?text=<编码后的文本>（配合 iOS 快捷指令 / 分享）
  return {
    title: "导入菜谱",
    back: "#/dish",
    tab: "cook",
    html: `
      <div class="card">
        <div class="card-title">📷 截图导入</div>
        <div class="small muted" style="line-height:1.7">
          选一张小红书/抖音的菜谱截图，在手机上直接识别文字。<br>
          首次使用要下载约 <b>10MB</b> 识别库，之后会缓存。
        </div>
        <div class="btn-row mt-10">
          <label class="btn btn-soft" for="ocr-file" style="flex:1">选截图识别</label>
          <button class="btn" data-act="read-clip" style="flex:1">读剪贴板</button>
        </div>
        <input type="file" id="ocr-file" accept="image/*" hidden />
        <div id="ocr-status" class="hint mt-6"></div>
      </div>

      <div class="field">
        <label>或者：把文字粘进来</label>
        <textarea class="input" id="raw-input" style="min-height:160px" placeholder="例如：
番茄炒蛋
用料：番茄2个、鸡蛋3个、盐适量
做法：
1. 番茄切块…
2. 鸡蛋打散…">${esc(importState.raw)}</textarea>
      </div>
      <button class="btn btn-primary btn-block" data-act="do-parse">识别一下</button>
      <div class="divider"></div>
      <div class="btn-row">
        <button class="btn" data-act="do-manual">直接手动新建</button>
      </div>
      <div class="card flat mt-16">
        <div class="small muted" style="line-height:1.8">
          <b>识别不准怎么办？</b><br>
          识别完会进「确认页」，菜名、食材、步骤都能逐条改。<br>
          <b>为什么不能直接贴链接？</b> 网页受跨域与平台风控限制，读不到小红书/抖音的页面内容，链接里本身也不含步骤。
        </div>
      </div>
    `,
    actions: {
      "do-parse"() {
        const raw = document.getElementById("raw-input")?.value || "";
        if (!raw.trim()) {
          toast("先粘贴一段文案，或选一张截图");
          return;
        }
        importState.raw = raw;
        const parsed = parseRecipe(raw);
        importState.parsed = parsed;
        importState.quality = assessOcrQuality(text, parsed);
        importState.step = "confirm";
        rerender();
      },
      "do-manual"() {
        resetImport();
        location.hash = "#/dish/new";
      },
      async "read-clip"() {
        try {
          const text = await navigator.clipboard.readText();
          if (!text || !text.trim()) {
            toast("剪贴板是空的");
            return;
          }
          const ta = document.getElementById("raw-input");
          if (ta) ta.value = text;
          importState.raw = text;
          toast("读到了，点「识别一下」");
        } catch (err) {
          toast("浏览器不让读剪贴板，请长按输入框粘贴", "err");
        }
      },
    },
    afterRender(root) {
      const ta = root.querySelector("#raw-input");
      if (ta) {
        ta.addEventListener("input", () => (importState.raw = ta.value));
        ta.addEventListener("paste", () => {
          setTimeout(() => (importState.raw = ta.value), 30);
        });
      }

      // 截图识别
      const fileInput = root.querySelector("#ocr-file");
      const statusEl = root.querySelector("#ocr-status");
      const setStatus = (t) => {
        if (statusEl) statusEl.textContent = t;
      };
      if (fileInput) {
        fileInput.addEventListener("change", async () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          setStatus("准备中…0%");
          try {
            const text = await recognizeImage(file, {
              onStage: (s) => setStatus(s),
              onProgress: (p) => setStatus(`正在识别…${Math.round(p * 100)}%`),
            });
            if (!text || text.replace(/\s/g, "").length < 4) {
              setStatus("没认出什么文字，换张清晰点的截图，或者直接粘贴文字吧");
              return;
            }
            const box = document.getElementById("raw-input");
            if (box) box.value = text;
            importState.raw = text;
            setStatus("识别完成，正在解析…");
            const parsed = parseRecipe(text);
            importState.parsed = parsed;
        importState.quality = assessOcrQuality(text, parsed);
        importState.step = "confirm";
            rerender();
          } catch (err) {
            setStatus(err?.message || String(err));
            toast("识别失败，可以改用「读剪贴板」或手动粘贴", "err");
          } finally {
            fileInput.value = "";
          }
        });
      }
    },
  };
}
