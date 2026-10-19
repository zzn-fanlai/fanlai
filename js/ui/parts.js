/* ============================================================
   饭来 · 可复用界面片段
   ============================================================ */
import { esc, attr, relativeDay, fmtMDShort } from "../lib/util.js";
import { qtyText } from "../lib/ingredients.js";
import {
  mealLabel,
  mealEmoji,
  REQUEST_STATUS,
  PLAN_STATUS,
  INVITE_STATUS,
  platformLabel,
  CAT_EMOJI,
  ROLES,
} from "../lib/catalog.js";
import { badge, heartRating, notice } from "./kit.js";
import { linkChip } from "./link.js";

export function dishRow(dish, { act = "open-dish", right = '<span class="row-chev">›</span>' } = {}) {
  const meta = [];
  if (dish.cook_minutes) meta.push(`${dish.cook_minutes} 分钟`);
  if (dish.servings) meta.push(dish.servings);
  if (dish.cuisine) meta.push(dish.cuisine);
  if (dish.ingredients?.length) meta.push(`${dish.ingredients.length} 样食材`);
  return `<div class="row" data-act="${act}" data-id="${attr(dish.id)}" role="button" tabindex="0">
    <div class="row-emoji">${esc(dish.emoji || "🍳")}</div>
    <div class="row-main">
      <div class="row-title"><span class="t">${esc(dish.title || "未命名")}</span>${
    dish.favorite ? " ⭐" : ""
  }</div>
      <div class="row-sub">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
    </div>
    <div class="row-aside">
      ${linkChip({ url: dish.source_url, name: dish.title, platform: dish.source_platform, label: "原链接" })}
      ${right}
    </div>
  </div>`;
}

export function restaurantRow(r, { act = "open-rest", right = '<span class="row-chev">›</span>' } = {}) {
  const meta = [];
  if (r.cuisine) meta.push(r.cuisine);
  if (r.avg_price) meta.push(`人均 ¥${r.avg_price}`);
  if (r.kind === "takeout" && r.delivery_fee) meta.push(`配送 ¥${r.delivery_fee}`);
  if (r.kind === "dine" && r.address) meta.push(r.address);
  if (r.kind === "takeout" && r.address) meta.push(r.address);
  return `<div class="row" data-act="${act}" data-id="${attr(r.id)}" data-cuisine="${attr(
    r.cuisine || ""
  )}" role="button" tabindex="0">
    <div class="row-emoji">${r.kind === "takeout" ? "🛵" : "🍽️"}</div>
    <div class="row-main">
      <div class="row-title"><span class="t">${esc(r.name || "未命名")}</span></div>
      <div class="row-sub">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}
        ${r.craving ? `<span style="color:var(--tomato)">${heartRating(r.craving)}</span>` : ""}
      </div>
    </div>
    <div class="row-aside">
      ${linkChip({ url: r.link, name: r.name, platform: r.platform, label: "原链接" })}
      ${right}
    </div>
  </div>`;
}

export function ingredientList(ings = []) {
  if (!ings.length) return `<div class="muted small">还没有食材，去编辑补上？</div>`;
  return `<div class="list">
    ${ings
      .map(
        (i) => `<div class="row" style="padding:9px 12px;margin-bottom:6px">
        <div class="row-emoji" style="width:32px;height:32px;font-size:15px">${CAT_EMOJI[i.category] || "🧺"}</div>
        <div class="row-main"><div class="row-title" style="font-size:14px"><span class="t">${esc(i.name)}</span></div></div>
        <div class="row-aside" style="font-size:13px;color:var(--cocoa-55)">${esc(qtyText(i) || "适量")}</div>
      </div>`
      )
      .join("")}
  </div>`;
}

export function stepList(steps = []) {
  if (!steps.length) return `<div class="muted small">还没有步骤，去编辑补上？</div>`;
  return `<ol class="prewrap" style="padding-left:18px;line-height:1.75">
    ${steps
      .map(
        (s) =>
          `<li style="margin-bottom:8px">${esc(s.text)}${
            s.minutes ? `<span class="badge" style="margin-left:6px">${s.minutes} 分钟</span>` : ""
          }</li>`
      )
      .join("")}
  </ol>`;
}

