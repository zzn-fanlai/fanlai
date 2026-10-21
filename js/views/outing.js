/* ============================================================
   饭来 · 外食区 / 外卖区（同一套逻辑，字段不同）
   ============================================================ */
import { store, select } from "../store.js";
import { esc, attr, relativeDay, fmtMD, todayISO, copyText } from "../lib/util.js";
import { REST_CUISINES, KINDS, platformLabel, PAYERS, PLATFORMS } from "../lib/catalog.js";
import { parseRestaurant } from "../lib/parse.js";
import {
  createInvite,
  decideInvite,
  cancelInvite,
  setInviteMoney,
  restaurantSnapshot,
} from "../lib/model.js";
import {
  toast,
  notice,
  emptyState,
  chipRow,
  openSheet,
  closeSheet,
  confirmAction,
  askText,
  rerender,
  openImagePreview,
  heartRating,
} from "../ui/kit.js";
import { restaurantRow, inviteCard, sectionTitle } from "../ui/parts.js";
import { linkChip } from "../ui/link.js";
import { inviteText } from "../lib/exportText.js";
import { cardCanvas, canvasToBlob } from "../lib/exportImage.js";

const isDine = (kind) => kind === "dine";

/* ============================================================
   首页
   ============================================================ */
export function home({ kind }) {
  const meta = KINDS[kind];
  const myRole = select.role();
  const route = kind;
  const all = select.invites({ kind });
  const todo = all.filter((i) => i.status === "pending" && i.proposer !== myRole);
  const mine = all.filter((i) => i.status === "pending" && i.proposer === myRole);
  const agreed = all.filter((i) => i.status === "agreed").slice(0, 3);

  const rests = select.restaurants(kind);
  const byCuisine = new Map();
  for (const r of rests) {
    const c = r.cuisine || "其他";
    byCuisine.set(c, (byCuisine.get(c) || 0) + 1);
  }
  const cuisineChips = [
    { value: "", label: "全部" },
    ...Array.from(byCuisine.keys()).map((c) => ({ value: c, label: c })),
  ];

  return {
    title: meta.label,
    sub: isDine(kind) ? "两个人都点头才出门" : "累到不想动的时候用",
    tab: route,
    top: [{ emoji: "＋", to: `#/${route}/new`, label: "添加餐厅" }],
    html: `
      ${
        todo.length
          ? `${sectionTitle("等你点头", `<span class="badge pending">${todo.length}</span>`)}
             ${todo.map((i) => inviteCard(i, { kind, myRole, showActions: true })).join("")}`
          : ""
      }

      ${
        mine.length
          ? `${sectionTitle("你的邀约在等回复", "")}
             ${mine.map((i) => inviteCard(i, { kind, myRole, showActions: true })).join("")}`
          : ""
      }

      ${
        agreed.length
          ? `${sectionTitle("最近成行的", "")}
             ${agreed.map((i) => inviteCard(i, { kind, myRole, showActions: true })).join("")}`
          : ""
      }

      ${
        rests.length
          ? `<div class="list mt-10">
               <a class="row" href="#/${route}/random">
                 <div class="row-emoji">🎲</div>
                 <div class="row-main">
                   <div class="row-title"><span class="t">今天吃哪家</span></div>
                   <div class="row-sub"><span>${
                     isDine(kind) ? "从收藏的餐厅里随机抽一家" : "从常点的外卖店里随机抽一家"
                   } · ${rests.length} 家候选</span></div>
                 </div>
                 <div class="row-aside"><span class="row-chev">›</span></div>
               </a>
             </div>`
          : ""
      }

      ${
        !rests.length
          ? emptyState({
              emoji: isDine(kind) ? "🍽️" : "🛵",
              title: `还没有存过${isDine(kind) ? "餐厅" : "外卖店"}`,
              hint: isDine(kind)
                ? "把大众点评/美团的分享文案粘进来，店名、人均、地址自动填好。"
                : "常点的那几家存进来，下次一句话就能发起。",
              action: `<a class="btn btn-primary" href="#/${route}/new?import=1">粘贴分享文案</a>
                       <div style="height:8px"></div>
                       <a class="btn" href="#/${route}/new">手动添加</a>`,
            })
          : `
            ${cuisineChips.length > 1 ? chipRow(cuisineChips, "", "filter-cuisine") : ""}
            <div class="list" id="rest-list">
              ${rests.map((r) => restaurantRow(r, { act: "open-rest" })).join("")}
            </div>
          `
      }

      ${
        rests.length
          ? `<div class="btn-row mt-10">
               <a class="btn btn-soft" href="#/${route}/new?import=1">粘贴分享文案导入</a>
               <a class="btn" href="#/${route}/new">手动添加</a>
             </div>`
          : ""
      }
    `,
    actions: {
      "add-rest"() {
        location.hash = `#/${route}/new`;
      },
      "open-rest"(el) {
        location.hash = `#/${route}/${el.dataset.id}`;
      },
      "filter-cuisine"(el) {
        const v = el.dataset.value;
        document.querySelectorAll("#rest-list .row").forEach((row) => {
          row.style.display = !v || (row.dataset.cuisine || "") === v ? "" : "none";
        });
        el.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === el));
      },
      async "agree-invite"(el) {
        const inv = store.get("invites", el.dataset.id);
        if (!inv) return;
        decideInvite(inv, true);
        toast("成了，记一笔吧", "ok");
        setTimeout(() => askMoney(store.get("invites", inv.id), kind), 260);
      },
      async "decline-invite"(el) {
        const inv = store.get("invites", el.dataset.id);
        if (!inv) return;
        // 直接回绝（不再弹窗问理由，减少弹层依赖）
        decideInvite(inv, false, "");
        toast("已回绝，TA 会看到");
      },
      "cancel-invite"(el) {
        const inv = store.get("invites", el.dataset.id);
        if (!inv) return;
        // pending / agreed 都能取消
        cancelInvite(inv);
        toast(inv.status === "agreed" ? "已取消这次饭局" : "已取消", "ok");
      },
      "edit-invite"(el) {
        const inv = store.get("invites", el.dataset.id);
        askMoney(inv, kind);
      },
      async "card-invite"(el) {
        const inv = store.get("invites", el.dataset.id);
        try {
          const canvas = cardCanvas({
            invite: inv,
            kind,
            names: { by: inv.proposer === myRole ? "你" : select.partnerName() },
          });
          const blob = await canvasToBlob(canvas);
          const url = URL.createObjectURL(blob);
          openImagePreview(url, `饭来-饭局卡片.png`, { onClose: () => URL.revokeObjectURL(url) });
        } catch (err) {
          const ok = await copyText(inviteText({ invite: inv, kind }));
          toast(ok ? "卡片生成失败，改为复制文字" : "导出失败", ok ? "ok" : "err");
        }
      },
    },
  };
}

