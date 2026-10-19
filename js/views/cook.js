/* ============================================================
   饭来 · 做饭区：首页 / 点菜 / 请求详情 / 抽签
   ============================================================ */
import { store, select } from "../store.js";
import {
  esc,
  attr,
  todayISO,
  addDays,
  relativeDay,
  isoWeekday,
  fmtMD,
  guessMeal,
  copyText,
  sleep,
  clamp,
} from "../lib/util.js";
import { MEALS, mealLabel, mealEmoji, REQUEST_STATUS } from "../lib/catalog.js";
import {
  acceptRequest,
  swapRequest,
  postponeRequest,
  rejectRequest,
  withdrawRequest,
  createRequest,
  createPlan,
  addDishToMenu,
  togglePlanDone,
  removePlan,
  dishSnapshot,
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
} from "../ui/kit.js";
import { dishRow, requestCard, planLine, sectionTitle, ingredientList, stepList } from "../ui/parts.js";
import { linkChip } from "../ui/link.js";
import { askSlot } from "../ui/slot.js";

/* ============================================================
   共享动作：处理点菜请求
   ============================================================ */
export async function actAccept(req) {
  const slot = await askSlot({
    title: `接单：${req.dish_snapshot?.title || "这道菜"}`,
    desc: "排到哪一餐？确认后会出现在菜单和买菜清单里。",
    date: req.date,
    meal: req.meal,
  });
  if (!slot) return;
  acceptRequest(req, slot);
  toast("接单了，安排上了", "ok");
}

export function actSwap(req) {
  location.hash = `#/cook/pick?mode=swap&request=${req.id}&date=${req.date}&meal=${req.meal}`;
}

export async function actPostpone(req) {
  const slot = await askSlot({
    title: "推到哪一餐？",
    desc: "会给大厨留一条新的待接单提醒。",
    date: addDays(req.date, 1),
    meal: req.meal,
    okText: "推到这天",
  });
  if (!slot) return;
  postponeRequest(req, slot);
  toast("推到 " + relativeDay(slot.date) + mealLabel(slot.meal), "ok");
}

export async function actReject(req) {
  const reason = await askText({
    title: "拒绝这道菜",
    desc: "跟 TA 说一句吧，别只点拒绝。",
    label: "原因",
    placeholder: "比如：今天太累了 / 家里没这个食材",
    maxlength: 100,
    ok: "就这么说",
  });
  if (reason === null) return;
  if (!reason) {
    toast("总得说一句原因");
    return;
  }
  rejectRequest(req, reason);
  toast("已回复 TA");
}

/* ============================================================
   首页
   ============================================================ */
