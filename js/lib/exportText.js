/* ============================================================
   饭来 · 文本导出
   ============================================================ */
import { relativeDay, isoWeekday, fmtMD } from "./util.js";
import { mealLabel } from "./catalog.js";
import { qtyText, shoppingText } from "./ingredients.js";

/** 单日菜单 → 文本（含食材与步骤） */
export function menuText({ date, plans = [], withSteps = true, title = "" }) {
  const lines = [];
  lines.push(title || `【饭来】${relativeDay(date)}的菜单`);
  lines.push(`${fmtMD(date)} ${isoWeekday(date)}`);
  lines.push("");

  const byMeal = new Map();
  for (const p of plans) {
    if (!byMeal.has(p.meal)) byMeal.set(p.meal, []);
    byMeal.get(p.meal).push(p);
  }

  if (!plans.length) {
    lines.push("这一餐还什么都没安排。");
    return lines.join("\n");
  }

  for (const [meal, items] of byMeal) {
    lines.push(`· ${mealLabel(meal)}`);
    for (const p of items) {
      const d = p.dish_snapshot || {};
      lines.push(`  🍽 ${d.title || "一道菜"}${d.cook_minutes ? `（约 ${d.cook_minutes} 分钟）` : ""}`);
      const ings = (d.ingredients || []).map((i) => `${i.name} ${qtyText(i)}`.trim()).filter(Boolean);
      if (ings.length) lines.push(`     食材：${ings.join("、")}`);
      if (withSteps && d.steps?.length) {
        d.steps.forEach((s, i) => lines.push(`     ${i + 1}. ${s.text}`));
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** 多日（本周）菜单 → 文本 */
export function weekMenuText({ days }) {
  const lines = ["【饭来】这一周的菜单", ""];
  for (const day of days) {
    if (!day.plans?.length) continue;
    lines.push(`${relativeDay(day.date)} ${isoWeekday(day.date)}`);
    for (const p of day.plans) {
      const d = p.dish_snapshot || {};
      lines.push(`  ${mealLabel(p.meal)}：${d.emoji || "🍳"} ${d.title || "一道菜"}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export { shoppingText };

/** 饭局卡片 → 文本 */
export function inviteText({ invite, kind }) {
  const r = invite.restaurant_snapshot || {};
  const when = String(invite.scheduled_at || "").replace("T", " ").slice(0, 16);
  const lines = [
    kind === "takeout" ? "【饭来】外卖定了" : "【饭来】出去吃！",
    "",
    `🍽 ${r.name || "一家店"}`,
    when ? `🕐 ${when}` : "",
    r.avg_price ? `💰 人均 ¥${r.avg_price}` : "",
    kind === "dine" && r.address ? `📍 ${r.address}` : "",
    kind === "takeout" && r.address ? `📍 送到 ${r.address}` : "",
    kind === "takeout" && r.delivery_fee ? `🛵 配送费 ¥${r.delivery_fee}` : "",
    invite.note ? `📝 ${invite.note}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