/* ============================================================
   编辑金额 / 谁请客
   ============================================================ */
function askMoney(inv, kind) {
  if (!inv) return;
  const isTakeout = kind === "takeout";
  openSheet(
    `<h3>记一笔</h3>
     <p class="sheet-sub">${esc(inv.restaurant_snapshot?.name || "这一顿")}</p>
     <div class="field">
       <label>这顿花了多少</label>
       <input class="input" id="money-amount" inputmode="decimal" placeholder="268" value="${attr(inv.amount || "")}" />
       ${isTakeout ? `<div class="hint">如果是外卖，记得把配送费也算进去。</div>` : ""}
     </div>
     <div class="field">
       <label>谁请客</label>
       <div class="chips" id="money-payer">
         ${Object.values(PAYERS)
           .map(
             (p) =>
               `<button class="chip ${inv.payer === p.key ? "on" : ""}" data-payer="${p.key}">${esc(p.label)}</button>`
           )
           .join("")}
       </div>
     </div>
     <div class="btn-row">
       <button class="btn btn-ghost" data-close>先不记</button>
       <button class="btn btn-primary" data-save>保存</button>
     </div>`,
    {
      onMount(body) {
        let payer = inv.payer || "none";
        body.querySelectorAll("[data-payer]").forEach((b) =>
          b.addEventListener("click", () => {
            payer = b.dataset.payer;
            body.querySelectorAll("[data-payer]").forEach((x) => x.classList.toggle("on", x === b));
          })
        );
        body.querySelector("[data-close]").addEventListener("click", closeSheet);
        body.querySelector("[data-save]").addEventListener("click", () => {
          const amount = body.querySelector("#money-amount").value.trim();
          setInviteMoney(inv, { amount: Number(amount) || 0, payer });
          closeSheet();
          toast("记好了", "ok");
        });
      },
    }
  );
}