export function home() {
  const isChef = select.isChef();
  const role = select.role();
  const today = todayISO();
  const plans = select.plans({ date: today });
  const members = store.list("members", (m) => !m.deleted);
  const pending = select.pendingRequests();
  const myRequests = select.requests().filter((r) => r.status !== "cancelled").slice(-4).reverse();
  const dishCount = select.dishes().length;

  const emptyRoom = members.length < 2;

  const mealBlocks = MEALS.map((m) => {
    const items = plans.filter((p) => p.meal === m.key);
    return `
      <div class="meal-card">
        <div class="meal-hd">
          <span>${m.emoji}</span>
          <span class="meal-name">${m.label}</span>
          <span class="time">${m.time}</span>
          <button class="btn btn-xs btn-ghost add" data-act="go-pick" data-meal="${m.key}">＋</button>
        </div>
        <div class="meal-dishes">
          ${
            items.length
              ? items.map((p) => planLine(p)).join("")
              : `<div class="muted small" style="padding:2px 2px 4px">还没安排 · <a href="#/cook/pick?meal=${m.key}">去点一道</a></div>`
          }
        </div>
      </div>`;
  }).join("");

  const chefBlock =
    isChef && pending.length
      ? `${sectionTitle("等你接单", `<span class="badge pending">${pending.length}</span>`)}
         ${pending.map((r) => requestCard(r, { me: "chef" })).join("")}`
      : "";

  const dinerBlock =
    !isChef && myRequests.length
      ? `${sectionTitle("你点的菜", `<a class="tiny muted" href="#/cook/pick">再点一道 ›</a>`)}
         ${myRequests.map((r) => requestCard(r, { me: "diner" })).join("")}`
      : "";

  const shoppingCount = select.plans({ from: today, to: addDays(today, 6) }).reduce(
    (s, p) => s + (p.dish_snapshot?.ingredients?.length || 0),
    0
  );

  return {
    title: isChef ? "今天做什么" : "今天吃什么",
    sub: `${relativeDay(today)} · ${isoWeekday(today)} · ${fmtMD(today)}`,
    tab: "cook",
    html: `
      ${
        emptyRoom
          ? notice(
              `房间已经建好了（码 <b>${esc(store.state.room?.code || "")}</b>），等 TA 加入就能一起用。
               <div class="btn-row mt-6">
                 <button class="btn btn-xs" data-act="copy-code">复制房间码</button>
                 <a class="btn btn-xs" href="#/me/sync">看同步设置</a>
               </div>`,
              "warn"
            )
          : ""
      }

      ${chefBlock}
      ${dinerBlock}

      <div class="day-head">
        <span class="d">今天的饭</span>
        <a class="w" href="#/cook/menu">看本周 ›</a>
      </div>
      ${mealBlocks}

      <div class="tile-grid">
        <a class="tile" href="#/cook/menu"><span class="t-ico">📅</span><span class="t-name">本周菜单</span></a>
        <a class="tile" href="#/cook/shopping"><span class="t-ico">🛒</span><span class="t-name">买菜清单</span><span class="t-sub">${shoppingCount ? shoppingCount + " 项" : ""}</span></a>
        <a class="tile" href="#/dish"><span class="t-ico">📖</span><span class="t-name">菜谱库</span><span class="t-sub">${dishCount ? dishCount + " 道" : "空"}</span></a>
        <a class="tile" href="#/cook/random"><span class="t-ico">🎲</span><span class="t-name">今天吃什么</span><span class="t-sub">抽签</span></a>
      </div>

      ${
        dishCount === 0
          ? `<div class="card flat mt-16">
              <div class="small muted" style="line-height:1.8">
                <b>先建一道菜吧。</b> 把小红书或抖音的分享文案粘进来，会自动认出食材和步骤。<br>
                <a href="#/import">→ 导入第一道菜</a>
              </div>
            </div>`
          : ""
      }

      <div style="height:64px"></div>

      <button class="fab" data-act="fab" aria-label="${isChef ? "安排菜单" : "点菜"}">＋</button>
    `,
    actions: {
      fab() {
        location.hash = isChef ? `#/cook/menu?add=1` : `#/cook/pick?meal=${guessMeal()}`;
      },
      "go-pick"(el) {
        location.hash = `#/cook/pick?meal=${el.dataset.meal || guessMeal()}`;
      },
      async "copy-code"() {
        const ok = await copyText(store.state.room?.code || "");
        toast(ok ? "房间码已复制" : "复制失败", ok ? "ok" : "err");
      },
      accept(el) {
        actAccept(store.get("requests", el.dataset.id));
      },
      swap(el) {
        actSwap(store.get("requests", el.dataset.id));
      },
      postpone(el) {
        actPostpone(store.get("requests", el.dataset.id));
      },
      reject(el) {
        actReject(store.get("requests", el.dataset.id));
      },
      "open-request"(el) {
        location.hash = `#/cook/request/${el.dataset.id}`;
      },
      "toggle-done"(el) {
        const plan = store.get("plans", el.dataset.id);
        if (plan) togglePlanDone(plan);
      },
      "open-plan"(el) {
        planSheet(store.get("plans", el.dataset.id));
      },
    },
  };
}

/* ============================================================
   菜单项详情浮层
   ============================================================ */
