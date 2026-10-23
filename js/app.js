/* ============================================================
   饭来 · 应用入口：外壳 / 路由 / 事件委托 / 启动
   ============================================================ */
import { store, select } from "./store.js";
import { sync } from "./sync.js";
import { esc, attr, todayISO, fmtMD, isoWeekday, relativeDay } from "./lib/util.js";
import { closeSheet, toast, showBanner } from "./ui/kit.js";
import { linkSheet } from "./ui/link.js";
import { systemNotify, vibrate } from "./lib/notify.js";
import * as geo from "./lib/geo.js";

import * as onboard from "./views/onboard.js";
import * as cook from "./views/cook.js";
import * as dish from "./views/dish.js";
import * as menu from "./views/menu.js";
import * as shop from "./views/shop.js";
import * as steps from "./views/steps.js";
import * as outing from "./views/outing.js";
import * as historyView from "./views/history.js";
import * as me from "./views/me.js";

const appEl = document.getElementById("app");

/* ============================================================
   路由表
   ============================================================ */
function dineView(name) {
  return (ctx) => outing[name]({ ...ctx, kind: "dine" });
}
function takeView(name) {
  return (ctx) => outing[name]({ ...ctx, kind: "takeout" });
}

const ROUTES = [
  ["/onboard", onboard.render],

  ["/cook", cook.home],
  ["/cook/pick", cook.pick],
  ["/cook/request/:id", cook.requestDetail],
  ["/cook/menu", menu.render],
  ["/cook/shopping", shop.render],
  ["/cook/step/:planId", steps.render],
  ["/cook/random", cook.random],

  ["/dish", dish.list],
  ["/dish/new", dish.edit],
  ["/dish/edit/:id", dish.edit],
  ["/dish/:id", dish.detail],
  ["/import", dish.importPage],

  ["/dine", dineView("home")],
  ["/dine/new", dineView("edit")],
  ["/dine/edit/:id", dineView("edit")],
  ["/dine/invite/:rid", dineView("invite")],
  ["/dine/random", dineView("random")],
  ["/dine/:id", dineView("detail")],

  ["/takeout", takeView("home")],
  ["/takeout/new", takeView("edit")],
  ["/takeout/edit/:id", takeView("edit")],
  ["/takeout/invite/:rid", takeView("invite")],
  ["/takeout/random", takeView("random")],
  ["/takeout/:id", takeView("detail")],

  ["/history", historyView.render],
  ["/me", me.home],
  ["/me/profile", me.profile],
  ["/me/sync", me.syncPage],
  ["/me/geo", me.geoPage],
  ["/me/notify", me.notifyPage],
  ["/me/backup", me.backup],
  ["/me/about", me.about],
];

const TABS = [
  { key: "cook", label: "做饭", emoji: "🍳", hash: "#/cook" },
  { key: "dine", label: "外食", emoji: "🍽️", hash: "#/dine" },
  { key: "takeout", label: "外卖", emoji: "🛵", hash: "#/takeout" },
  { key: "me", label: "我的", emoji: "🙋", hash: "#/me" },
];

/* ============================================================
   状态
   ============================================================ */
let currentActions = {};
let currentView = null;
let currentRoute = null;
const scrollMemo = new Map();

/* ============================================================
   路由解析
   ============================================================ */
function parseHash(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  const [pathRaw, qs] = raw.split("?");
  let path = pathRaw || "/cook";
  if (!path.startsWith("/")) path = "/" + path;
  const query = {};
  new URLSearchParams(qs || "").forEach((v, k) => (query[k] = v));
  return { path, query };
}

function matchRoute(path) {
  for (const [pattern, handler] of ROUTES) {
    const keys = [];
    const re = new RegExp(
      "^" +
        pattern.replace(/:[A-Za-z0-9_]+/g, (m) => {
          keys.push(m.slice(1));
          return "([^/]+)";
        }) +
        "$"
    );
    const m = path.match(re);
    if (m) {
      const params = {};
      keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler, params };
    }
  }
  return null;
}