/* ============================================================
   新增 / 编辑餐厅
   ============================================================ */
let editDraft = null;

export function edit(ctx) {
  const kind = ctx.kind;
  const route = kind;
  const id = ctx.params?.id;
  const existing = id ? select.restaurant(id) : null;

  if (!editDraft || editDraft._key !== `${kind}:${id || "new"}`) {
    editDraft = {
      _key: `${kind}:${id || "new"}`,
      imported: false,
      parsed: null,
      showImport: ctx.query?.import === "1" || !existing,
      values: existing
        ? {
            name: existing.name || "",
            cuisine: existing.cuisine || "其他",
            avg_price: existing.avg_price ?? "",
            address: existing.address || "",
            platform: existing.platform || "manual",
            link: existing.link || "",
            note: existing.note || "",
            craving: existing.craving || 3,
            delivery_fee: existing.delivery_fee ?? "",
            eta_minutes: existing.eta_minutes ?? "",
          }
        : {
            name: "",
            cuisine: "其他",
            avg_price: "",
            address: "",
            platform: "manual",
            link: "",
            note: "",
            craving: 3,
            delivery_fee: "",
            eta_minutes: "",
          },
    };
  }
  const v = editDraft.values;

  return {
    title: existing ? "编辑店铺" : `添加${isDine(kind) ? "餐厅" : "外卖店"}`,
    back: `#/${route}`,
    tab: route,
    html: `
      ${
        editDraft.showImport
          ? `<div class="card">
              <div class="card-title">从分享文案自动填</div>
              <textarea class="input" id="import-raw" style="min-height:96px" placeholder="${
                isDine(kind)
                  ? "把大众点评/美团里的分享文案粘进来"
                  : "把美团外卖/饿了么的分享文案粘进来"
              }"></textarea>
              <button class="btn btn-soft btn-block mt-6" data-act="do-import">识别并填入</button>
              <div class="hint mt-6">识别在手机上完成，不联网。识别不准的地方下面可以手改。</div>
            </div>`
          : ""
      }

      <form data-form="save-rest" id="rest-form" novalidate>
        <div class="field">
          <label>店名</label>
          <input class="input" name="name" maxlength="30" placeholder="${isDine(kind) ? "比如：炭火烤肉" : "比如：楼下湖南米粉"}" value="${attr(
            v.name
          )}" />
        </div>

        <div class="field-row">
          <div class="field">
            <label>品类</label>
            <select class="input" name="cuisine">
              ${REST_CUISINES.map((c) => `<option value="${c}" ${v.cuisine === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>人均</label>
            <input class="input" name="avg_price" inputmode="decimal" placeholder="88" value="${attr(v.avg_price)}" />
          </div>
        </div>

        <div class="field">
          <label>${isDine(kind) ? "地址" : "送达地址"}</label>
          <input class="input" name="address" placeholder="${isDine(kind) ? "在哪里" : "送到哪里"}" value="${attr(
            v.address
          )}" />
        </div>

        ${
          !isDine(kind)
            ? `<div class="field-row">
                 <div class="field">
                   <label>配送费</label>
                   <input class="input" name="delivery_fee" inputmode="decimal" placeholder="5" value="${attr(
                     v.delivery_fee
                   )}" />
                 </div>
                 <div class="field">
                   <label>预计送达（分钟）</label>
                   <input class="input" name="eta_minutes" inputmode="numeric" placeholder="35" value="${attr(
                     v.eta_minutes
                   )}" />
                 </div>
               </div>`
            : ""
        }

        <div class="field">
          <label>想吃程度</label>
          <div class="chips" id="craving-pick">
            ${[1, 2, 3, 4, 5]
              .map(
                (n) =>
                  `<button type="button" class="chip ${Number(v.craving) === n ? "on" : ""}" data-craving="${n}">${"♥".repeat(
                    n
                  )}</button>`
              )
              .join("")}
          </div>
          <input type="hidden" name="craving" id="craving-value" value="${attr(v.craving)}" />
        </div>

        <div class="field">
          <label>来源平台</label>
          <select class="input" name="platform">
            ${Object.values(PLATFORMS)
              .map((p) => `<option value="${p.key}" ${v.platform === p.key ? "selected" : ""}>${esc(p.label)}</option>`)
              .join("")}
          </select>
        </div>

        <div class="field">
          <label>链接（可选）</label>
          <input class="input" name="link" placeholder="https://…" value="${attr(v.link)}" />
        </div>

        <div class="field">
          <label>备注（可选）</label>
          <textarea class="input" name="note" maxlength="200" placeholder="比如：要排队，记得提前取号">${esc(
            v.note
          )}</textarea>
        </div>

        <button class="btn btn-primary btn-block" type="submit">${existing ? "保存" : "存进餐厅库"}</button>
      </form>
      ${
        existing
          ? `<button class="btn btn-danger btn-block mt-10" data-act="delete-rest">删除这家店</button>`
          : ""
      }
    `,
    actions: {
      "do-import"() {
        const raw = document.getElementById("import-raw")?.value || "";
        if (!raw.trim()) {
          toast("先粘一段文案");
          return;
        }
        const p = parseRestaurant(raw);
        editDraft.parsed = p;
        const merged = {
          ...editDraft.values,
          name: p.name || editDraft.values.name,
          cuisine: REST_CUISINES.includes(p.cuisine) ? p.cuisine : editDraft.values.cuisine,
          avg_price: p.avg_price ?? editDraft.values.avg_price,
          address: p.address || editDraft.values.address,
          link: p.link || editDraft.values.link,
          platform: p.platform && p.platform !== "manual" ? p.platform : editDraft.values.platform,
          delivery_fee: p.delivery_fee ?? editDraft.values.delivery_fee,
          eta_minutes: p.eta_minutes ?? editDraft.values.eta_minutes,
          note: p.tags?.length ? "#" + p.tags.join(" #") : editDraft.values.note,
        };
        editDraft.values = merged;
        editDraft.showImport = false;
        toast(
          p.confidence.level === "high" ? "识别完成，检查一下" : "认出店名了，其他补一补",
          p.confidence.level === "high" ? "ok" : ""
        );
        rerender();
      },
      "save-rest"(form) {
        const fd = new FormData(form);
        const data = {
          name: String(fd.get("name") || "").trim(),
          cuisine: String(fd.get("cuisine") || "其他"),
          avg_price: numOrNull(fd.get("avg_price")),
          address: String(fd.get("address") || "").trim(),
          platform: String(fd.get("platform") || "manual"),
          link: String(fd.get("link") || "").trim(),
          note: String(fd.get("note") || "").trim(),
          craving: Number(fd.get("craving")) || 3,
          kind,
          delivery_fee: isDine(kind) ? null : numOrNull(fd.get("delivery_fee")),
          eta_minutes: isDine(kind) ? null : numOrNull(fd.get("eta_minutes")),
        };
        if (!data.name) {
          toast("店名不能空");
          return;
        }
        if (existing) {
          store.update("restaurants", existing.id, data);
          editDraft = null;
          toast("已保存", "ok");
          location.hash = `#/${route}/${existing.id}`;
        } else {
          const row = store.create("restaurants", data);
          editDraft = null;
          toast("存好了", "ok");
          location.hash = `#/${route}/${row.id}`;
        }
      },
      "delete-rest": async () => {
        const ok = await confirmAction({
          title: "删掉这家店？",
          desc: "成行过的记录会保留。",
          ok: "删除",
          danger: true,
        });
        if (!ok) return;
        store.remove("restaurants", existing.id);
        editDraft = null;
        toast("已删除");
        location.hash = `#/${route}`;
      },
      "pick-craving"(el) {},
    },
    afterRender(root) {
      root.querySelectorAll("[data-craving]").forEach((b) =>
        b.addEventListener("click", () => {
          const n = b.dataset.craving;
          document.getElementById("craving-value").value = n;
          root.querySelectorAll("[data-craving]").forEach((x) => x.classList.toggle("on", x === b));
        })
      );
    },
  };
}

function numOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/* ============================================================
   餐厅详情
   ============================================================ */
export function detail(ctx) {
  const kind = ctx.kind;
  const route = kind;
  const r = select.restaurant(ctx.params.id);
  if (!r || r.deleted) {
    return {
      title: KINDS[kind].label,
      back: `#/${route}`,
      tab: route,
      html: emptyState({ emoji: "🫥", title: "这家店不在了", action: `<a class="btn" href="#/${route}">回列表</a>` }),
    };
  }

  const history = select.invites({ kind }).filter((i) => i.restaurant_id === r.id);

  return {
    title: r.name || "店铺",
    back: `#/${route}`,
    tab: route,
    top: [{ emoji: "✏️", to: `#/${route}/edit/${r.id}`, label: "编辑" }],
    html: `
      <div class="card sticker">
        <div class="flex" style="gap:12px;align-items:flex-start">
          <div style="font-size:40px">${isDine(kind) ? "🍽️" : "🛵"}</div>
          <div class="grow">
            <h2 style="font-size:20px">${esc(r.name)}</h2>
            <div class="row-sub mt-6">
              ${r.cuisine ? `<span>${esc(r.cuisine)}</span>` : ""}
              ${r.avg_price ? `<span>人均 ¥${esc(r.avg_price)}</span>` : ""}
              <span style="color:var(--tomato)">${heartRating(r.craving || 0)}</span>
            </div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="small" style="line-height:1.9">
          ${r.address ? `<div>📍 ${esc(r.address)}</div>` : ""}
          ${
            !isDine(kind)
              ? `<div>🛵 配送费 ${r.delivery_fee != null ? "¥" + esc(r.delivery_fee) : "未填"} · 约 ${
                  r.eta_minutes != null ? esc(r.eta_minutes) + " 分钟" : "—"
                }</div>`
              : ""
          }
          <div>🔗 ${esc(platformLabel(r.platform))}</div>
          ${
            r.link
              ? `<div class="btn-row mt-10">${linkChip({
                  url: r.link,
                  name: r.name,
                  platform: r.platform,
                  label: "打开原链接",
                  cls: "btn-sm btn-soft",
                })}</div>`
              : ""
          }
          ${r.note ? `<div>📝 ${esc(r.note)}</div>` : ""}
        </div>
      </div>

      <button class="btn btn-primary btn-block" data-act="go-invite">发起邀约</button>

      ${
        history.length
          ? `${sectionTitle("约过几次", "")}
             ${history
               .slice(0, 6)
               .map((i) => `<div class="req">
                  <div class="req-hd">
                    <span class="r-emoji">${i.status === "agreed" ? "✅" : i.status === "declined" ? "🙅" : "🕐"}</span>
                    <span class="r-name">${esc(String(i.scheduled_at || "").replace("T", " ").slice(0, 16) || "时间待定")}</span>
                    <span class="badge ${i.status}">${
                 i.status === "agreed" ? "成了" : i.status === "declined" ? "没成" : i.status === "pending" ? "等回复" : "取消"
               }</span>
                  </div>
                  ${i.note ? `<div class="req-note">${esc(i.note)}</div>` : ""}
                </div>`
               )
               .join("")}`
          : ""
      }
    `,
    actions: {
      "go-invite"() {
        location.hash = `#/${route}/invite/${r.id}`;
      },
    },
  };
}

