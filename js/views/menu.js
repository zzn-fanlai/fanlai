/* ============================================================
   饭来 · 本周菜单 + 导出
   ============================================================ */
import { store, select } from "../store.js";
import {
  esc,
  attr,
  todayISO,
  addDays,
  weekDays,
  relativeDay,
  isoWeekday,
  fmtMD,
  copyText,
} from "../lib/util.js";
import { MEALS, mealLabel } from "../lib/catalog.js";
import { planSheet } from "./cook.js";
import { menuText } from "../lib/exportText.js";
import { menuCanvas, canvasToBlob } from "../lib/exportImage.js";
import { toast, emptyState, openImagePreview, notice } from "../ui/kit.js";
import { planLine, sectionTitle } from "../ui/parts.js";
import { askSlot } from "../ui/slot.js";
import { addDishToMenu } from "../lib/model.js";

const validDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : "");

export function render(ctx) {
  const date = validDate(ctx.query.date) || todayISO();
  const plans = select.plans({ date });
  const week = weekDays(date);
  const counts = new Map();
  for (const p of select.plans({ from: week[0], to: week[6] })) {
    counts.set(p.date, (counts.get(p.date) || 0) + 1);
  }

  const mealBlocks = MEALS.map((m) => {
    const items = plans.filter((p) => p.meal === m.key);
    return `
      <div class="meal-card">
        <div class="meal-hd">
          <span>${m.emoji}</span>
          <span class="meal-name">${m.label}</span>
          <span class="time">${m.time}</span>
          <button class="btn btn-xs btn-ghost add" data-act="add-meal" data-meal="${m.key}">＋</button>
        </div>
        <div class="meal-dishes">
          ${
            items.length
              ? items.map((p) => planLine(p)).join("")
              : `<div class="muted small" style="padding:2px 2px 4px">空着</div>`
          }
        </div>
      </div>`;
  }).join("");

  const weekRows = week
    .map((d) => {
      const n = counts.get(d) || 0;
      return `<button class="chip ${d === date ? "on" : ""}" data-act="pick-day" data-value="${d}" style="min-width:64px;flex-direction:column;gap:2px;display:flex;align-items:center">
        <span style="font-size:11px;opacity:.75">${esc(isoWeekday(d))}</span>
        <span style="font-weight:800">${esc(d.slice(8))}</span>
        <span class="tagdot" style="opacity:${n ? 1 : 0};background:${d === date ? "#fff" : "var(--tomato)"}"></span>
      </button>`;
    })
    .join("");

  return {
    title: "菜单",
    sub: `${relLabel(date)} · ${fmtMD(date)} ${isoWeekday(date)}`,
    back: "#/cook",
    tab: "cook",
    top: [{ emoji: "🛒", to: `#/cook/shopping?date=${date}`, label: "买菜清单" }],
    html: `
      <div class="chips">${weekRows}</div>

      ${plans.length ? "" : notice("这一天还没安排。点菜、从菜谱库挑，或者按一下抽签。", "")}

      ${mealBlocks}

      <div class="card mt-16">
        <div class="card-title">导出这份菜单</div>
        <div class="btn-row">
          <button class="btn btn-soft" data-act="export-img">存成长图</button>
          <button class="btn" data-act="copy-text">复制文字</button>
        </div>
        <div class="hint" style="margin-top:8px">长图可以直接发微信；文字适合粘到聊天框。</div>
      </div>

      <div class="btn-row mt-10">
        <button class="btn btn-ghost" data-act="goto-week">这周整体看看</button>
        <a class="btn btn-ghost" href="#/cook/shopping?date=${date}">买菜清单 ›</a>
      </div>
    `,
    actions: {
      "pick-day"(el) {
        location.hash = `#/cook/menu?date=${el.dataset.value}`;
      },
      "add-meal"(el) {
        const meal = el.dataset.meal;
        location.hash = `#/cook/pick?mode=plan&date=${date}&meal=${meal}`;
      },
      "goto-week"() {
        location.hash = `#/cook/shopping?from=${week[0]}&to=${week[6]}`;
      },
      "toggle-done"(el) {
        const plan = store.get("plans", el.dataset.id);
        if (!plan) return;
        const next = plan.status === "done" ? "planned" : "done";
        store.update("plans", plan.id, { status: next, ...(next === "done" ? { done_at: Date.now() } : {}) });
      },
      "open-plan"(el) {
        planSheet(store.get("plans", el.dataset.id));
      },
      async "export-img"() {
        if (!plans.length) {
          toast("这一天还没有菜");
          return;
        }
        try {
          const canvas = menuCanvas({ date, plans, nickname: select.nickname() });
          const blob = await canvasToBlob(canvas);
          if (!blob) throw new Error("导出失败");
          const url = URL.createObjectURL(blob);
          openImagePreview(url, `饭来-${date}-菜单.png`, { onClose: () => URL.revokeObjectURL(url) });
        } catch (err) {
          toast("长图生成失败，已换成文字", "err");
          const ok = await copyText(menuText({ date, plans }));
          if (ok) toast("菜单文字已复制", "ok");
        }
      },
      async "copy-text"() {
        const ok = await copyText(menuText({ date, plans }));
        toast(ok ? "菜单文字已复制" : "复制失败", ok ? "ok" : "err");
      },
    },
    afterRender(root) {
      if (ctx.query.add === "1") {
        location.replace(`#/cook/pick?mode=plan&date=${date}`);
        return;
      }
      if (ctx.query.dish) {
        const dish = select.dish(ctx.query.dish);
        if (dish) {
          setTimeout(async () => {
            const slot = await askSlot({
              title: `把「${dish.title}」排到哪一餐？`,
              date,
              meal: "dinner",
            });
            if (slot) {
              addDishToMenu({ date: slot.date, meal: slot.meal, dish });
              toast("排上了", "ok");
              location.hash = `#/cook/menu?date=${slot.date}`;
            } else {
              location.hash = `#/cook/menu?date=${date}`;
            }
          }, 120);
        }
      }
    },
  };
}

function relLabel(date) {
  const t = todayISO();
  if (date === t) return "今天";
  if (date === addDays(t, 1)) return "明天";
  if (date < t) return "过去";
  return relativeDay(date);
}