function needsSetup() {
  return !store.state.profile || !store.state.room;
}

/* ============================================================
   渲染
   ============================================================ */
export function go(hash, { replace = false } = {}) {
  if (replace) {
    location.replace(hash.startsWith("#") ? hash : "#" + hash);
  } else {
    location.hash = hash.startsWith("#") ? hash.slice(1) : hash;
  }
}

function renderShell(view, path) {
  const tab = view.tab || tabOfPath(path);
  const badges = {
    cook: safeBadge(() => select.badgeRequests()),
    dine: safeBadge(() => select.badgeInvites("dine")),
    takeout: safeBadge(() => select.badgeInvites("takeout")),
  };

  const backBtn = view.back
    ? `<button class="iconbtn" data-act="nav" data-to="${attr(view.back)}" aria-label="返回">‹</button>`
    : "";
  const topActions = (view.top || [])
    .map((a) => {
      const actAttr = a.localAct
        ? `data-act="${attr(a.localAct)}"`
        : `data-act="nav" data-to="${attr(a.to || "")}"`;
      return `<button class="iconbtn solid" ${actAttr} aria-label="${attr(a.label || "")}">${a.emoji || "＋"}</button>`;
    })
    .join("");

  const tabbar = view.hideTab
    ? ""
    : `<nav class="tabbar" role="tablist">
        ${TABS.map(
          (t) => `
          <a class="tab ${t.key === tab ? "on" : ""}" href="${t.hash}" role="tab" aria-label="${t.label}">
            <span class="tab-ico">${t.emoji}</span>
            <span>${t.label}</span>
            ${badges[t.key] ? `<span class="tab-dot">${badges[t.key]}</span>` : ""}
          </a>`
        ).join("")}
      </nav>`;

  appEl.innerHTML = `
    ${
      view.hideTop
        ? ""
        : `<header class="topbar" id="topbar">
            ${backBtn}
            <div class="topbar-title">${esc(view.title || "饭来")}${
            view.sub ? `<span class="sub">${esc(view.sub)}</span>` : ""
          }</div>
            <div class="topbar-actions">
              <span id="syncdot" class="syncbar" style="padding:0"><span class="dot"></span></span>
              ${topActions}
            </div>
          </header>`
    }
    <main class="view ${view.hideTab ? "no-tabbar" : ""}" id="view">${view.html}</main>
    ${tabbar}`;
}

function tabOfPath(path) {
  if (path.startsWith("/cook") || path.startsWith("/dish") || path.startsWith("/import")) return "cook";
  if (path.startsWith("/dine")) return "dine";
  if (path.startsWith("/takeout")) return "takeout";
  if (path.startsWith("/history")) return "me";
  return "me";
}

function safeBadge(fn) {
  try {
    return fn() || 0;
  } catch (_) {
    return 0;
  }
}

export function refresh({ keepScroll = true } = {}) {
  const y = keepScroll ? window.scrollY : 0;
  render();
  if (keepScroll) window.scrollTo(0, y);
}