export function planSheet(plan) {
  if (!plan) return;
  const d = plan.dish_snapshot || {};
  openSheet(
    `
      <div class="flex" style="gap:10px;margin-bottom:10px">
        <div style="font-size:34px">${esc(d.emoji || "🍳")}</div>
        <div class="grow">
          <h3 style="font-size:18px">${esc(d.title || "一道菜")}</h3>
          <div class="tiny muted">${esc(relativeDay(plan.date))} · ${mealLabel(plan.meal)}${
      d.cook_minutes ? " · " + d.cook_minutes + " 分钟" : ""
    }</div>
        </div>
      </div>
      <div class="btn-row mb-10">
        <a class="btn btn-primary" href="#/cook/step/${plan.id}">开始做饭 →</a>
        <button class="btn btn-sage" data-act="sheet-done">${plan.status === "done" ? "改回未做" : "标记已做"}</button>
      </div>
      ${
        d.source_url
          ? `<div class="btn-row mb-10">${linkChip({
              url: d.source_url,
              name: d.title,
              platform: d.source_platform,
              label: "看原帖",
              cls: "btn-sm btn-soft",
            })}</div>`
          : ""
      }
      <div class="sheet-sub">食材</div>
      ${ingredientList(d.ingredients || [])}
      <div class="sheet-sub mt-16">做法</div>
      <div class="card">${stepList(d.steps || [])}</div>
      <div class="btn-row mt-16">
        <button class="btn btn-ghost" data-act="sheet-move">改到别的餐</button>
        <button class="btn btn-danger" data-act="sheet-remove">从菜单移除</button>
      </div>
    `,
    {
      onMount(body) {
        body.querySelector('[data-act="sheet-done"]').addEventListener("click", () => {
          togglePlanDone(plan);
          closeSheet();
        });
        body.querySelector('[data-act="sheet-move"]').addEventListener("click", async () => {
          const slot = await askSlot({ title: "改到哪一餐？", date: plan.date, meal: plan.meal });
          if (!slot) return;
          store.update("plans", plan.id, { date: slot.date, meal: slot.meal });
          closeSheet();
          toast("已移动", "ok");
        });
        body.querySelector('[data-act="sheet-remove"]').addEventListener("click", async () => {
          const ok = await confirmAction({ title: "从菜单移除？", desc: "买菜清单会相应减少这一道菜的食材。", ok: "移除", danger: true });
          if (!ok) return;
          removePlan(plan);
          closeSheet();
          toast("已移除");
        });
      },
    }
  );
}

/* ============================================================
   点菜 / 排菜
   ============================================================ */
let pickState = null;

function initPick(query) {
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : todayISO();
  const meal = MEALS.some((m) => m.key === query.meal) ? query.meal : guessMeal();
  const mode = ["request", "plan", "swap"].includes(query.mode) ? query.mode : "request";
  const presetDish = query.dish || "";
  const preset = presetDish ? select.dish(presetDish) : null;
  pickState = {
    date,
    meal,
    mode,
    requestId: query.request || "",
    q: "",
    selected: new Set(preset ? [preset.id] : []),
    note: "",
  };
}

