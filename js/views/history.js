/* ============================================================
   饭来 · 历史时间轴 + 统计
   ============================================================ */
import { store, select } from "../store.js";
import { esc, attr, fmtMD, isoWeekday, relativeDay, moneyLabel, groupBy } from "../lib/util.js";
import { PAYERS, mealLabel } from "../lib/catalog.js";
import { statsFor, filterByRange } from "../lib/model.js";
import { chipRow, emptyState, confirmAction, toast, rerender, notice } from "../ui/kit.js";

const RANGES = [
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "all", label: "全部" },
];

let hisState = { range: "month" };

export function render() {
  const all = select.history();
  const items = filterByRange(all, hisState.range);
  const s = statsFor(items);

  const grouped = groupBy(items, (i) => i.date);
  const dates = Array.from(grouped.keys()).sort().reverse();

  const maxDish = s.topDishes[0]?.[1] || 1;
  const maxRest = s.topRestaurants[0]?.[1] || 1;

  const debt =
    s.diff === 0
      ? "你俩扯平了"
      : s.diff > 0
      ? `TA 欠你 ${s.diff} 顿`
      : `你欠 TA ${Math.abs(s.diff)} 顿`;

  return {
    title: "吃过什么",
    sub: `一起吃过 ${all.length} 顿`,
    back: "#/me",
    tab: "me",
    html: `
      ${chipRow(RANGES, hisState.range, "pick-range")}

      <div class="stat-grid">
        <div class="stat-card">
          <div class="s-label">在家做</div>
          <div class="s-value">${s.cookCount}<span class="s-unit">次</span></div>
        </div>
        <div class="stat-card">
          <div class="s-label">出去吃</div>
          <div class="s-value">${s.dineCount}<span class="s-unit">次</span></div>
        </div>
        <div class="stat-card">
          <div class="s-label">点外卖</div>
          <div class="s-value">${s.takeCount}<span class="s-unit">次</span></div>
        </div>
        <div class="stat-card">
          <div class="s-label">花在外食外卖</div>
          <div class="s-value">¥${moneyLabel(s.spend)}</div>
        </div>
        <div class="stat-card wide">
          <div class="flex-between">
            <div>
              <div class="s-label">请客账本</div>
              <div class="s-value" style="font-size:19px">${esc(debt)}</div>
            </div>
            <div class="tiny muted right" style="line-height:1.7">
              你请 ${s.payerCount[select.role()] || 0} 次<br>
              TA 请 ${s.payerCount[select.role() === "chef" ? "diner" : "chef"] || 0} 次<br>
              AA ${s.payerCount.split || 0} 次
            </div>
          </div>
        </div>
      </div>

      ${
        s.topDishes.length
          ? `<div class="card">
              <div class="card-title">最常做的菜</div>
              ${s.topDishes
                .map(
                  ([name, n]) => `<div class="bar-row">
                    <span class="b-name">${esc(name)}</span>
                    <span class="b-track"><span class="b-fill" style="width:${(n / maxDish) * 100}%"></span></span>
                    <span class="b-val">${n} 次</span>
                  </div>`
                )
                .join("")}
            </div>`
          : ""
      }

      ${
        s.topRestaurants.length
          ? `<div class="card">
              <div class="card-title">最常去的店</div>
              ${s.topRestaurants
                .map(
                  ([name, n]) => `<div class="bar-row">
                    <span class="b-name">${esc(name)}</span>
                    <span class="b-track"><span class="b-fill" style="width:${(n / maxRest) * 100}%"></span></span>
                    <span class="b-val">${n} 次</span>
                  </div>`
                )
                .join("")}
            </div>`
          : ""
      }

      ${
        items.length === 0
          ? emptyState({
              emoji: "🗓️",
              title: "这个时间段还没有记录",
              hint: "做完一道菜、或者约成一家店，就会自动记在这里。",
              action: `<a class="btn btn-primary" href="#/cook">去安排今天</a>`,
            })
          : `<div class="timeline">
              ${dates
                .map((date) => {
                  const dayItems = grouped.get(date);
                  const rel = relativeDay(date);
                  const dateLabel = rel === fmtMD(date) ? "" : rel;
                  return `<div class="tl-day">
                    <div class="tl-date">${dateLabel ? esc(dateLabel) + " " : ""}<small>${esc(fmtMD(date))} ${esc(
                    isoWeekday(date)
                  )}</small></div>
                    ${dayItems
                      .map(
                        (it) => `<div class="row" style="margin-bottom:6px">
                          <div class="row-emoji">${esc(it.emoji)}</div>
                          <div class="row-main">
                            <div class="row-title"><span class="t">${esc(it.title)}</span></div>
                            <div class="row-sub">
                              <span>${it.type === "cook" ? mealLabel(it.meal) : it.type === "dine" ? "出去吃" : "外卖"}</span>
                              ${it.amount ? `<span>¥${moneyLabel(it.amount)}</span>` : ""}
                              ${it.payer && it.type !== "cook" ? `<span>${esc(PAYERS[it.payer]?.label || "")}</span>` : ""}
                              ${it.thought ? `<span>「${esc(it.thought)}」</span>` : ""}
                            </div>
                          </div>
                          <div class="row-aside">
                            <button class="iconbtn" style="width:30px;height:30px" data-act="del-entry"
                              data-type="${it.type}" data-id="${attr(it.planId || it.inviteId || "")}" aria-label="删除">⋯</button>
                          </div>
                        </div>`
                      )
                      .join("")}
                  </div>`;
                })
                .join("")}
            </div>`
      }
    `,
    actions: {
      "pick-range"(el) {
        hisState.range = el.dataset.value;
        rerender();
      },
      async "del-entry"(el) {
        const ok = await confirmAction({
          title: "删除这条记录？",
          desc: "统计会跟着变化，菜谱和餐厅不受影响。",
          ok: "删除",
          danger: true,
        });
        if (!ok) return;
        const id = el.dataset.id;
        const type = el.dataset.type;
        if (type === "cook") store.remove("plans", id);
        else store.remove("invites", id);
        toast("已删除");
        rerender();
      },
    },
  };
}