function render() {
  const { path, query } = parseHash(location.hash);

  if (needsSetup() && path !== "/onboard") {
    location.replace("#/onboard");
    return;
  }
  if (!needsSetup() && path === "/onboard" && !onboard.isActive()) {
    location.replace("#/cook");
    return;
  }
  if (path === "/" || path === "") {
    location.replace("#/cook");
    return;
  }

  const matched = matchRoute(path);
  if (!matched) {
    renderShell(
      {
        title: "走丢了",
        html: `<div class="empty"><div class="e-ico">🧭</div><div class="e-title">这条路不通</div>
               <div class="e-hint">页面不存在，回首页看看吧。</div>
               <a class="btn btn-primary" href="#/cook">回做饭区</a></div>`,
        tab: "cook",
      },
      path
    );
    return;
  }

  let view;
  try {
    view = matched.handler({ params: matched.params, query, path });
  } catch (err) {
    console.error("[饭来] 视图渲染异常", err);
    view = {
      title: "出错了",
      html: `<div class="empty"><div class="e-ico">😵</div><div class="e-title">页面渲染失败</div>
             <div class="e-hint">${esc(err?.message || String(err))}</div>
             <a class="btn btn-primary" href="#/cook">回做饭区</a></div>`,
      tab: "cook",
    };
  }
  if (!view) return;

  currentActions = view.actions || {};
  currentView = view;
  currentRoute = path;

  // 进入某个 Tab 根页面 = 已读，清掉红点（静默写入，避免触发重渲染循环）
  markRouteSeen(path);

  const prevY = scrollMemo.get(path) || 0;
  renderShell(view, path);
  paintSyncDot();
  bindViewEvents();

  if (view.afterRender) {
    try {
      view.afterRender(document.getElementById("view"), view);
    } catch (err) {
      console.error("[饭来] afterRender 异常", err);
    }
  }
  window.scrollTo(0, view.resetScroll ? 0 : prevY);
}

let scrollHandlerBound = false;
const onWindowScroll = () => {
  const bar = document.getElementById("topbar");
  if (bar) bar.classList.toggle("scrolled", window.scrollY > 4);
};

/** 进入 Tab 根页面就把对应红点标记为已读 */
function markRouteSeen(path) {
  try {
    if (path === "/cook") store.markSeen("requests", Date.now(), { silent: true });
    if (path === "/dine" || path === "/takeout") store.markSeen("invites", Date.now(), { silent: true });
  } catch (_) {
    /* 忽略 */
  }
}

function bindViewEvents() {
  const viewEl = document.getElementById("view");
  if (!viewEl) return;
  if (!scrollHandlerBound) {
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    scrollHandlerBound = true;
  }
  onWindowScroll();
}

/* ---------- 同步状态小圆点 ---------- */
function paintSyncDot() {
  const el = document.getElementById("syncdot");
  if (!el) return;
  const s = sync.status;
  el.className = `syncbar ${s.mode === "local" ? "offline" : s.phase}`;
  el.title =
    s.mode === "local"
      ? "仅本机模式"
      : s.phase === "error"
      ? `同步失败：${s.lastError}`
      : s.phase === "syncing"
      ? "同步中"
      : "已同步";
  if (s.pending > 0) el.title += ` · ${s.pending} 项待上传`;
}

/* ============================================================
   全局事件委托
   ============================================================ */
document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;

  if (act === "sheet-close") {
    closeSheet();
    return;
  }
  if (act === "nav") {
    ev.preventDefault();
    go(el.dataset.to || "#/cook");
    return;
  }
  if (act === "back") {
    ev.preventDefault();
    if (history.length > 1) history.back();
    else go("#/cook");
    return;
  }
  // 链接跳转：唯一入口，任何页面都能用
  if (act === "open-link") {
    ev.preventDefault();
    ev.stopPropagation();
    linkSheet({ url: el.dataset.url, name: el.dataset.name, platform: el.dataset.platform });
    return;
  }

  const fn = currentActions[act];
  if (fn) {
    ev.preventDefault();
    try {
      fn(el, ev);
    } catch (err) {
      console.error(`[饭来] 动作 ${act} 异常`, err);
      toast("操作出错了：" + (err?.message || err), "err");
    }
  }
});

document.addEventListener("submit", (ev) => {
  const form = ev.target.closest("[data-form]");
  if (!form) return;
  ev.preventDefault();
  const fn = currentActions[form.dataset.form];
  if (fn) {
    try {
      fn(form, ev);
    } catch (err) {
      console.error(`[饭来] 表单 ${form.dataset.form} 异常`, err);
      toast("保存失败：" + (err?.message || err), "err");
    }
  }
});

document.addEventListener("change", (ev) => {
  const el = ev.target.closest("[data-change]");
  if (!el) return;
  const fn = currentActions[el.dataset.change];
  if (fn) fn(el, ev);
});