export function pick(ctx) {
  const needsKey = `${ctx.query.date || ""}|${ctx.query.meal || ""}|${ctx.query.mode || ""}|${
    ctx.query.dish || ""
  }|${ctx.query.request || ""}`;
  if (!pickState || pickState._key !== needsKey) {
    initPick(ctx.query);
    pickState._key = needsKey;
  }
  const st = pickState;
  const isChef = select.isChef();
  const isSwap = st.mode === "swap";
  const allDishes = select.dishes();
  const dishes = allDishes.filter((d) => {
    if (!st.q) return true;
    const q = st.q.toLowerCase();
    return (
      (d.title || "").toLowerCase().includes(q) ||
      (d.ingredients || []).some((i) => (i.name || "").toLowerCase().includes(q))
    );
  });

  const dayChips = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i));

  const title = isSwap ? "换一道" : st.mode === "plan" ? "排进菜单" : "点菜";

  return {
    title,
    sub: `${relativeDay(st.date)} · ${mealLabel(st.meal)}`,
    back: "#/cook",
    tab: "cook",
    html: `
      <div class="field" style="margin-bottom:8px">
        <label>哪天</label>
        <div class="chips">
          ${dayChips
            .map(
              (d) =>
                `<button class="chip ${d === st.date ? "on" : ""}" data-act="pick-date" data-value="${d}">${esc(
                  relativeDay(d)
                )}<span class="tiny" style="opacity:.6;margin-left:4px">${esc(isoWeekday(d))}</span></button>`
            )
            .join("")}
        </div>
      </div>
      <div class="field" style="margin-bottom:10px">
        <div class="segmented">
          ${MEALS.map(
            (m) =>
              `<button class="${m.key === st.meal ? "on" : ""}" data-act="pick-meal" data-value="${m.key}">${m.emoji} ${m.label}</button>`
          ).join("")}
        </div>
      </div>

      ${
        isSwap
          ? notice("选一道替代的菜，大厨会收到「换菜」说明。", "")
          : st.mode === "plan"
          ? notice("这里可以直接把菜排进菜单，不需要走点单流程。", "")
          : ""
      }

      <div class="field">
        <input class="input" id="pick-search" placeholder="搜菜名或食材" value="${attr(st.q)}" />
      </div>

      ${
        allDishes.length === 0
          ? emptyState({
              emoji: "📖",
              title: "还没有菜可以点",
              hint: "菜谱库是空的。先导入一道菜，或者自己写一道。",
              action: `<div class="btn-row">
                <a class="btn btn-primary" href="#/import">导入一道菜</a>
                <a class="btn" href="#/dish/new">手动新建</a>
              </div>`,
            })
          : `<div class="list" id="pick-list">
              ${dishes
                .map((d) => {
                  const on = st.selected.has(d.id);
                  return `<button class="row ${on ? "sel" : ""}" data-act="toggle-sel" data-id="${attr(d.id)}">
                    <div class="row-emoji">${esc(d.emoji || "🍳")}</div>
                    <div class="row-main">
                      <div class="row-title"><span class="t">${esc(d.title)}</span></div>
                      <div class="row-sub">
                        ${d.cook_minutes ? `<span>${d.cook_minutes} 分钟</span>` : ""}
                        ${d.cuisine ? `<span>${esc(d.cuisine)}</span>` : ""}
                        ${d.ingredients?.length ? `<span>${d.ingredients.length} 样食材</span>` : ""}
                      </div>
                    </div>
                    <div class="row-aside">
                      <span class="checkbox ${on ? "on" : ""}">✓</span>
                    </div>
                  </button>`;
                })
                .join("")}
            </div>`
      }

      ${
        st.selected.size
          ? `<div class="card tight" style="margin-top:10px" id="note-card">
              <label class="tiny muted" style="display:block;margin-bottom:6px">${
                isSwap ? "换菜说明（可留空）" : st.mode === "plan" ? "备注（可留空）" : "口味 / 要求（可留空）"
              }</label>
              <input class="input" id="pick-note" maxlength="120" placeholder="${
                isSwap ? "今天没买到鱼，换成鸡翅啦" : "少放辣、多放点蒜…"
              }" value="${attr(st.note || "")}" />
            </div>
            <div class="selbar" id="selbar">
              <div class="selbar-info">已选 <b>${st.selected.size}</b> 道</div>
              <button class="btn btn-ghost btn-sm" data-act="clear-sel">清空</button>
              <button class="btn btn-primary btn-sm" data-act="submit-pick">${
              isSwap ? "换成这道" : st.mode === "plan" ? "排进菜单" : "告诉大厨"
            }</button>
            </div>`
          : ""
      }
    `,
    actions: {
      "pick-date"(el) {
        st.date = el.dataset.value;
        rerender();
      },
      "pick-meal"(el) {
        st.meal = el.dataset.value;
        rerender();
      },
      "toggle-sel"(el) {
        const id = el.dataset.id;
        if (st.selected.has(id)) st.selected.delete(id);
        else {
          if (isSwap) st.selected.clear();
          st.selected.add(id);
        }
        rerender();
      },
      "clear-sel"() {
        st.selected.clear();
        rerender();
      },
      async "submit-pick"() {
        const ids = Array.from(st.selected);
        if (!ids.length) return;

        // 备注直接读页面上的输入框（不再弹窗，避免 iOS 上 fixed 弹层点不动）
        const noteEl = document.getElementById("pick-note");
        const note = (noteEl ? noteEl.value : "").trim();

        if (isSwap) {
          const target = select.dish(ids[0]);
          const req = store.get("requests", st.requestId);
          if (!target || !req) {
            toast("出错了，回去重试", "err");
            return;
          }
          swapRequest(req, target, { date: st.date, meal: st.meal, note });
          toast("已换菜", "ok");
          location.hash = "#/cook";
          return;
        }

        if (st.mode === "plan") {
          let n = 0;
          for (const id of ids) {
            const dish = select.dish(id);
            if (dish) {
              addDishToMenu({ date: st.date, meal: st.meal, dish });
              n++;
            }
          }
          toast(`排好了 ${n} 道`, "ok");
          location.hash = "#/cook";
          return;
        }

        let n = 0;
        for (const id of ids) {
          const dish = select.dish(id);
          if (dish) {
            createRequest({ dish, date: st.date, meal: st.meal, note });
            n++;
          }
        }
        toast(n ? "说好了，等大厨接单" : "没点上，再试一次", n ? "ok" : "err");
        location.hash = "#/cook";
      },
    },
    afterRender(root) {
      // 备注随输入保存，避免勾选其他菜时被重渲染清空
      const noteInput = root.querySelector("#pick-note");
      if (noteInput) {
        noteInput.addEventListener("input", () => (st.note = noteInput.value));
      }
      const input = root.querySelector("#pick-search");
      if (input) {
        input.addEventListener("input", () => {
          st.q = input.value.trim();
          const box = root.querySelector("#pick-list");
          if (!box) return;
          box.querySelectorAll(".row").forEach((row) => {
            const text = row.textContent.toLowerCase();
            row.style.display = !st.q || text.includes(st.q.toLowerCase()) ? "" : "none";
          });
        });
      }
    },
  };
}

