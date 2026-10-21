/* ============================================================
   饭来 · 本地状态仓库
   ------------------------------------------------------------
   设计：内存单例 + localStorage 持久化 + 订阅通知
   - 所有实体落在 state.data[table] 数组里
   - 本地变更立即生效（乐观 UI），并进入 state.dirty 待推送队列
   - 本机配置（profile / sync）不推送
   ============================================================ */
import { uid, nowMs, clone, debounce } from "./lib/util.js";
import { MEAL_KEYS } from "./lib/catalog.js";

const KEY = "fanlai.v1";

export const TABLES = ["dishes", "requests", "plans", "restaurants", "invites", "checks", "members", "rooms"];

function blankState() {
  return {
    version: 1,
    profile: null, // { deviceId, role, nickname, joinedAt }
    room: null, // { code, createdAt }
    sync: {
      url: "",
      key: "",
      lastSyncAt: 0,
      lastError: "",
      cursor: {},
      lastPushedAt: 0,
    },
    data: {
      rooms: [],
      members: [],
      dishes: [],
      requests: [],
      plans: [],
      restaurants: [],
      invites: [],
      checks: [],
    },
    local: {
      lastSeen: {}, // { requests: ts, invites: ts }
      ackedInvites: [], // 提出方已确认的"被拒邀约" id
      onboardSeen: false,
      installHintSeen: false,
    },
    dirty: [],
  };
}

function migrate(parsed) {
  const base = blankState();
  const out = { ...base, ...parsed };
  out.sync = { ...base.sync, ...(parsed.sync || {}) };
  out.sync.cursor = { ...(parsed.sync && parsed.sync.cursor) };
  out.local = { ...base.local, ...(parsed.local || {}) };
  out.data = { ...base.data };
  for (const t of TABLES) out.data[t] = Array.isArray((parsed.data || {})[t]) ? parsed.data[t] : [];
  out.dirty = Array.isArray(parsed.dirty) ? parsed.dirty : [];
  return out;
}

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankState();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn("[饭来] 本地数据读取失败，已回退为空", err);
    return blankState();
  }
}

const persist = debounce(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[饭来] 本地保存失败（可能是空间不足）", err);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fanlai:storage-error", { detail: err }));
    }
  }
}, 120);

/** 批量变更：期间不触发重渲染，结束后只通知一次 */
let batching = 0;
let notifyPending = false;

function notify() {
  if (batching > 0) {
    notifyPending = true;
    return;
  }
  for (const fn of subs) {
    try {
      fn(state);
    } catch (err) {
      console.error("[饭来] 订阅回调异常", err);
    }
  }
}

/* ---------- 生命周期 ---------- */
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => persist.flush());
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist.flush();
  });
}