/* ============================================================
   启动
   ============================================================ */
const BOOT_AT = typeof performance !== "undefined" ? performance.now() : 0;

/** 开启界面至少停留一会儿，避免一闪而过，然后淡出
 *  优先用 index.html 内联的收尾函数：那样即使本文件是旧缓存，启动页也能正常收掉。 */
function dismissSplash() {
  if (typeof window.__fanlaiHideSplash === "function") {
    window.__fanlaiHideSplash();
    return;
  }
  const el = document.getElementById("splash");
  if (!el) return;
  const MIN_MS = 900;
  const elapsed = BOOT_AT ? performance.now() - BOOT_AT : MIN_MS;
  const wait = Math.max(0, MIN_MS - elapsed);
  setTimeout(() => {
    el.classList.add("hide");
    setTimeout(() => el.remove(), 520);
  }, wait);
}

/* ============================================================
   提醒：站内横幅（ui/kit）+ 系统通知
   ============================================================ */
/** 把一条事件变成横幅 + 系统通知 */
function fireReminder(ev) {
  showBanner(ev.banner);
  const pushed = systemNotify({
    title: ev.notify.title,
    body: ev.notify.body,
    tag: ev.tag,
    href: ev.banner.href,
  }).catch(() => false);
  vibrate();
  return pushed;
}

/**
 * 监听"对方"带来的变化：
 * 用自己的 deviceId 过滤掉本机操作，只提醒别人做的事。
 */
function startReminders() {
  const myDev = () => store.state.profile?.deviceId || "";
  const keyOf = (t, r) => `${t}:${r.id}`;

  function snapshot() {
    const map = new Map();
    (store.state.data.invites || []).forEach((i) => {
      map.set(keyOf("inv", i), {
        status: i.status,
        by: i.updated_by || "",
        kind: i.kind,
        name: (i.restaurant_snapshot && i.restaurant_snapshot.name) || "那家店",
      });
    });
    (store.state.data.requests || []).forEach((r) => {
      map.set(keyOf("req", r), {
        status: r.status,
        by: r.updated_by || "",
        title: (r.dish_snapshot && r.dish_snapshot.title) || "一道菜",
      });
    });
    return map;
  }

  let prev = snapshot();

  store.subscribe(() => {
    const cur = snapshot();
    const me = myDev();
    const events = [];

    cur.forEach((v, k) => {
      const old = prev.get(k);
      if (old && old.status === v.status) return; // 没变化
      if (v.by && v.by === me) return; // 我自己操作的，不提醒

      if (k.startsWith("inv:")) {
        const where = v.kind === "dine" ? "外食" : "外卖";
        if (!old && v.status === "pending") {
          events.push({
            tag: "invite-new",
            banner: { emoji: "🥂", title: "收到一个邀约", body: `${v.name} · ${where}，等你点头`, href: `#/${v.kind}` },
            notify: { title: "饭来 · 收到邀约", body: `${v.name} · ${where}` },
          });
        } else if (old && v.status === "agreed") {
          events.push({
            tag: "invite-agreed",
            banner: { emoji: "✅", title: "邀约成了", body: `${v.name}，可以出发了`, href: `#/${v.kind}` },
            notify: { title: "饭来 · 邀约成了", body: v.name },
          });
        } else if (old && v.status === "declined") {
          events.push({
            tag: "invite-declined",
            banner: { emoji: "😕", title: "邀约被拒了", body: `${v.name}，换个地方？`, href: `#/${v.kind}` },
            notify: { title: "饭来 · 邀约被拒", body: v.name },
          });
        }
      } else {
        if (!old && v.status === "pending") {
          events.push({
            tag: "request-new",
            banner: { emoji: "🍳", title: "有人点菜了", body: `想吃「${v.title}」，等你接单`, href: "#/cook" },
            notify: { title: "饭来 · 有人点菜", body: `想吃「${v.title}」` },
          });
        } else if (old && ["accepted", "swapped", "postponed", "rejected"].includes(v.status)) {
          const word =
            v.status === "accepted" ? "接单了" : v.status === "rejected" ? "拒绝了" : v.status === "swapped" ? "换了菜" : "推后了";
          events.push({
            tag: "request-decided",
            banner: { emoji: "📣", title: `你的点菜有结果：${word}`, body: `「${v.title}」`, href: "#/cook" },
            notify: { title: "饭来 · 点菜有结果", body: `${v.title} · ${word}` },
          });
        }
      }
    });

    prev = cur;
    if (!events.length) return;

    // 一次来一堆就合并成一条，别连环弹
    const first = events[0];
    if (events.length > 1) {
      first.banner.body += `（还有 ${events.length - 1} 条）`;
      first.notify.body += `（还有 ${events.length - 1} 条）`;
    }
    fireReminder(first);
  });
}

