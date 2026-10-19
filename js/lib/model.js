/* ============================================================
   饭来 · 业务操作（状态流转集中在这里，视图只管调用）
   ============================================================ */
import { store, select } from "../store.js";
import { nowMs } from "./util.js";

export function myRole() {
  return store.state.profile?.role || "diner";
}

export function myDevice() {
  return store.state.profile?.deviceId || "local";
}

/** 菜谱 → 菜单快照（冗余存一份，原菜谱删了历史仍可读） */
export function dishSnapshot(dish) {
  return {
    title: dish.title || "一道菜",
    emoji: dish.emoji || "🍳",
    cuisine: dish.cuisine || "",
    cook_minutes: dish.cook_minutes || null,
    servings: dish.servings || "",
    ingredients: dish.ingredients || [],
    steps: dish.steps || [],
  };
}

/* ============================================================
   菜单
   ============================================================ */
export function createPlan({ date, meal, dishId = "", snapshot, requestId = "" }) {
  return store.create("plans", {
    date,
    meal,
    dish_id: dishId,
    dish_snapshot: snapshot || { title: "一道菜", emoji: "🍳", ingredients: [], steps: [] },
    request_id: requestId,
    status: "planned",
    amount: 0,
    thought: "",
  });
}

export function addDishToMenu({ date, meal, dish }) {
  return createPlan({ date, meal, dishId: dish.id, snapshot: dishSnapshot(dish) });
}

export function togglePlanDone(plan) {
  const next = plan.status === "done" ? "planned" : "done";
  return store.update("plans", plan.id, {
    status: next,
    ...(next === "done" ? { done_at: nowMs() } : {}),
  });
}

export function setPlanStatus(plan, status) {
  return store.update("plans", plan.id, { status });
}

export function removePlan(plan) {
  return store.remove("plans", plan.id);
}

/* ============================================================
   点菜请求
   ============================================================ */
export function createRequest({ dish, date, meal, note = "" }) {
  return store.create("requests", {
    dish_id: dish.id,
    dish_snapshot: { title: dish.title, emoji: dish.emoji || "🍳", cook_minutes: dish.cook_minutes || null },
    date,
    meal,
    note,
    status: "pending",
    decision_note: "",
    target_dish_id: "",
    origin_id: "",
    created_by: myDevice(),
  });
}

function decide(req, patch) {
  return store.update("requests", req.id, {
    ...patch,
    decided_by: myRole(),
    decided_at: nowMs(),
  });
}

/** 接单：生成菜单项 */
export function acceptRequest(req, { date, meal }) {
  const dish = select.dish(req.dish_id);
  const snapshot = dish ? dishSnapshot(dish) : { ...(req.dish_snapshot || {}) };
  const plan = createPlan({ date, meal, dishId: req.dish_id, snapshot, requestId: req.id });
  decide(req, { status: "accepted", date, meal });
  return plan;
}

/** 换一道：用另一道菜替代，并记录说明 */
export function swapRequest(req, dish, { date, meal, note = "" }) {
  const plan = createPlan({
    date,
    meal,
    dishId: dish.id,
    snapshot: dishSnapshot(dish),
    requestId: req.id,
  });
  decide(req, {
    status: "swapped",
    date,
    meal,
    target_dish_id: dish.id,
    decision_note: note || `换成了「${dish.title}」`,
  });
  return plan;
}

/** 推后：原请求置为 postponed，并在目标日派生一条新的待接单请求 */
export function postponeRequest(req, { date, meal }) {
  decide(req, { status: "postponed", decision_note: `推到 ${date} ${meal}` });
  return store.create("requests", {
    dish_id: req.dish_id,
    dish_snapshot: { ...(req.dish_snapshot || {}) },
    date,
    meal,
    note: req.note || "",
    status: "pending",
    decision_note: "",
    target_dish_id: "",
    origin_id: req.id,
    created_by: req.created_by || "",
  });
}

/** 拒绝：必须给理由 */
export function rejectRequest(req, reason) {
  return decide(req, { status: "rejected", decision_note: reason });
}

export function withdrawRequest(req) {
  return store.update("requests", req.id, { status: "cancelled", decided_by: myRole(), decided_at: nowMs() });
}

/* ============================================================
   外食 / 外卖邀约
   ============================================================ */
export function restaurantSnapshot(r) {
  return {
    name: r.name || "一家店",
    cuisine: r.cuisine || "",
    avg_price: r.avg_price ?? null,
    address: r.address || "",
    delivery_fee: r.delivery_fee ?? null,
    eta_minutes: r.eta_minutes ?? null,
    link: r.link || "",
    platform: r.platform || "manual",
  };
}

export function createInvite({ kind, restaurant, scheduledAt, note = "" }) {
  return store.create("invites", {
    kind,
    restaurant_id: restaurant.id,
    restaurant_snapshot: restaurantSnapshot(restaurant),
    proposer: myRole(),
    status: "pending",
    scheduled_at: scheduledAt,
    note,
    amount: 0,
    payer: "none",
  });
}

export function decideInvite(invite, agree, note = "") {
  return store.update("invites", invite.id, {
    status: agree ? "agreed" : "declined",
    decision_note: note,
    decided_by: myRole(),
    decided_at: nowMs(),
  });
}

export function cancelInvite(invite) {
  return store.update("invites", invite.id, { status: "cancelled", decided_by: myRole(), decided_at: nowMs() });
}

export function setInviteMoney(invite, { amount, payer }) {
  const patch = {};
  if (amount !== undefined) patch.amount = Number(amount) || 0;
  if (payer !== undefined) patch.payer = payer;
  return store.update("invites", invite.id, patch);
}

/* ============================================================
   统计
   ============================================================ */
export function statsFor(items) {
  const cook = items.filter((i) => i.type === "cook");
  const dine = items.filter((i) => i.type === "dine");
  const take = items.filter((i) => i.type === "takeout");
  const spend = items.filter((i) => i.type !== "cook").reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const payerCount = { chef: 0, diner: 0, split: 0, none: 0 };
  for (const i of items) {
    if (i.type === "cook") continue;
    payerCount[i.payer || "none"] = (payerCount[i.payer || "none"] || 0) + 1;
  }

  const cookTitles = new Map();
  for (const i of cook) cookTitles.set(i.title, (cookTitles.get(i.title) || 0) + 1);
  const topDishes = Array.from(cookTitles.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const restNames = new Map();
  for (const i of items) {
    if (i.type === "cook") continue;
    restNames.set(i.title, (restNames.get(i.title) || 0) + 1);
  }
  const topRestaurants = Array.from(restNames.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const myRoleKey = myRole();
  const otherRoleKey = myRoleKey === "chef" ? "diner" : "chef";
  const diff = (payerCount[myRoleKey] || 0) - (payerCount[otherRoleKey] || 0);

  return {
    cookCount: cook.length,
    dineCount: dine.length,
    takeCount: take.length,
    spend,
    avg: items.length ? Math.round((spend / (dine.length + take.length || 1)) * 10) / 10 : 0,
    payerCount,
    diff,
    topDishes,
    topRestaurants,
    total: items.length,
  };
}

/** 按时间窗口过滤历史 */
export function filterByRange(items, range) {
  const today = new Date();
  if (range === "all") return items;
  if (range === "week") {
    const d = new Date(today);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return items.filter((i) => i.date >= start);
  }
  const prefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  return items.filter((i) => String(i.date).startsWith(prefix));
}