export const store = {
  get state() {
    return state;
  },
  TABLES,

  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },

  /** 只通知重渲染，不写盘（用于同步状态等易失字段） */
  touch() {
    notify();
  },

  /** 修改状态并落盘 + 通知 */
  commit(fn) {
    fn(state);
    persist();
    notify();
  },

  /* ---------- 配置 ---------- */
  initProfile({ deviceId, role, nickname }) {
    state.profile = {
      deviceId: deviceId || uid("dev"),
      role,
      nickname,
      joinedAt: nowMs(),
    };
    persist();
    notify();
    return state.profile;
  },

  setProfile(patch) {
    if (!state.profile) return;
    Object.assign(state.profile, patch);
    persist();
    notify();
  },

  setRoom(room) {
    state.room = room;
    if (room) {
      const existing = state.data.rooms.find((r) => r.code === room.code);
      if (!existing) {
        const now = nowMs();
        const row = {
          id: room.code,
          code: room.code,
          created_at: room.createdAt || now,
          updated_at: now,
          updated_by: state.profile?.deviceId || "local",
          deleted: false,
        };
        state.data.rooms.push(row);
        // 关键：房间行也必须进推送队列，否则对端查不到房间码
        markDirty("rooms", row.id);
      }
    }
    persist();
    notify();
  },

  clearRoom() {
    state.room = null;
    persist();
    notify();
  },

  setSyncConfig(patch) {
    Object.assign(state.sync, patch);
    persist();
    notify();
  },

  setSyncStatus(patch) {
    Object.assign(state.sync, patch);
    persist();
    notify();
  },

  markSeen(kind, ts = nowMs(), { silent = false } = {}) {
    if ((state.local.lastSeen[kind] || 0) >= ts) return;
    state.local.lastSeen[kind] = ts;
    persist();
    if (!silent) notify();
  },

  /* ---------- 被拒邀约的"我确认过了" ----------
     只影响提出方自己的待办队列：确认后这条不再出现在首页。 */
  isInviteAcked(id) {
    return (state.local.ackedInvites || []).includes(id);
  },

  ackInvite(id) {
    if (!id) return;
    const list = state.local.ackedInvites || [];
    if (!list.includes(id)) list.push(id);
    // 只留最近 200 条，避免无限增长
    state.local.ackedInvites = list.slice(-200);
    persist();
    notify();
  },

  unackInvite(id) {
    const list = state.local.ackedInvites || [];
    state.local.ackedInvites = list.filter((x) => x !== id);
    persist();
    notify();
  },

  setLocal(patch) {
    Object.assign(state.local, patch);
    persist();
    notify();
  },

  /* ---------- 通用读写 ---------- */
  all(table) {
    return state.data[table] || [];
  },

  list(table, pred) {
    const arr = state.data[table] || [];
    return pred ? arr.filter(pred) : arr.slice();
  },

  get(table, id) {
    return (state.data[table] || []).find((r) => r.id === id) || null;
  },

  /** 新建一行（自动补 id / 时间戳 / 房间 / 设备） */
  create(table, data) {
    const now = nowMs();
    const row = {
      id: data.id || uid(table.slice(0, 3)),
      room_code: state.room?.code || "",
      deleted: false,
      created_at: now,
      updated_at: now,
      updated_by: state.profile?.deviceId || "local",
      ...data,
    };
    row.id = row.id || uid(table.slice(0, 3));
    row.updated_at = now;
    state.data[table].push(row);
    markDirty(table, row.id);
    persist();
    notify();
    return row;
  },

  /** 局部更新（自动刷新 updated_at） */
  update(table, id, patch) {
    const row = this.get(table, id);
    if (!row) return null;
    Object.assign(row, patch, {
      updated_at: nowMs(),
      updated_by: state.profile?.deviceId || "local",
    });
    markDirty(table, row.id);
    persist();
    notify();
    return row;
  },

  upsert(table, row) {
    const idx = (state.data[table] || []).findIndex((r) => r.id === row.id);
    if (idx >= 0) state.data[table][idx] = { ...state.data[table][idx], ...row };
    else state.data[table].push(row);
    markDirty(table, row.id);
    persist();
    notify();
    return row;
  },

  /** 软删除：保留墓碑，避免同步后复活 */
  remove(table, id) {
    return this.update(table, id, { deleted: true });
  },

  /** 同步层合并远端行（LWW：新者胜，同刻按设备 ID 字典序） */
  applyRemote(table, rows) {
    let changed = false;
    const arr = state.data[table];
    for (const remote of rows || []) {
      const idx = arr.findIndex((r) => r.id === remote.id);
      if (idx < 0) {
        arr.push({ ...remote });
        changed = true;
        continue;
      }
      const local = arr[idx];
      const lt = Number(local.updated_at) || 0;
      const rt = Number(remote.updated_at) || 0;
      const remoteWins =
        rt > lt || (rt === lt && String(remote.updated_by || "") > String(local.updated_by || ""));
      if (remoteWins) {
        // 裁决类实体：已处理的不会被"待处理"回退；两边都处理过则先决策者胜
        const decidable = DECIDED_CHECK[table];
        if (decidable && decidable(local)) {
          if (!decidable(remote)) continue;
          const ldt = Number(local.decided_at) || 0;
          const rdt = Number(remote.decided_at) || 0;
          if (ldt && rdt && ldt <= rdt) continue;
        }
        arr[idx] = { ...remote };
        changed = true;
        // 远端赢，本地这条不再需要推送
        dropDirty(table, remote.id);
      }
    }
    if (changed) {
      persist();
      notify();
    }
    return changed;
  },

  /** 立即落盘（同步游标等易失字段用） */
  saveNow() {
    persist.flush();
  },

  /** 批量写入：合并通知，避免一次同步触发多次重渲染（支持 async） */
  async batch(fn) {
    batching++;
    try {
      return await fn();
    } finally {
      batching--;
      if (batching === 0 && notifyPending) {
        notifyPending = false;
        notify();
      }
    }
  },

  markClean(entries) {
    if (!entries || !entries.length) return;
    const set = new Set(entries.map((e) => `${e.table}:${e.id}`));
    state.dirty = state.dirty.filter((d) => !set.has(`${d.table}:${d.id}`));
    persist();
  },

  dirtyEntries() {
    return state.dirty.slice();
  },

  dirtyCount() {
    return state.dirty.length;
  },

  /* ---------- 全量替换（备份恢复） ---------- */
  replaceAll(snapshot) {
    const next = migrate(snapshot);
    next.profile = state.profile; // 保留本机身份
    next.sync = { ...state.sync, url: state.sync.url, key: state.sync.key };
    next.dirty = [];
    state = next;
    persist.flush();
    notify();
  },

  reset() {
    const keepProfile = state.profile;
    const keepSync = state.sync;
    state = blankState();
    state.sync = keepSync;
    if (keepProfile) state.profile = keepProfile;
    persist.flush();
    notify();
  },

  snapshot() {
    return clone(state);
  },
};

/* ---------- 脏标记 ---------- */
const DECIDED_CHECK = {
  requests: (r) => !!r.status && r.status !== "pending" && r.status !== "cancelled",
  invites: (r) => !!r.status && r.status !== "pending",
};

function markDirty(table, id) {
  if (!state.dirty.some((d) => d.table === table && d.id === id)) {
    state.dirty.push({ table, id });
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fanlai:dirty"));
  }
}