function boot() {
  if (!store.state.local.onboardSeen && !store.state.profile) {
    if (!location.hash || location.hash === "#/" || location.hash === "#") {
      location.replace("#/onboard");
    }
  }

  render();

  window.addEventListener("hashchange", () => {
    if (currentRoute) scrollMemo.set(currentRoute, window.scrollY);
    render();
  });

  sync.onStatus(() => paintSyncDot());
  sync.start();

  let lastStateJson = "";
  store.subscribe(() => {
    const active = document.activeElement;
    const typing =
      active &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
    if (typing) return; // 输入中不打断
    try {
      const sig = JSON.stringify(store.state.data) + store.state.dirty.length;
      if (sig === lastStateJson) return;
      lastStateJson = sig;
    } catch (_) {
      /* ignore */
    }
    refresh();
  });

  window.addEventListener("fanlai:rerender", () => refresh());

  window.addEventListener("fanlai:storage-error", () => {
    toast("本机存储快满了，建议先导出备份", "err");
  });

  // 安卓 Chrome 的「安装到桌面」能力：捕获后由「我的」页面调用
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__fanlaiInstallPrompt = e;
    window.dispatchEvent(new Event("fanlai:installable"));
  });
  window.addEventListener("appinstalled", () => {
    window.__fanlaiInstallPrompt = null;
    toast("装好了，下次从桌面图标进", "ok");
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        // updateViaCache: "none" —— 关键：让 sw.js 每次都绕过 HTTP 缓存去拿网络版，
        // 否则 GitHub Pages 的 10 分钟缓存会让新版本永远装不上
        const reg = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });

        // 有新版本装好了 → 自动刷新一次（用会话标记防死循环）
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state !== "installed") return;
            if (!navigator.serviceWorker.controller) return; // 首次安装不刷新
            const tried = Number(sessionStorage.getItem("fanlai.reloads") || "0");
            if (tried >= 2) return;
            sessionStorage.setItem("fanlai.reloads", String(tried + 1));
            toast("发现新版本，正在更新…", "ok");
            setTimeout(() => window.location.reload(), 700);
          });
        });

        // 回到前台时检查一次更新
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
        // 每小时也检查一次
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      } catch (err) {
        console.warn("[饭来] Service Worker 注册失败", err);
      }
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      document.body.style.overflow = "";
    }
  });

  // 对方的新邀约 / 点菜 → 横幅 + 通知
  startReminders();

  // 地址解析完成后刷新一次（距离从无到有）
  let geoRenderTimer = null;
  geo.subscribe(() => {
    clearTimeout(geoRenderTimer);
    geoRenderTimer = setTimeout(() => {
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; // 正在输入不打断
      render();
    }, 320);
  });

  // 首屏渲染完成 → 淡出开启界面
  dismissSplash();
}

/* 供视图模块使用的便捷导出 */
export const app = { go, refresh, toast, state: () => store.state };

boot();

/* 便于调试 */
window.__fanlai = { store, select, sync, refresh, go };
