/* ============================================================
   饭来 · 买菜清单（食材聚合 + 分区 + 勾选 + 导出）
   ============================================================ */
import { store, select } from "../store.js";
import { esc, attr, todayISO, addDays, weekStart, weekDays, relativeDay, fmtMD, copyText, clamp } from "../lib/util.js";
import { CAT_EMOJI } from "../lib/catalog.js";
import { aggregateIngredients, checkId, shoppingText } from "../lib/ingredients.js";
import { shoppingCanvas, canvasToBlob } from "../lib/exportImage.js";
import { toast, emptyState, notice, openImagePreview, chipRow, rerender } from "../ui/kit.js";

const RANGES = [
  { key: "today", label: "今天" },
  { key: "tmr", label: "明天" },
  { key: "week", label: "本周" },
  { key: "next7", label: "未来 7 天" },
];

let shopState = { range: "week", from: "", to: "" };

function rangeOf(key) {
  const t = todayISO();
  if (key === "today") return { from: t, to: t };
  if (key === "tmr") return { from: addDays(t, 1), to: addDays(t, 1) };
  if (key === "next7") return { from: t, to: addDays(t, 6) };
  const ws = weekStart(t);
  return { from: ws, to: addDays(ws, 6) };
}

export function render(ctx) {
  if (ctx.query.from && ctx.query.to) {
    shopState.from = ctx.query.from;
    shopState.to = ctx.query.to;
    shopState.range = "custom";
  }
  const { from, to } = shopState.range === "custom" ? shopState : rangeOf(shopState.range);
  const scope = `${from}~${to}`;
  shopState.from = from;
  shopState.to = to;

  const plans = select.plans({ from, to });
  const dishes = plans.map((p) => ({
    dishTitle: p.dish_snapshot?.title || "一道菜",
    meal: p.meal,
    date: p.date,
    ingredients: p.dish_snapshot?.ingredients || [],
  }));
  const groups = aggregateIngredients(dishes);

  const checks = new Map();
  for (const c of select.checks(scope)) checks.set(c.item_key, !!c.checked);
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const doneCount = groups.reduce((s, g) => s + g.items.filter((i) => checks.get(i.key)).length, 0);

  const dishNames = Array.from(new Set(dishes.map((d) => d.dishTitle)));

  return {
    title: "买菜清单",
    sub: `${relativeDay(from) === from ? fmtMD(from) : relativeDay(from)}${
      from === to ? "" : " – " + (relativeDay(to) === to ? fmtMD(to) : relativeDay(to))
    } · ${total} 样`,
    back: "#/cook",
    tab: "cook",
    top: [{ emoji: "📤", localAct: "export-img", label: "导出" }],
    html: `
      ${chipRow(
        RANGES.map((r) => ({ value: r.key, label: r.label })),
        shopState.range === "custom" ? "" : shopState.range,
        "pick-range"
      )}

      ${
        !plans.length
          ? emptyState({
              emoji: "🛒",
              title: "这段时间没有要做的菜",
              hint: "先去菜单排几道菜，食材会自动汇总到这里。",
              action: `<div class="btn-row">
                <a class="btn btn-primary" href="#/cook/pick?mode=plan">排一道菜</a>
                <a class="btn" href="#/cook/menu">看菜单</a>
              </div>`,
            })
          : `
        <div class="card tight mb-10">
          <div class="flex-between">
            <div class="small"><b>${doneCount}</b> / ${total} 已买</div>
            <div class="btn-row" style="gap:6px">
              <button class="btn btn-xs btn-ghost" data-act="clear-checks">清空勾选</button>
              <button class="btn btn-xs" data-act="copy-text">复制清单</button>
            </div>
          </div>
          <div class="step-progress" style="margin:8px 0 0"><i style="width:${total ? (doneCount / total) * 100 : 0}%"></i></div>
          <div class="tiny muted mt-6">来自 ${dishNames.length} 道菜：${esc(dishNames.slice(0, 4).join("、"))}${
          dishNames.length > 4 ? " 等" : ""
        }</div>
        </div>

        ${groups
          .map(
            (g) => `
          <div class="shop-group">
            <h4>${CAT_EMOJI[g.category] || "🧺"} ${esc(g.category)} <span class="muted">· ${g.items.length}</span></h4>
            ${g.items
              .map((item) => {
                const on = !!checks.get(item.key);
                return `<button class="shop-item ${on ? "on" : ""}" data-act="toggle-item" data-key="${attr(item.key)}">
                  <span class="checkbox ${on ? "on" : ""}">✓</span>
                  <span class="s-name">${esc(item.name)}</span>
                  <span class="s-qty">${esc(item.qtyText)}</span>
                </button>`;
              })
              .join("")}
          </div>`
          )
          .join("")}
      `
      }
    `,
    actions: {
      "pick-range"(el) {
        shopState.range = el.dataset.value;
        rerender();
      },
      "toggle-item"(el) {
        const key = el.dataset.key;
        const id = checkId(store.state.room?.code || "local", scope, key);
        const existing = store.get("checks", id);
        if (existing) store.update("checks", id, { checked: !existing.checked });
        else
          store.create("checks", {
            id,
            scope,
            item_key: key,
            checked: true,
          });
        rerender();
      },
      "clear-checks"() {
        for (const c of select.checks(scope)) {
          if (c.checked) store.update("checks", c.id, { checked: false });
        }
        toast("已清空");
        rerender();
      },
      async "copy-text"() {
        const text = shoppingText(
          groups,
          `【饭来】买菜清单（${fmtMD(from)}${from === to ? "" : " - " + fmtMD(to)}）`
        );
        const ok = await copyText(text);
        toast(ok ? "清单已复制" : "复制失败", ok ? "ok" : "err");
      },
      async "export-img"() {
        if (!groups.length) {
          toast("没有可导出的食材");
          return;
        }
        try {
          const canvas = shoppingCanvas({
            groups,
            title: "买菜清单",
            sub: `${fmtMD(from)}${from === to ? "" : " – " + fmtMD(to)} · ${total} 样`,
          });
          const blob = await canvasToBlob(canvas);
          const url = URL.createObjectURL(blob);
          openImagePreview(url, `饭来-买菜清单-${from}.png`, { onClose: () => URL.revokeObjectURL(url) });
        } catch (err) {
          toast("生成失败，改用复制文本", "err");
        }
      },
    },
  };
}