function dropDirty(table, id) {
  state.dirty = state.dirty.filter((d) => !(d.table === table && d.id === id));
}

/* ============================================================
   选择器
   ============================================================ */
export const select = {
  role() {
    return state.profile?.role || "diner";
  },
  isChef() {
    return store.state.profile?.role === "chef";
  },
  nickname() {
    return state.profile?.nickname || "";
  },
  memberOf(role) {
    return store.list("members", (m) => m.role === role && !m.deleted)[0] || null;
  },
  /** 对方的昵称（用于文案插值） */
  partnerName() {
    const mine = state.profile?.role;
    if (!mine) return "TA";
    const other = store.list("members", (m) => m.role !== mine && !m.deleted)[0];
    if (other?.nickname) return other.nickname;
    return mine === "chef" ? "食客" : "大厨";
  },
  chefName() {
    return store.list("members", (m) => m.role === "chef" && !m.deleted)[0]?.nickname || "大厨";
  },
  dinerName() {
    return store.list("members", (m) => m.role === "diner" && !m.deleted)[0]?.nickname || "食客";
  },

  dishes() {
    return store.list("dishes", (d) => !d.deleted);
  },
  dish(id) {
    return store.get("dishes", id);
  },

  requests({ status, date, meal } = {}) {
    return store
      .list("requests", (r) => !r.deleted)
      .filter((r) => (status ? r.status === status : true))
      .filter((r) => (date ? r.date === date : true))
      .filter((r) => (meal ? r.meal === meal : true))
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  },
  pendingRequests() {
    return this.requests({ status: "pending" });
  },

  plans({ from, to, date, meal, includeDeleted = false } = {}) {
    return store
      .list("plans", (p) => includeDeleted || !p.deleted)
      .filter((p) => (date ? p.date === date : true))
      .filter((p) => (from ? p.date >= from : true))
      .filter((p) => (to ? p.date <= to : true))
      .filter((p) => (meal ? p.meal === meal : true))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return MEAL_KEYS.indexOf(a.meal) - MEAL_KEYS.indexOf(b.meal);
      });
  },
  plan(id) {
    return store.get("plans", id);
  },

  restaurants(kind) {
    return store
      .list("restaurants", (r) => !r.deleted && (!kind || r.kind === kind))
      .sort((a, b) => (b.craving || 0) - (a.craving || 0) || (b.created_at || 0) - (a.created_at || 0));
  },
  restaurant(id) {
    return store.get("restaurants", id);
  },

  invites({ kind, status } = {}) {
    return store
      .list("invites", (i) => !i.deleted)
      .filter((i) => (kind ? i.kind === kind : true))
      .filter((i) => (status ? i.status === status : true))
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  },
  pendingInvites(kind) {
    return this.invites({ kind, status: "pending" });
  },
  invite(id) {
    return store.get("invites", id);
  },

  checks(scope) {
    return store.list("checks", (c) => !c.deleted && c.scope === scope);
  },

  /** 未处理的点菜请求数（给红点用） */
  badgeRequests() {
    if (!state.profile) return 0;
    if (state.profile.role === "chef") return this.pendingRequests().length;
    // 食客：待接单的自己的请求之外，还有"大厨已处理但未看过"的数量
    const seen = state.local.lastSeen.requests || 0;
    return this.requests().filter(
      (r) => r.status !== "pending" && r.status !== "cancelled" && (r.decided_at || r.updated_at) > seen
    ).length;
  },

  badgeInvites(kind) {
    if (!state.profile) return 0;
    const mine = state.profile.role;
    const seen = state.local.lastSeen.invites || 0;
    return this.invites({ kind })
      .filter((i) => i.status === "pending" && i.proposer !== mine)
      .length +
      this.invites({ kind }).filter(
        (i) => i.status !== "pending" && (i.decided_at || i.updated_at) > seen && i.proposer === mine
      ).length;
  },

  /** 全部已发生的历史（做饭已做 + 成行邀约） */
  history() {
    const items = [];
    for (const p of this.plans()) {
      if (p.status === "done") {
        items.push({
          type: "cook",
          date: p.date,
          at: p.updated_at || p.created_at,
          title: p.dish_snapshot?.title || "一道菜",
          emoji: p.dish_snapshot?.emoji || "🍳",
          meal: p.meal,
          planId: p.id,
          amount: Number(p.amount) || 0,
          thought: p.thought || "",
        });
      }
    }
    for (const i of this.invites()) {
      if (i.status === "agreed") {
        items.push({
          type: i.kind,
          date: String(i.scheduled_at || "").slice(0, 10) || String(i.created_at),
          at: i.decided_at || i.updated_at || i.created_at,
          title: i.restaurant_snapshot?.name || "一顿饭",
          emoji: i.kind === "takeout" ? "🛵" : "🍽️",
          amount: Number(i.amount) || 0,
          payer: i.payer || "none",
          inviteId: i.id,
          people: 2,
        });
      }
    }
    return items.sort((a, b) => (a.date === b.date ? (b.at || 0) - (a.at || 0) : a.date < b.date ? 1 : -1));
  },
};