export function requestCard(r, { me = "chef", act = "open-request" } = {}) {
  const d = r.dish_snapshot || {};
  const st = REQUEST_STATUS[r.status] || { label: r.status, cls: "" };
  return `<div class="req">
    <div class="req-hd">
      <span class="r-emoji">${esc(d.emoji || "🍳")}</span>
      <span class="r-name">${esc(d.title || "一道菜")}</span>
      ${badge(r.status, REQUEST_STATUS)}
    </div>
    <div class="req-meta">
      <span>${mealEmoji(r.meal)} ${mealLabel(r.meal)}</span>
      <span>${relativeDay(r.date)}</span>
      ${r.decision_note ? `<span>· ${esc(r.decision_note)}</span>` : ""}
    </div>
    ${r.note ? `<div class="req-note">${esc(r.note)}</div>` : ""}
    <div class="req-acts">
      ${
        me === "chef" && r.status === "pending"
          ? `<button class="btn btn-sm btn-primary" data-act="accept" data-id="${attr(r.id)}">接单</button>
             <button class="btn btn-sm" data-act="swap" data-id="${attr(r.id)}">换一道</button>
             <button class="btn btn-sm" data-act="postpone" data-id="${attr(r.id)}">推后</button>
             <button class="btn btn-sm btn-danger" data-act="reject" data-id="${attr(r.id)}">拒绝</button>`
          : `<button class="btn btn-sm btn-ghost" data-act="${act}" data-id="${attr(r.id)}">查看</button>`
      }
    </div>
  </div>`;
}

export function planLine(p, { showStatus = true } = {}) {
  const d = p.dish_snapshot || {};
  const done = p.status === "done" || p.status === "skipped";
  return `<div class="meal-dish ${done ? "done" : ""}">
    <span class="md-emoji">${esc(d.emoji || "🍳")}</span>
    <span class="md-name">${esc(d.title || "一道菜")}
      <small>${mealLabel(p.meal)}${d.cook_minutes ? " · " + d.cook_minutes + " 分钟" : ""}</small>
    </span>
    ${
      showStatus
        ? `<button class="btn btn-xs ${p.status === "done" ? "btn-sage" : "btn-soft"}" data-act="toggle-done" data-id="${attr(
            p.id
          )}">${p.status === "done" ? "已做 ✓" : p.status === "skipped" ? "跳过" : "标记已做"}</button>`
        : ""
    }
    <button class="iconbtn" style="width:30px;height:30px" data-act="open-plan" data-id="${attr(p.id)}" aria-label="详情">⋯</button>
  </div>`;
}

export function inviteCard(inv, { kind, myRole = "chef", showActions = true } = {}) {
  const r = inv.restaurant_snapshot || {};
  const st = INVITE_STATUS[inv.status] || { label: inv.status, cls: "" };
  const isMine = inv.proposer === myRole;
  const when = inv.scheduled_at ? String(inv.scheduled_at).replace("T", " ").slice(0, 16) : "时间待定";
  return `<div class="req">
    <div class="req-hd">
      <span class="r-emoji">${kind === "takeout" ? "🛵" : "🍽️"}</span>
      <span class="r-name">${esc(r.name || "一家店")}</span>
      ${badge(inv.status, INVITE_STATUS)}
    </div>
    <div class="req-meta">
      <span>${esc(when)}</span>
      <span>${isMine ? "你发起" : "TA 发起"}</span>
      ${r.avg_price ? `<span>人均 ¥${esc(r.avg_price)}</span>` : ""}
    </div>
    ${inv.note ? `<div class="req-note">${esc(inv.note)}</div>` : ""}
    ${
      r.link
        ? `<div class="req-acts">${linkChip({
            url: r.link,
            name: r.name,
            platform: r.platform,
            label: "看店铺链接",
            cls: "btn-sm btn-soft",
          })}</div>`
        : ""
    }
    ${
      showActions && inv.status === "pending"
        ? `<div class="req-acts">
            ${
              isMine
                ? `<button class="btn btn-sm btn-ghost" data-act="cancel-invite" data-id="${attr(inv.id)}">取消</button>
                   <span class="muted small" style="align-self:center">等 TA 回话…</span>`
                : `<button class="btn btn-sm btn-primary" data-act="agree-invite" data-id="${attr(inv.id)}">想去</button>
                   <button class="btn btn-sm" data-act="decline-invite" data-id="${attr(inv.id)}">不想去</button>`
            }
          </div>`
        : ""
    }
    ${
      showActions && inv.status === "agreed"
        ? `<div class="req-acts">
             <button class="btn btn-sm btn-soft" data-act="card-invite" data-id="${attr(inv.id)}">饭局卡片</button>
             <button class="btn btn-sm btn-ghost" data-act="edit-invite" data-id="${attr(inv.id)}">改金额/请客</button>
             <button class="btn btn-sm btn-danger" data-act="cancel-invite" data-id="${attr(inv.id)}">取消这次</button>
           </div>`
        : ""
    }
  </div>`;
}

export function roleLabel(role) {
  return ROLES[role]?.label || "成员";
}

export function syncLine() {
  return `<div class="syncbar" id="sync-line"><span class="dot"></span><span id="sync-text">正在检查同步…</span></div>`;
}

export function sectionTitle(text, right = "") {
  return `<div class="flex-between" style="margin:14px 2px 8px">
    <h3 style="font-size:15px">${esc(text)}</h3>
    <div>${right}</div>
  </div>`;
}