/* ============================================================
   请求详情
   ============================================================ */
export function requestDetail(ctx) {
  const req = store.get("requests", ctx.params.id);
  if (!req || req.deleted) {
    return {
      title: "点菜",
      back: "#/cook",
      tab: "cook",
      html: emptyState({ emoji: "🫥", title: "这条点菜不在了" }),
    };
  }
  const d = req.dish_snapshot || {};
  const dish = select.dish(req.dish_id);
  const isChef = select.isChef();
  const meta = REQUEST_STATUS[req.status] || { label: req.status };

  const plan = req.status === "accepted" || req.status === "swapped"
    ? select.plans().find((p) => p.request_id === req.id)
    : null;

  return {
    title: "点菜详情",
    back: "#/cook",
    tab: "cook",
    html: `
      <div class="card sticker">
        <div class="flex" style="gap:12px;align-items:flex-start">
          <div style="font-size:40px">${esc(d.emoji || "🍳")}</div>
          <div class="grow">
            <h2 style="font-size:20px">${esc(d.title || "一道菜")}</h2>
            <div class="row-sub mt-6">
              <span>${mealEmoji(req.meal)} ${mealLabel(req.meal)}</span>
              <span>${esc(relativeDay(req.date))}</span>
              <span>${esc(meta.label)}</span>
            </div>
          </div>
        </div>
        ${req.note ? `<div class="req-note" style="margin-top:12px">${esc(req.note)}</div>` : ""}
        ${req.decision_note ? `<div class="notice mt-10">${esc(req.decision_note)}</div>` : ""}
      </div>

      ${
        isChef && req.status === "pending"
          ? `<div class="card">
              <div class="card-title">怎么回 TA</div>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="accept" data-id="${attr(req.id)}">接单</button>
                <button class="btn" data-act="swap" data-id="${attr(req.id)}">换一道</button>
              </div>
              <div class="btn-row mt-10">
                <button class="btn" data-act="postpone" data-id="${attr(req.id)}">推后</button>
                <button class="btn btn-danger" data-act="reject" data-id="${attr(req.id)}">拒绝</button>
              </div>
            </div>`
          : ""
      }

      ${
        !isChef && req.status === "pending"
          ? `<button class="btn btn-ghost btn-block" data-act="withdraw" data-id="${attr(req.id)}">撤回这条点菜</button>`
          : ""
      }

      ${
        plan
          ? `<div class="card">
              <div class="card-title">已排进 ${esc(relativeDay(plan.date))} ${mealLabel(plan.meal)}</div>
              <button class="btn btn-sm btn-soft" data-act="open-plan" data-id="${attr(plan.id)}">看看这道菜</button>
            </div>`
          : ""
      }

      ${
        dish
          ? `<div class="card flat">
              <div class="card-title">菜谱 <a class="right tiny" href="#/dish/${dish.id}">查看完整做法 ›</a></div>
              ${stepList((dish.steps || []).slice(0, 3))}
            </div>`
          : ""
      }

      <div class="syncbar mt-16">
        <span>提交于 ${esc(new Date(req.created_at || Date.now()).toLocaleString("zh-CN", { hour12: false }))}</span>
      </div>
    `,
    actions: {
      accept(el) {
        actAccept(store.get("requests", el.dataset.id));
      },
      swap(el) {
        actSwap(store.get("requests", el.dataset.id));
      },
      postpone(el) {
        actPostpone(store.get("requests", el.dataset.id));
      },
      reject(el) {
        actReject(store.get("requests", el.dataset.id));
      },
      "open-plan"(el) {
        planSheet(store.get("plans", el.dataset.id));
      },
      async withdraw(el) {
        const ok = await confirmAction({ title: "撤回这条点菜？", ok: "撤回" });
        if (!ok) return;
        withdrawRequest(store.get("requests", el.dataset.id));
        toast("撤回了");
        location.hash = "#/cook";
      },
    },
  };
}