/* ============================================================
   发起邀约
   ============================================================ */
export function invite(ctx) {
  const kind = ctx.kind;
  const route = kind;
  const r = select.restaurant(ctx.params.rid);
  if (!r || r.deleted) {
    return {
      title: "发起邀约",
      back: `#/${route}`,
      tab: route,
      html: emptyState({ emoji: "🫥", title: "这家店不在了" }),
    };
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const defaultDate = todayISO();
  const defaultTime = isDine(kind) ? "19:00" : `${pad(Math.min(23, now.getHours() + 1))}:00`;

  return {
    title: "发起邀约",
    sub: r.name,
    back: `#/${route}/${r.id}`,
    tab: route,
    html: `
      <div class="card">
        <div class="card-title">${isDine(kind) ? "🍽️ 出去吃" : "🛵 点外卖"}</div>
        <div class="small muted">${esc(r.name)}${r.avg_price ? ` · 人均 ¥${r.avg_price}` : ""}</div>
      </div>

      <form data-form="send-invite" novalidate>
        <div class="field-row">
          <div class="field">
            <label>${isDine(kind) ? "哪天" : "期望送达日期"}</label>
            <input class="input" type="date" name="date" value="${attr(defaultDate)}" />
          </div>
          <div class="field">
            <label>${isDine(kind) ? "几点" : "期望几点送到"}</label>
            <input class="input" type="time" name="time" value="${attr(defaultTime)}" />
          </div>
        </div>

        <div class="field">
          <label>说一句（可选）</label>
          <textarea class="input" name="note" maxlength="120" placeholder="${
            isDine(kind) ? "这家我想吃很久了" : "今晚不想动，点这个吧"
          }"></textarea>
        </div>

        ${
          isDine(kind) && r.address
            ? notice(`地址：${esc(r.address)}`, "")
            : !isDine(kind)
            ? notice(`送到：${esc(r.address || "还没填地址")}${r.delivery_fee != null ? ` · 配送费 ¥${esc(r.delivery_fee)}` : ""}`, "")
            : ""
        }

        <button class="btn btn-primary btn-block" type="submit">发给 TA 看看</button>
      </form>
      <div class="hint center mt-10">TA 同意之后才会记录到历史里。</div>
    `,
    actions: {
      "send-invite"(form) {
        const fd = new FormData(form);
        const date = String(fd.get("date") || todayISO());
        const time = String(fd.get("time") || "19:00");
        const note = String(fd.get("note") || "").trim();

        const dup = select
          .invites({ kind, status: "pending" })
          .find((i) => i.restaurant_id === r.id && String(i.scheduled_at).slice(0, 10) === date);
        if (dup) {
          toast("这一天已经约过这家了，等 TA 回话吧");
          return;
        }

        createInvite({ kind, restaurant: r, scheduledAt: `${date}T${time}`, note });
        toast("发出去了，等 TA 点头", "ok");
        location.hash = `#/${route}`;
      },
    },
  };
}

/* ============================================================
   今天吃哪家（抽签）
   ============================================================ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 每个区独立记住上次抽到的那家 */
const diceState = {
  dine: { rolling: false, pickId: "" },
  takeout: { rolling: false, pickId: "" },
};

function restMeta(r, kind) {
  const bits = [];
  if (r.avg_price) bits.push(`人均 ¥${r.avg_price}`);
  if (r.cuisine) bits.push(r.cuisine);
  if (!isDine(kind) && r.delivery_fee != null && r.delivery_fee !== "") bits.push(`配送 ¥${r.delivery_fee}`);
  if (isDine(kind) && r.address) bits.push(r.address);
  return bits.join(" · ");
}

export function random({ kind }) {
  const meta = KINDS[kind];
  const route = kind;
  const st = diceState[kind] || (diceState[kind] = { rolling: false, pickId: "" });
  const all = select.restaurants(kind);

  if (!all.length) {
    return {
      title: "今天吃哪家",
      back: `#/${route}`,
      tab: route,
      html: emptyState({
        emoji: "🎲",
        title: isDine(kind) ? "还没有存过餐厅" : "还没有存过外卖店",
        hint: isDine(kind)
          ? "把想吃的那几家存进来，纠结的时候让骰子决定。"
          : "常点的那几家存进来，抽中就直接点。",
        action: `<a class="btn btn-primary" href="#/${route}/new?import=1">粘贴分享文案</a>
                 <div style="height:8px"></div>
                 <a class="btn" href="#/${route}/new">手动添加</a>`,
      }),
    };
  }

  // 已经在等回复的店先排除，免得抽到"上周刚约过还没去"的那家
  const busyIds = new Set(
    select
      .invites({ kind, status: "pending" })
      .map((i) => i.restaurant_id)
      .filter(Boolean)
  );
  let pool = all.filter((r) => !busyIds.has(r.id));
  const excluded = all.length - pool.length;
  if (!pool.length) pool = all; // 全都约着呢，就别空着了

  const p = all.find((r) => r.id === st.pickId) || null;

  return {
    title: "今天吃哪家",
    sub: meta.label,
    back: `#/${route}`,
    tab: route,
    html: `
      <div class="card sticker" style="text-align:center;padding:18px 14px">
        <div class="slot">
          <div class="slot-emoji" id="slot-emoji">${esc(p ? isDine(kind) ? "🍽️" : "🛵" : "🎲")}</div>
          <div class="slot-name" id="slot-name">${esc(p ? p.name : "按一下抽一家")}</div>
          <div class="slot-meta" id="slot-meta">${p ? esc(restMeta(p, kind)) : "别纠结了"}</div>
        </div>
      </div>

      <button class="btn btn-primary btn-block mt-10" data-act="roll">${p ? "再抽一次" : "抽一家"}</button>

      ${
        p
          ? `<div class="btn-row mt-10">
               <button class="btn" data-act="go-invite" data-id="${attr(p.id)}">发起邀约</button>
               <button class="btn" data-act="open-rest" data-id="${attr(p.id)}">看详情</button>
             </div>
             ${
               p.link
                 ? `<div class="btn-row mt-10">${linkChip({
                     url: p.link,
                     name: p.name,
                     platform: p.platform,
                     label: "看原链接",
                     cls: "btn-sm btn-soft",
                   })}</div>`
                 : ""
             }`
          : ""
      }

      <div class="card flat mt-16">
        <div class="small muted" style="line-height:1.8">
          从${isDine(kind) ? "餐厅库" : "外卖店"}里随机抽一家。<br>
          候选 ${pool.length} 家${excluded ? `（另有 ${excluded} 家正在等回复，这次没参与）` : ""}。<br>
          <span class="tiny">抽中的话，直接发起邀约——两个人都点头才成行。</span>
        </div>
      </div>
    `,
    actions: {
      async roll(el) {
        if (st.rolling) return;
        st.rolling = true;
        el.disabled = true;

        const emojiEl = document.getElementById("slot-emoji");
        const nameEl = document.getElementById("slot-name");
        const metaEl = document.getElementById("slot-meta");
        if (emojiEl) emojiEl.classList.add("rolling");

        const order = pool.slice().sort(() => Math.random() - 0.5);
        const stopAt = Date.now() + 900;
        let i = 0;
        while (Date.now() < stopAt) {
          const r = order[i++ % order.length];
          if (emojiEl) emojiEl.textContent = isDine(kind) ? "🍽️" : "🛵";
          if (nameEl) nameEl.textContent = r.name;
          if (metaEl) metaEl.textContent = restMeta(r, kind);
          await sleep(70);
        }

        const finalPick = pool[Math.floor(Math.random() * pool.length)];
        if (emojiEl) {
          emojiEl.classList.remove("rolling");
          emojiEl.textContent = isDine(kind) ? "🍽️" : "🛵";
        }
        if (nameEl) nameEl.textContent = finalPick.name;
        if (metaEl) metaEl.textContent = restMeta(finalPick, kind);
        st.pickId = finalPick.id;
        st.rolling = false;
        el.disabled = false;
        rerender();
      },
      "go-invite"(el) {
        location.hash = `#/${route}/invite/${el.dataset.id}`;
      },
      "open-rest"(el) {
        location.hash = `#/${route}/${el.dataset.id}`;
      },
    },
  };
}
