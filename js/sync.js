/* ============================================================
   饭来 · 同步引擎（直连 Supabase PostgREST，零依赖）
   ------------------------------------------------------------
   - 本地优先：所有写操作先落本地，脏标队列异步推送
   - 增量拉取：按 updated_at 游标，LWW 合并
   - 失败不阻塞：指数退避 + 页面可见时轮询
   ============================================================ */
import { store, TABLES } from "./store.js";

const PULL_INTERVAL = 8000;
const PUSH_DEBOUNCE = 1200;
const MAX_BACKOFF = 60000;

const listeners = new Set();
let status = { mode: "local", phase: "idle", pending: 0, lastError: "", lastSyncAt: 0 };

let running = false;
let queued = false;
let timer = null;
let pushTimer = null;
let backoff = 2000;
let nextAttemptAt = 0;

/* ---------- 对外状态 ---------- */
function emit(patch) {
  const next = { ...status, ...patch, pending: store.dirtyCount() };
  const changed = Object.keys(patch).some((k) => status[k] !== next[k]) || status.pending !== next.pending;
  status = next;
  if (changed) for (const fn of listeners) fn(status);
}

export const sync = {
  get status() {
    return status;
  },

  onStatus(fn) {
    listeners.add(fn);
    fn(status);
    return () => listeners.delete(fn);
  },

  /** 容错：用户可能粘成 https://xxx.supabase.co/rest/v1/ */
  normalizeUrl(u) {
    return String(u || "")
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1$/i, "")
      .replace(/\/+$/, "");
  },

  config() {
    const s = store.state;
    return {
      url: this.normalizeUrl(s.sync.url),
      key: String(s.sync.key || "").trim(),
      room: s.room?.code || "",
    };
  },

  enabled() {
    const c = this.config();
    return !!(c.url && c.key && c.room);
  },

  /** 本地有变更时调用（防抖推送） */
  schedule() {
    if (!this.enabled()) {
      emit({ mode: "local", phase: "idle" });
      return;
    }
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => this.run(), PUSH_DEBOUNCE);
  },

  /** 手动/定时同步：先推后拉 */
  async run({ force = false } = {}) {
    const c = this.config();
    if (!c.url || !c.key || !c.room) {
      emit({ mode: "local", phase: "idle", lastError: "" });
      return { ok: false, reason: "unconfigured" };
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      emit({ mode: "cloud", phase: "offline" });
      return { ok: false, reason: "offline" };
    }
    const now = Date.now();
    if (!force && now < nextAttemptAt) return { ok: false, reason: "backoff" };
    if (running) {
      queued = true;
      return { ok: false, reason: "busy" };
    }

    running = true;
    emit({ mode: "cloud", phase: "syncing", lastError: "" });
    try {
      await push();
      await pull();
      backoff = 2000;
      nextAttemptAt = 0;
      const ts = Date.now();
      store.state.sync.lastSyncAt = ts;
      store.saveNow();
      emit({ phase: "idle", lastSyncAt: ts, lastError: "" });
      return { ok: true };
    } catch (err) {
      const msg = err?.message || String(err);
      nextAttemptAt = Date.now() + backoff;
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      store.state.sync.lastError = msg;
      store.saveNow();
      emit({ phase: "error", lastError: msg });
      return { ok: false, reason: msg };
    } finally {
      running = false;
      // 只有"还有脏数据"或"期间被请求过"时才补跑一次；
      // 否则会在慢网络上变成永久"同步中"（每轮耗时 > 轮询间隔 → 永远在跑）
      if (queued || store.dirtyCount() > 0) {
        queued = false;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(() => this.run(), 700);
      }
    }
  },

  /** 设置页"测试连接" */
  async test() {
    const c = this.config();
    if (!c.url || !c.key) return { ok: false, error: "请先填写 Project URL 和 anon key" };
    if (!/^https?:\/\//i.test(c.url)) return { ok: false, error: "Project URL 需要以 https:// 开头" };
    try {
      const url = `${c.url}/rest/v1/rooms?select=code&limit=1`;
      const res = await sbFetch(url, c.key);
      if (res.status === 401 || res.status === 403)
        return { ok: false, error: "key 不对或无权限（401/403）。别用 Secret / service_role，要用 Publishable / anon。" };
      if (res.status === 404) return { ok: false, error: "找不到 rooms 表，请先执行 schema.sql 建表" };
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `${res.status} ${t.slice(0, 120)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `连不上：${err?.message || err}` };
    }
  },

  start() {
    if (timer) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      this.run();
    };
    timer = setInterval(tick, PULL_INTERVAL);
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        emit({ phase: "syncing" });
        this.run({ force: true });
      });
      window.addEventListener("offline", () => emit({ phase: "offline" }));
      window.addEventListener("fanlai:dirty", () => this.schedule());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") this.run({ force: true });
      });
    }
    this.run({ force: true });
  },

  stop() {
    clearInterval(timer);
    timer = null;
    clearTimeout(pushTimer);
  },
};

/* ============================================================
   内部实现
   ============================================================ */
const LOCAL_ONLY_FIELDS = new Set(["_dirty"]);

function stripLocal(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (LOCAL_ONLY_FIELDS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/* ============================================================
   统一请求入口
   ------------------------------------------------------------
   Supabase 有两代 key：
   - 老版 anon public：JWT（以 eyJ 开头）—— 需要 apikey + Authorization 两个头
   - 新版 publishable：sb_publishable_... —— 只需 apikey 头，带 Bearer 反而可能被拒
   这里按 key 形态自动选择，并在 401/403 时自动换一种再试一次。
   ============================================================ */
export async function sbFetch(url, key, { method = "GET", body, prefer, headers = {}, timeout = 15000 } = {}) {
  const legacy = /^eyJ/.test(key);
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;

  const build = (withBearer) => {
    const h = { ...headers, apikey: key };
    if (withBearer) h.Authorization = `Bearer ${key}`;
    if (prefer) h.Prefer = prefer;
    return {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
    };
  };

  try {
    let res = await fetch(url, build(legacy));
    if (!legacy && (res.status === 401 || res.status === 403)) {
      try {
        await res.text();
      } catch (_) {
        /* 释放连接 */
      }
      res = await fetch(url, build(true));
    }
    return res;
  } catch (err) {
    if (err && (err.name === "AbortError" || /aborted/i.test(err.message || ""))) {
      throw new Error(`请求超时（${Math.round(timeout / 1000)} 秒没响应）：${url.replace(/^https?:\/\//, "").split("?")[0]}`);
    }
    throw new Error(`网络请求失败：${err?.message || err}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function rest(table, { query = "", method = "GET", body, prefer } = {}) {
  const c = sync.config();
  const res = await sbFetch(`${c.url}/rest/v1/${table}${query}`, c.key, {
    method,
    body,
    prefer,
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch (_) {
      /* ignore */
    }
    throw new Error(`${table} ${res.status} ${detail.slice(0, 160)}`);
  }
  if (method !== "GET") return null;
  return res.json();
}

async function push() {
  const entries = store.dirtyEntries();
  if (!entries.length) return;

  const byTable = new Map();
  for (const e of entries) {
    if (!byTable.has(e.table)) byTable.set(e.table, []);
    byTable.get(e.table).push(e.id);
  }

  for (const [table, ids] of byTable) {
    const rows = ids.map((id) => store.get(table, id)).filter((r) => r && !isGhost(r));
    if (!rows.length) {
      store.markClean(ids.map((id) => ({ table, id })));
      continue;
    }
    await rest(table, {
      query: "?on_conflict=id",
      method: "POST",
      body: rows.map(stripLocal),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    store.markClean(ids.map((id) => ({ table, id })));
  }
}

async function pull() {
  const c = sync.config();

  // 8 个表并行拉取（之前是串行，手机上跑满一轮会超过轮询间隔，看起来永远在"同步中"）
  const tasks = TABLES.map(async (table) => {
    if (table === "rooms") {
      const rows = await rest("rooms", { query: `?select=*&code=eq.${encodeURIComponent(c.room)}` });
      if (Array.isArray(rows) && rows.length) store.applyRemote("rooms", rows);
      return;
    }
    const cursor = Number(store.state.sync.cursor[table] || 0);
    const q =
      `?select=*&room_code=eq.${encodeURIComponent(c.room)}&order=updated_at.asc` +
      (cursor > 0 ? `&updated_at=gt.${cursor}` : "");
    const rows = await rest(table, { query: q });
    if (Array.isArray(rows) && rows.length) {
      store.applyRemote(table, rows);
      const max = rows.reduce((m, r) => Math.max(m, Number(r.updated_at) || 0), 0);
      store.state.sync.cursor[table] = Math.max(0, max - 1000);
    }
  });

  await store.batch(() => Promise.all(tasks));
  store.saveNow();
}

/** 房间码还没确定的空行不推 */
function isGhost(row) {
  return !row.room_code && row.id !== undefined && !row.code;
}