/* ============================================================
   今天吃什么（抽签）
   ============================================================ */
let slotState = { rolling: false, pick: null, finishAt: 0 };

export function random() {
  const dishes = select.dishes();
  if (!dishes.length) {
    return {
      title: "今天吃什么",
      back: "#/cook",
      tab: "cook",
      html: emptyState({
        emoji: "🎲",
        title: "没有菜可以抽",
        hint: "先去菜谱库放几道菜进来。",
        action: `<a class="btn btn-primary" href="#/import">导入一道菜</a>`,
      }),
    };
  }

  const p = slotState.pick;
  return {
    title: "今天吃什么",
    back: "#/cook",
    tab: "cook",
    html: `
      <div class="card sticker" style="text-align:center;padding:18px 14px">
        <div class="slot">
          <div class="slot-emoji" id="slot-emoji">${esc(p?.emoji || "🎲")}</div>
          <div class="slot-name" id="slot-name">${esc(p?.title || "按一下抽一道")}</div>
          <div class="slot-meta" id="slot-meta">${p ? esc((p.cook_minutes ? p.cook_minutes + " 分钟 · " : "") + (p.cuisine || "")) : "别纠结了"}</div>
        </div>
      </div>
      <button class="btn btn-primary btn-block mt-10" data-act="roll">${p ? "再抽一次" : "抽一道"}</button>
      ${
        p
          ? `<div class="btn-row mt-10">
               <button class="btn" data-act="to-menu">加进菜单</button>
               <button class="btn" data-act="to-request">发给大厨</button>
               <button class="btn btn-ghost" data-act="open-dish" data-id="${attr(p.id)}">看做法</button>
             </div>`
          : ""
      }
      <div class="card flat mt-16">
        <div class="small muted" style="line-height:1.8">从你菜谱库里随机挑一道。<br>一共 ${dishes.length} 道候选。</div>
      </div>
    `,
    actions: {
      async roll(el) {
        if (slotState.rolling) return;
        slotState.rolling = true;
        el.disabled = true;
        const emojiEl = document.getElementById("slot-emoji");
        const nameEl = document.getElementById("slot-name");
        const metaEl = document.getElementById("slot-meta");
        emojiEl.classList.add("rolling");

        let i = 0;
        const pool = dishes.slice();
        const stopAt = Date.now() + 900;
        while (Date.now() < stopAt) {
          const d = pool[i++ % pool.length];
          emojiEl.textContent = d.emoji || "🍳";
          nameEl.textContent = d.title;
          metaEl.textContent = (d.cook_minutes ? d.cook_minutes + " 分钟 · " : "") + (d.cuisine || "");
          await sleep(70);
        }
        const finalPick = pool[Math.floor(Math.random() * pool.length)];
        emojiEl.classList.remove("rolling");
        emojiEl.textContent = finalPick.emoji || "🍳";
        nameEl.textContent = finalPick.title;
        metaEl.textContent = (finalPick.cook_minutes ? finalPick.cook_minutes + " 分钟 · " : "") + (finalPick.cuisine || "");
        slotState.pick = finalPick;
        slotState.rolling = false;
        el.disabled = false;
        rerender();
      },
      async "to-menu"() {
        const p = slotState.pick;
        if (!p) return;
        const slot = await askSlot({ title: `把「${p.title}」排到哪一餐？`, date: todayISO(), meal: guessMeal() });
        if (!slot) return;
        addDishToMenu({ date: slot.date, meal: slot.meal, dish: p });
        toast("排上了", "ok");
        location.hash = "#/cook";
      },
      "to-request"() {
        const p = slotState.pick;
        if (!p) return;
        location.hash = `#/cook/pick?dish=${p.id}&meal=${guessMeal()}`;
      },
      "open-dish"(el) {
        location.hash = `#/dish/${el.dataset.id}`;
      },
    },
  };
}
