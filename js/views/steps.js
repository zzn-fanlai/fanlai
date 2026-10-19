/* ============================================================
   饭来 · 做饭模式（一步一屏）
   ============================================================ */
import { store, select } from "../store.js";
import { esc, attr, clamp, relativeDay } from "../lib/util.js";
import { mealLabel } from "../lib/catalog.js";
import { togglePlanDone } from "../lib/model.js";
import { toast, emptyState, openSheet, closeSheet } from "../ui/kit.js";
import { ingredientList } from "../ui/parts.js";
import { qtyText } from "../lib/ingredients.js";

const idxMap = new Map();

export function render(ctx) {
  const plan = select.plan(ctx.params.planId);
  if (!plan || plan.deleted) {
    return {
      title: "做饭",
      hideTop: true,
      hideTab: true,
      back: "#/cook",
      html: `<div class="view">${emptyState({
        emoji: "🍳",
        title: "这道菜找不到了",
        hint: "可能已经被移出菜单。",
        action: `<a class="btn btn-primary" href="#/cook">回做饭区</a>`,
      })}</div>`,
    };
  }

  const d = plan.dish_snapshot || {};
  const steps = (d.steps || []).filter((s) => s && s.text);
  const total = steps.length;
  const idx = total ? clamp(idxMap.get(plan.id) ?? 0, 0, total - 1) : 0;
  const step = steps[idx];
  const last = total > 0 && idx === total - 1;
  const pct = total ? ((idx + 1) / total) * 100 : 0;

  return {
    hideTop: true,
    hideTab: true,
    title: "做饭",
    resetScroll: true,
    html: `
      <div class="step-screen">
        <div class="step-top">
          <button class="iconbtn" data-act="exit" aria-label="退出">✕</button>
          <span class="st-title">${esc(d.emoji || "🍳")} ${esc(d.title || "做饭")}</span>
          <button class="iconbtn" data-act="show-ings" aria-label="食材">🧺</button>
        </div>

        <div class="step-progress"><i style="width:${pct}%"></i></div>
        <div class="step-count">${total ? `第 ${idx + 1} / ${total} 步` : "这道菜还没有步骤"}</div>

        <div class="step-body">
          ${
            step
              ? `<div class="step-text">${esc(step.text)}${
                  step.minutes ? `<span class="step-min">约 ${step.minutes} 分钟</span>` : ""
                }</div>`
              : `<div class="step-text" style="font-size:18px;color:var(--cocoa-55)">
                   这道菜还没有写步骤。<br><br>
                   <a href="#/dish/edit/${esc(plan.dish_id || "")}" style="text-decoration:underline">去补上做法 ›</a>
                 </div>`
          }
        </div>

        <div class="tiny muted center mb-6">${esc(relativeDay(plan.date))} · ${mealLabel(plan.meal)}</div>
        <div class="step-acts">
          <button class="btn" data-act="prev" ${idx === 0 ? "disabled" : ""}>上一步</button>
          ${
            last
              ? `<button class="btn btn-primary" data-act="finish">做好了 ✓</button>`
              : `<button class="btn btn-primary" data-act="next" ${total ? "" : "disabled"}>下一步</button>`
          }
        </div>
      </div>
    `,
    actions: {
      prev() {
        if (idx > 0) {
          idxMap.set(plan.id, idx - 1);
          rerenderSelf();
        }
      },
      next() {
        if (idx < total - 1) {
          idxMap.set(plan.id, idx + 1);
          rerenderSelf();
        }
      },
      exit() {
        location.hash = "#/cook";
      },
      "show-ings"() {
        openSheet(
          `<h3>这道菜的食材</h3>
           <p class="sheet-sub">${esc(d.title || "")}</p>
           ${ingredientList(d.ingredients || [])}
           <button class="btn btn-ghost btn-block mt-10" data-close>知道了</button>`,
          {
            onMount(body) {
              body.querySelector("[data-close]")?.addEventListener("click", closeSheet);
            },
          }
        );
      },
      finish() {
        togglePlanDone({ ...plan, status: "planned" });
        toast("这顿饭成了 🎉", "ok");
        location.hash = "#/cook";
      },
    },
  };
}

function rerenderSelf() {
  window.dispatchEvent(new Event("fanlai:rerender"));
}
