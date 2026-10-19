/* ============================================================
   饭来 · 基础工具（id / 日期 / 文本 / 数字）
   ============================================================ */

/* ---------- id ---------- */
export function uid(prefix = "") {
  let core;
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    core = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } else {
    core = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  return prefix ? `${prefix}_${core}` : core;
}

/** 6 位数字房间码，避免以 0 开头便于口头传达 */
export function roomCode() {
  const n = 100000 + Math.floor(Math.random() * 900000);
  return String(n);
}

export function nowMs() {
  return Date.now();
}

/* ---------- 文本 ---------- */
export function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function attr(v) {
  return esc(v).replace(/`/g, "&#96;");
}

export function nl2br(s) {
  return esc(s).replace(/\n/g, "<br>");
}

export function truncate(s, n = 40) {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function money(n) {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return "0";
  return (Math.round(v * 100) / 100).toString();
}

/** 圆整后的金额展示：268 → 268，268.5 → 268.5 */
export function moneyLabel(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function plural(n, unit = "次") {
  return `${n}${unit}`;
}

/* ---------- 日期（一律使用本地日期字符串 YYYY-MM-DD） ---------- */
const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function isoOf(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return isoOf(new Date());
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/** 周一为一周起点 */
export function weekStart(iso = todayISO()) {
  const d = parseISO(iso);
  const day = d.getDay(); // 0=周日
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoOf(d);
}

export function weekDays(iso = todayISO()) {
  const s = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function isoWeekday(iso) {
  return WEEK_CN[parseISO(iso).getDay()];
}

export function fmtMD(iso) {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtMDShort(iso) {
  const d = parseISO(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function relativeDay(iso) {
  const t = todayISO();
  if (iso === t) return "今天";
  if (iso === addDays(t, 1)) return "明天";
  if (iso === addDays(t, -1)) return "昨天";
  if (iso === addDays(t, 2)) return "后天";
  if (iso === addDays(t, -2)) return "前天";
  return fmtMD(iso);
}

export function isPast(iso) {
  return String(iso) < todayISO();
}

export function monthKey(iso) {
  return String(iso).slice(0, 7);
}

/** 从 "YYYY-MM-DDTHH:mm" 取时间部分 */
export function fmtHM(datetime) {
  const m = String(datetime || "").match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "";
}

export function fmtDateTime(datetime) {
  const s = String(datetime || "");
  const [d, t] = s.split("T");
  if (!d) return "";
  const hm = (t || "").slice(0, 5);
  return `${relativeDay(d)} ${hm}`.trim();
}

export function fallbackHour(dateStr, hour = 19) {
  return `${dateStr}T${String(hour).padStart(2, "0")}:00`;
}

/** 依据当前时间猜餐次 */
export function guessMeal(now = new Date()) {
  const h = now.getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  return "dinner";
}

export function fmtAgo(ms) {
  if (!ms) return "从未";
  const diff = Date.now() - ms;
  if (diff < 60e3) return "刚刚";
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  return `${Math.floor(diff / 86400e3)} 天前`;
}

/* ---------- 结构 ---------- */
export function clone(o) {
  return typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o));
}

export function debounce(fn, wait = 300) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

export function sum(list, fn) {
  return list.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

export function uniq(list) {
  return Array.from(new Set(list));
}

export function sortBy(list, fn, dir = 1) {
  return [...list].sort((a, b) => {
    const x = fn(a);
    const y = fn(b);
    if (x === y) return 0;
    return (x > y ? 1 : -1) * dir;
  });
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/* ---------- 剪贴板 ---------- */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    /* 继续走兜底 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

/** 分享或降级复制 */
export async function shareText(title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "abort";
    }
  }
  const ok = await copyText(text);
  return ok ? "copied" : "failed";
}
