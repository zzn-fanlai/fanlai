/* ============================================================
   饭来 · 日期 + 餐次选择弹层
   ============================================================ */
import { esc, attr, todayISO, addDays, relativeDay, isoWeekday } from "../lib/util.js";
import { MEALS } from "../lib/catalog.js";
import { openSheet } from "./kit.js";

/**
 * @returns {Promise<{date:string, meal:string}|null>}
 */
export function askSlot({
  title = "排到哪一餐？",
  desc = "",
  date = todayISO(),
  meal = "dinner",
  okText = "就这一餐",
  days = 7,
} = {}) {
  return new Promise((resolve) => {
    let cur = { date, meal };
    let resolved = false;

    const draw = (body) => {
      const dayChips = Array.from({ length: days }, (_, i) => addDays(todayISO(), i));
      const sheet = document.getElementById("sheet");
      body.innerHTML = `
        <h3>${esc(title)}</h3>
        ${desc ? `<p class="sheet-sub">${esc(desc)}</p>` : ""}
        <div class="field">
          <label>哪天</label>
          <div class="chips">
            ${dayChips
              .map(
                (d) =>
                  `<button type="button" class="chip ${d === cur.date ? "on" : ""}" data-date="${d}">
                     ${esc(relativeDay(d))}<span class="tiny muted" style="margin-left:4px">${esc(isoWeekday(d))}</span>
                   </button>`
              )
              .join("")}
          </div>
        </div>
        <div class="field">
          <label>哪一餐</label>
          <div class="segmented">
            ${MEALS.map(
              (m) =>
                `<button type="button" class="${m.key === cur.meal ? "on" : ""}" data-meal="${m.key}">${m.emoji} ${m.label}</button>`
            ).join("")}
          </div>
        </div>
        <div class="btn-row mt-10">
          <button type="button" class="btn" data-cancel>取消</button>
          <button type="button" class="btn btn-primary" data-ok>${esc(okText)}</button>
        </div>
      `;
      body.querySelectorAll("[data-date]").forEach((b) =>
        b.addEventListener("click", () => {
          cur.date = b.dataset.date;
          draw(body);
        })
      );
      body.querySelectorAll("[data-meal]").forEach((b) =>
        b.addEventListener("click", () => {
          cur.meal = b.dataset.meal;
          draw(body);
        })
      );
      body.querySelector("[data-cancel]").addEventListener("click", () => {
        resolved = true;
        sheet._close?.();
        resolve(null);
      });
      body.querySelector("[data-ok]").addEventListener("click", () => {
        resolved = true;
        sheet._close?.();
        resolve({ ...cur });
      });
    };

    const sheet = document.getElementById("sheet");
    openSheet("", {
      onMount(body) {
        draw(body);
      },
      onClose() {
        if (!resolved) resolve(null);
      },
    });
  });
}
