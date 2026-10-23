/* ============================================================
   饭来 · 我的：资料 / 同步设置 / 备份 / 关于
   ============================================================ */
import { store, select } from "../store.js";
import { sync } from "../sync.js";
import { esc, attr, todayISO, copyText, shareText, fmtAgo, fmtMD, isoWeekday, relativeDay } from "../lib/util.js";
import { ROLES, MEALS } from "../lib/catalog.js";
import {
  toast,
  notice,
  confirmAction,
  askText,
  emptyState,
  rerender,
  showBanner,
} from "../ui/kit.js";
import { downloadBlob } from "../lib/exportImage.js";
import { statsFor } from "../lib/model.js";
import {
  getConfig as getGeoConfig,
  setConfig as setGeoConfig,
  getHome,
  setHome,
  clearHome,
  isConfigured,
  geocode,
  reverseGeocode,
  loadAmap,
  wgs84ToGcj02,
  geoCheck,
  forgetAddress,
  clearGeoCache,
  distanceText,
} from "../lib/geo.js";
import { permissionLabel, ask as askNotify, systemNotify, vibrate } from "../lib/notify.js";
import { pushSupported, markedOn, enablePush, disablePush } from "../lib/push.js";

const APP_VERSION = "1.5.2";

/* ---------- 地址 / 提醒 的状态摘要（"我的"首页用） ---------- */
function geoSummary() {
  const home = getHome();
  const keyed = isConfigured();
  if (keyed && home && home.lng != null) return `家：${home.address} · 可算距离`;
  if (keyed && home) return `家：${home.address} · 坐标还没算出来，点进去重存一次`;
  if (keyed) return "还没设家庭住址，设完外食/外卖会显示离家距离";
  if (home) return "设了家地址，但还没填高德 Key（算不出距离）";
  return "设家庭住址后，外食/外卖会显示离家距离";
}

function notifySummary() {
  const l = permissionLabel();
  if (l.text.startsWith("已开启")) return "已开启，收到邀约会提示你";
  return l.text;
}

/* ============================================================
   我的（首页）
   ============================================================ */
/* ============================================================
   安装到桌面：按环境给出最靠谱的那一条路
   ============================================================ */
function envInfo() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMIUI = /MIUI|HyperOS|Redmi|Xiaomi|POCO/i.test(ua);
  const inWeChat = /MicroMessenger/i.test(ua);
  const inQQ = /QQ\/|QQBrowser/i.test(ua);
  const inWeibo = /Weibo/i.test(ua);
  let standalone = false;
  try {
    standalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      navigator.standalone === true;
  } catch (_) {
    standalone = false;
  }
  const installable = !!window.__fanlaiInstallPrompt;
  return {
    isIOS,
    isAndroid,
    isMIUI,
    inWeChat,
    inQQ,
    inWeibo,
    standalone,
    installable,
    inApp: inWeChat || inQQ || inWeibo,
  };
}

function installCard() {
  const e = envInfo();

  if (e.standalone) {
    return `<div class="card flat mt-16">
      <div class="small muted">✅ 现在就是从桌面图标打开的，已经装好了。</div>
    </div>`;
  }

  if (e.inApp) {
    const which = e.inWeChat ? "微信" : e.inQQ ? "QQ" : "微博";
    return `<div class="card mt-16">
      <div class="card-title">📲 装到桌面</div>
      ${notice(
        `你现在在 <b>${which}内置浏览器</b>里，它不支持安装。<br>点右上角 <b>···</b> → <b>在浏览器中打开</b>，再到浏览器里装。`,
        "warn"
      )}
    </div>`;
  }

  if (e.installable) {
    return `<div class="card mt-16">
      <div class="card-title">📲 装到桌面</div>
      <div class="small muted">装好之后从桌面点开，全屏无地址栏，还能离线用。</div>
      <button class="btn btn-primary btn-block mt-10" data-act="do-install">立即安装到桌面</button>
    </div>`;
  }

  if (e.isIOS) {
    return `<div class="card mt-16">
      <div class="card-title">📲 装到桌面（iPhone）</div>
      <ol class="small" style="line-height:1.9;padding-left:18px">
        <li>确认是用 <b>Safari</b> 打开的（不是微信、不是 Chrome）</li>
        <li>底部点 <b>分享</b> 图标</li>
        <li>选择 <b>添加到主屏幕</b></li>
      </ol>
      <div class="hint">iOS 不支持"自动安装"，只能手动加一次。</div>
    </div>`;
  }

  if (e.isAndroid) {
    return `<div class="card mt-16">
      <div class="card-title">📲 装到桌面（安卓）</div>
      <ol class="small" style="line-height:1.9;padding-left:18px">
        <li>用 <b>Chrome</b> 或系统自带浏览器打开（不要用微信）</li>
        <li>点右上角 <b>⋮</b> → 找 <b>安装应用</b></li>
        <li>没有这一项就点 <b>添加到主屏幕</b></li>
      </ol>
      ${
        e.isMIUI
          ? notice(
              `<b>红米 / MIUI 特有坑：</b>MIUI 从 Android 12 起默认禁止应用创建桌面快捷方式，
               所以「添加到主屏幕」会点了没反应。去放行一次：<br>
               <b>设置 → 应用设置 → 应用管理 → 找到你用的浏览器 → 权限管理 → 「桌面快捷方式」设为允许</b><br>
               放行后再试「添加到主屏幕」就成功了。`,
              "warn"
            )
          : notice(
              "如果完全没有「安装应用」：很多国行安卓没有 Google 服务，Chrome 生成不了真正的 PWA 图标 —— 这时用「添加到主屏幕」也能用，只是个普通快捷方式。",
              ""
            )
      }
      ${notice(
        "还不行就换 <b>Firefox</b> 或 <b>Edge</b>：它们的「添加到主屏幕」不依赖 Google 服务，成功率更高。",
        ""
      )}
      <button class="btn btn-soft btn-block mt-10" data-act="copy-address">复制网址（方便存书签）</button>
    </div>`;
  }

  return `<div class="card flat mt-16">
    <div class="small muted">把饭来装到桌面：iPhone 用 Safari → 分享 → 添加到主屏幕；安卓用 Chrome → ⋮ → 安装应用。</div>
  </div>`;
}

/* ============================================================
   我的（首页）
   ============================================================ */
export function home() {
  const p = store.state.profile || {};
  const role = ROLES[p.role] || ROLES.diner;
  const room = store.state.room?.code || "—";
  const items = select.history();
  const s = statsFor(items);
  const syncMode = sync.enabled() ? "云端同步中" : "仅本机";

  return {
    title: "我的",
    sub: p.nickname || "",
    tab: "me",
    html: `
      <div class="card sticker">
        <div class="flex" style="gap:12px">
          <div style="font-size:40px">${role.emoji}</div>
          <div class="grow">
            <div style="font-size:18px;font-weight:800">${esc(p.nickname || role.defaultNick)}</div>
            <div class="tiny muted">${role.label} · 房间 ${esc(room)} · ${esc(syncMode)}</div>
          </div>
          <a class="btn btn-sm btn-ghost" href="#/me/profile">改</a>
        </div>
        <div class="divider"></div>
        <div class="flex-between tiny muted">
          <span>一起吃了 ${s.cookCount + s.dineCount + s.takeCount} 顿</span>
          <span>外食外卖 ¥${s.spend || 0}</span>
        </div>
      </div>

      <div class="list">
        <a class="row" href="#/history">
          <div class="row-emoji">🗓️</div>
          <div class="row-main">
            <div class="row-title"><span class="t">吃过什么</span></div>
            <div class="row-sub"><span>时间轴、花费、谁欠谁</span></div>
          </div>
          <div class="row-aside"><span class="row-chev">›</span></div>
        </a>
        <a class="row" href="#/me/sync">
          <div class="row-emoji">☁️</div>
          <div class="row-main">
            <div class="row-title"><span class="t">同步设置</span></div>
            <div class="row-sub"><span>${sync.enabled() ? "已配置，点进去看状态" : "还没配置，两人无法共享"}</span></div>
          </div>
          <div class="row-aside"><span class="row-chev">›</span></div>
        </a>
        <a class="row" href="#/me/backup">
          <div class="row-emoji">💾</div>
          <div class="row-main">
            <div class="row-title"><span class="t">数据备份</span></div>
            <div class="row-sub"><span>导出 / 导入 JSON</span></div>
          </div>
          <div class="row-aside"><span class="row-chev">›</span></div>
        </a>
        <a class="row" href="#/me/geo">
          <div class="row-emoji">📍</div>
          <div class="row-main">
            <div class="row-title"><span class="t">地址与距离</span></div>
            <div class="row-sub"><span>${geoSummary()}</span></div>
          </div>
          <div class="row-aside"><span class="row-chev">›</span></div>
        </a>
        <a class="row" href="#/me/notify">
          <div class="row-emoji">🔔</div>
          <div class="row-main">
            <div class="row-title"><span class="t">消息提醒</span></div>
            <div class="row-sub"><span>${notifySummary()}</span></div>
          </div>
          <div class="row-aside"><span class="row-chev">›</span></div>
        </a>
        <a class="row" href="#/me/about">
          <div class="row-emoji">🍚</div>
          <div class="row-main">
            <div class="row-title"><span class="t">关于饭来</span></div>
            <div class="row-sub"><span>怎么用、隐私、版本 ${APP_VERSION}</span></div>
          </div>
          <div class="row-aside"><span class="row-chev">›</span></div>
        </a>
      </div>

      ${installCard()}

      <div class="center tiny muted mt-16">饭来 ${APP_VERSION} · 数据在你自己的 Supabase 里</div>
    `,
    actions: {
      async "do-install"() {
        const prompt = window.__fanlaiInstallPrompt;
        if (!prompt) {
          toast("这个浏览器不支持自动安装，看下面的手动步骤", "err");
          return;
        }
        try {
          prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice && choice.outcome === "accepted") toast("装好了", "ok");
          else toast("已取消");
          window.__fanlaiInstallPrompt = null;
          rerender();
        } catch (err) {
          toast("安装失败：" + (err?.message || err), "err");
        }
      },
      async "copy-address"() {
        const ok = await copyText(location.href.split("#")[0]);
        toast(ok ? "网址已复制，粘到浏览器书签里" : "复制失败", ok ? "ok" : "err");
      },
    },
  };
}

/* ============================================================
   资料 / 切换身份
   ============================================================ */
export function profile() {
  const p = store.state.profile || {};
  const room = store.state.room?.code || "";

  return {
    title: "我的资料",
    back: "#/me",
    tab: "me",
    html: `
      <form data-form="save-profile" novalidate>
        <div class="field">
          <label>昵称</label>
          <input class="input" name="nickname" maxlength="12" value="${attr(p.nickname || "")}" />
          <div class="hint">对方看到的称呼。</div>
        </div>
        <div class="field">
          <label>我的身份</label>
          <div class="role-pick">
            ${Object.values(ROLES)
              .map(
                (r) => `<div class="role-card ${p.role === r.key ? "on" : ""}">
                  <div class="rc-emoji">${r.emoji}</div>
                  <div class="rc-name">${r.label}</div>
                  <div class="rc-desc">${r.desc}</div>
                </div>`
              )
              .join("")}
          </div>
          <div class="hint">要换身份？点下面的按钮，切换后入口和视角会变。</div>
        </div>
        <button class="btn btn-primary btn-block" type="submit">保存昵称</button>
      </form>

      <button class="btn btn-block mt-10" data-act="switch-role">
        切换成 ${esc(ROLES[p.role === "chef" ? "diner" : "chef"].label)}
      </button>

      <div class="card mt-16">
        <div class="card-title">房间</div>
        <div class="flex-between">
          <div style="font-size:26px;font-weight:800;letter-spacing:6px">${esc(room)}</div>
          <button class="btn btn-sm btn-soft" data-act="copy-code">复制</button>
        </div>
        <div class="hint mt-6">TA 在「加入房间」里输入这 6 位数字就能进来。</div>
      </div>

      <button class="btn btn-danger btn-block mt-16" data-act="leave-room">离开这个房间</button>
    `,
    actions: {
      "save-profile"(form) {
        const nickname = String(new FormData(form).get("nickname") || "").trim();
        if (!nickname) {
          toast("昵称不能空");
          return;
        }
        store.setProfile({ nickname });
        const id = `${store.state.room?.code}_${store.state.profile.deviceId}`;
        if (store.get("members", id)) store.update("members", id, { nickname });
        toast("改好了", "ok");
        location.hash = "#/me";
      },
      async "switch-role"() {
        const next = p.role === "chef" ? "diner" : "chef";
        const ok = await confirmAction({
          title: `切换成${ROLES[next].label}？`,
          desc: "身份切换后首页的入口和文案会跟着变，数据不会丢。",
          ok: "切换",
        });
        if (!ok) return;
        store.setProfile({ role: next });
        const id = `${store.state.room?.code}_${store.state.profile.deviceId}`;
        if (store.get("members", id)) store.update("members", id, { role: next });
        toast(`现在是${ROLES[next].label}了`, "ok");
        rerender();
      },
      async "copy-code"() {
        const ok = await copyText(room);
        toast(ok ? "已复制" : "复制失败", ok ? "ok" : "err");
      },
      async "leave-room"() {
        const ok = await confirmAction({
          title: "离开房间？",
          desc: "本机数据会清空，云端数据保留。回来需要重新输入房间码。",
          ok: "离开",
          danger: true,
        });
        if (!ok) return;
        store.reset();
        store.clearRoom();
        store.setProfile({ role: "diner", nickname: "" });
        location.replace("#/onboard");
      },
    },
  };
}

/* ============================================================
   同步设置
   ============================================================ */
/* ==== 同步状态卡片（会随状态实时刷新） ==== */
function syncStateBox() {
  const st = sync.status;
  const enabled = sync.enabled();
  const phaseText = !enabled
    ? "仅本机模式"
    : st.phase === "syncing"
    ? "正在同步…"
    : st.phase === "error"
    ? "同步失败"
    : st.phase === "offline"
    ? "离线（等网络恢复）"
    : "已同步";

  const pending = store.dirtyCount();
  const body = enabled
    ? `当前状态：<b>${esc(phaseText)}</b>${
        st.lastSyncAt ? ` · 上次 ${esc(fmtAgo(st.lastSyncAt))}` : ""
      }${pending ? `<br>待上传 <b>${pending}</b> 项` : ""}${
        st.lastError ? `<br><span style="color:var(--danger)">${esc(st.lastError)}</span>` : ""
      }`
    : "还没配置云端。现在数据只在这台手机上，TA 看不到。";

  return notice(body, enabled ? (st.phase === "error" ? "err" : "ok") : "warn");
}

export function syncPage() {
  const cfg = sync.config();
  const enabled = sync.enabled();

  return {
    title: "同步设置",
    back: "#/me",
    tab: "me",
    html: `
      <div id="sync-state">${syncStateBox()}</div>

      <div class="card">
        <div class="card-title">Supabase 配置</div>
        <form data-form="save-sync" novalidate>
          <div class="field">
            <label>Project URL</label>
            <input class="input" name="url" placeholder="https://xxxx.supabase.co" value="${attr(cfg.url)}" />
          </div>
          <div class="field">
            <label>API Key（Publishable 或 anon public）</label>
            <textarea class="input" name="key" style="min-height:76px" placeholder="sb_publishable_…  或  eyJhbGciOi…">${esc(
              cfg.key
            )}</textarea>
            <div class="hint">
              新版叫 <b>Publishable key</b>（<code>sb_publishable_…</code>），老版叫 <b>anon public</b>（<code>eyJ…</code>），两种都能用。
              <br>⚠️ <b>不要</b>贴 <code>Secret key</code> / <code>service_role</code>——那是管理员密钥，能删整库。
            </div>
          </div>
          <div class="btn-row">
            <button class="btn" type="button" data-act="test">测试连接</button>
            <button class="btn btn-primary" type="submit">保存</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="card-title">房间</div>
        <div class="flex-between">
          <div style="font-size:24px;font-weight:800;letter-spacing:5px">${esc(store.state.room?.code || "—")}</div>
          <button class="btn btn-sm btn-soft" data-act="copy-code">复制</button>
        </div>
        <div class="btn-row mt-10">
          <button class="btn btn-sm" data-act="sync-now">立即同步</button>
          <button class="btn btn-sm btn-ghost" data-act="rescan">重新全量拉取</button>
        </div>
      </div>

      <div class="card flat">
        <div class="card-title">怎么拿到这两个值</div>
        <ol class="small muted" style="line-height:1.9;padding-left:18px">
          <li>打开 supabase.com 注册登录（国内打不开就换网络/热点）</li>
          <li>New project → 名字 fanlai → 地区选 Singapore → 建好后等 2 分钟</li>
          <li>左侧 SQL Editor → 粘贴 <code>supabase/schema.sql</code> 的内容 → Run</li>
          <li>Settings → API Keys → 复制 Project URL 和 <b>Publishable</b> key</li>
          <li>粘到上面两个框 → 保存 → 测试连接</li>
        </ol>
      </div>
    `,
    actions: {
      async test() {
        const form = document.querySelector("#view form");
        const fd = new FormData(form);
        store.setSyncConfig({
          url: sync.normalizeUrl(String(fd.get("url") || "")),
          key: String(fd.get("key") || "").trim(),
        });
        toast("正在测试…");
        const r = await sync.test();
        if (r.ok) toast("连上了 ✅", "ok");
        else toast("连不上：" + r.error, "err");
      },
      "save-sync"(form) {
        const fd = new FormData(form);
        const url = sync.normalizeUrl(String(fd.get("url") || ""));
        const key = String(fd.get("key") || "").trim();
        if (!url || !key) {
          toast("两个都要填");
          return;
        }
        store.setSyncConfig({ url, key, lastError: "" });
        toast("已保存，开始同步", "ok");
        sync.run({ force: true });
      },
      async "copy-code"() {
        const ok = await copyText(store.state.room?.code || "");
        toast(ok ? "已复制" : "复制失败", ok ? "ok" : "err");
      },
      async "sync-now"() {
        toast("同步中…");
        const r = await sync.run({ force: true });
        toast(r.ok ? "同步完成" : `同步失败：${r.reason}`, r.ok ? "ok" : "err");
      },
      async rescan() {
        store.setSyncConfig({ cursor: {} });
        toast("已重置游标，正在全量拉取");
        const r = await sync.run({ force: true });
        toast(r.ok ? "拉取完成" : `失败：${r.reason}`, r.ok ? "ok" : "err");
      },
    },
    afterRender(root) {
      // 状态实时刷新，不需要重新进页面
      const box = root.querySelector("#sync-state");
      if (!box) return;
      const off = sync.onStatus(() => {
        const el = document.getElementById("sync-state");
        if (!el) {
          off();
          return;
        }
        el.innerHTML = syncStateBox();
      });
    },
  };
}

/* ============================================================
   数据备份
   ============================================================ */
export function backup() {
  const counts = [
    ["菜谱", store.list("dishes", (d) => !d.deleted).length],
    ["菜单项", store.list("plans", (p) => !p.deleted).length],
    ["点菜请求", store.list("requests", (r) => !r.deleted).length],
    ["店铺", store.list("restaurants", (r) => !r.deleted).length],
    ["邀约", store.list("invites", (i) => !i.deleted).length],
  ];

  return {
    title: "数据备份",
    back: "#/me",
    tab: "me",
    html: `
      ${notice("备份是一份 JSON，包含全部菜谱、菜单、请求、店铺和记录。换手机或误删时用它救回来。")}

      <div class="card">
        <div class="card-title">现在有什么</div>
        <div class="stat-grid" style="margin-bottom:0">
          ${counts
            .map(
              ([label, n]) => `<div class="stat-card">
                <div class="s-label">${label}</div>
                <div class="s-value" style="font-size:22px">${n}</div>
              </div>`
            )
            .join("")}
        </div>
      </div>

      <button class="btn btn-primary btn-block" data-act="export">导出备份（JSON）</button>

      <div class="field mt-16">
        <label>从备份恢复</label>
        <input type="file" id="backup-file" accept=".json,application/json" class="input" />
        <div class="hint">恢复会覆盖本机现有数据（云端会在下次同步时被覆盖）。</div>
      </div>

      <div class="divider"></div>

      <button class="btn btn-danger btn-block" data-act="wipe">清空本机数据</button>
      <div class="hint center mt-6">云端数据不会被删除。</div>
    `,
    actions: {
      export() {
        const snapshot = store.snapshot();
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
        downloadBlob(blob, `fanlai-backup-${todayISO()}.json`);
        toast("已导出，找一下下载目录", "ok");
      },
      async wipe() {
        const word = await askText({
          title: "清空本机数据",
          desc: "这个操作不可撤销。输入「清空」确认。",
          label: "确认",
          placeholder: "清空",
          ok: "清空",
        });
        if (word !== "清空") {
          if (word !== null) toast("输入的不对，已取消");
          return;
        }
        store.reset();
        toast("已清空");
        location.replace("#/onboard");
      },
    },
    afterRender(root) {
      const input = root.querySelector("#backup-file");
      if (!input) return;
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!data || typeof data !== "object" || !data.data) throw new Error("不是饭来的备份文件");
          const ok = await confirmAction({
            title: "恢复这份备份？",
            desc: "本机现有数据会被替换。",
            ok: "恢复",
          });
          if (!ok) return;
          store.replaceAll(data);
          toast("恢复了", "ok");
          location.hash = "#/cook";
        } catch (err) {
          toast("恢复失败：" + (err?.message || err), "err");
        }
      });
    },
  };
}

/* ============================================================
   关于
   ============================================================ */
export function about() {
  return {
    title: "关于饭来",
    back: "#/me",
    tab: "me",
    html: `
      <div class="center" style="padding:14px 0">
        <div style="font-size:52px">🍚</div>
        <h2 style="letter-spacing:4px;margin:6px 0">饭来</h2>
        <div class="muted small">两个人的吃饭小本子 · v${APP_VERSION}</div>
      </div>

      <div class="card">
        <div class="card-title">三个区怎么用</div>
        <div class="small" style="line-height:1.9">
          <p><b>🍳 做饭区</b><br>
          食客点菜 → 大厨接单/换菜/推后/拒绝 → 自动进菜单 → 自动出买菜清单 → 一步一屏下厨。</p>
          <p><b>🍽️ 外食区</b><br>
          把想去的店存起来 → 发起邀约（选时间）→ 两个人都点头才算成 → 生成饭局卡片、记账。</p>
          <p><b>🛵 外卖区</b><br>
          同一套逻辑，多了送达地址、配送费和预计时长。</p>
        </div>
      </div>

      <div class="card">
        <div class="card-title">隐私</div>
        <div class="small muted" style="line-height:1.9">
          · 数据存在你自己的 Supabase 项目里，不经过任何第三方。<br>
          · 小红书/抖音/美团文案的解析全在手机上完成，不上传。<br>
          · 房间码就是唯一钥匙，别发给别人。
        </div>
      </div>

      <div class="card">
        <div class="card-title">技术</div>
        <div class="small muted" style="line-height:1.9">
          零依赖原生 ES Module + Service Worker 离线缓存，直连 Supabase PostgREST，无构建步骤。<br>
          部署方式见仓库里的 <code>部署指南.md</code>。
        </div>
      </div>

      <button class="btn btn-block" data-act="replay-onboard">重看引导</button>

      <div class="divider"></div>
      <button class="btn btn-soft btn-block" data-act="force-update">立即更新到最新版本</button>
      <div class="hint center mt-6">升级后如果界面还是旧的，点这里（会清缓存并重新加载）</div>
    `,
    actions: {
      "replay-onboard"() {
        store.setLocal({ onboardSeen: false });
        toast("下次打开会看到引导（或点下面的按钮）");
        location.hash = "#/onboard";
      },
      async "force-update"() {
        toast("正在清理旧缓存…");
        try {
          if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          sessionStorage.removeItem("fanlai.reloads");
        } catch (err) {
          console.warn("[饭来] 清缓存失败", err);
        }
        toast("马上重新加载…", "ok");
        setTimeout(() => location.reload(), 500);
      },
    },
  };
}

/* ============================================================
   地址与距离
   ============================================================ */
export function geoPage() {
  const cfg = getGeoConfig();
  const home = getHome();
  const keyed = isConfigured();

  // 店铺地址的解析状态（"有些地址不显示距离"时，这里能直接看出是哪一家）
  const addrRows = keyed
    ? (store.list("restaurants") || [])
        .filter((r) => !r.deleted && String(r.address || "").trim())
        .slice(0, 12)
        .map((r) => {
          const c = geoCheck(r.address);
          const tag =
            c.status === "ok"
              ? `<span style="color:var(--sage);font-weight:700">✓ ${esc(distanceText(c.km) || "已定位")}</span>`
              : c.status === "fail"
              ? `<span style="color:var(--tomato);font-weight:700">✗ 解析失败</span>`
              : c.status === "amap-error"
              ? `<span style="color:var(--tomato);font-weight:700">! Key 不可用</span>`
              : c.status === "pending"
              ? `<span class="muted">解析中…</span>`
              : `<span class="muted">未解析</span>`;
          return `<div style="padding:8px 0;border-bottom:1px dashed var(--line-2)">
            <div class="small" style="font-weight:600">${esc(r.name || "未命名")} ${tag}</div>
            <div class="tiny muted" style="margin-top:2px">${esc(r.address)}</div>
          </div>`;
        })
        .join("")
    : "";

  return {
    title: "地址与距离",
    back: "#/me",
    tab: "me",
    html: `
      <div class="card">
        <div class="card-title">🏠 家庭住址</div>
        <div class="field">
          <label>地址（写到街道 + 门牌最准）</label>
          <input class="input" id="home-addr" placeholder="北京市朝阳区望京街 9 号院 3 号楼"
                 value="${attr(home ? home.address : "")}" />
        </div>
        <div class="btn-row mt-6">
          <button class="btn btn-primary" data-act="save-home">保存</button>
          <button class="btn" data-act="use-current">用当前位置</button>
          ${home ? `<button class="btn btn-ghost" data-act="clear-home">清除</button>` : ""}
        </div>
        ${
          home && home.lng != null
            ? `<div class="hint mt-6">已记录坐标：${home.lng.toFixed(5)}, ${home.lat.toFixed(5)}</div>`
            : home
            ? `<div class="hint mt-6">只存了文字，还没算坐标 —— 填好高德 Key 后点一次「保存」就能算。</div>`
            : ""
        }
        <div class="hint mt-6">地址只存在这台手机上，不会同步到云端。</div>
      </div>

      <div class="card mt-16">
        <div class="card-title">🗺️ 高德 Key（算距离用）</div>
        ${
          keyed
            ? notice("已配置：外食/外卖里的店铺会显示离家距离。", "ok")
            : notice(
                "还没配置。距离必须靠地图服务把地址转成坐标，高德对个人开发者免费。",
                "warn"
              )
        }
        <div class="field mt-10">
          <label>Web 端（JS API）Key</label>
          <input class="input" id="amap-key" placeholder="32 位字符" value="${attr(cfg.key)}" />
        </div>
        <div class="field">
          <label>安全密钥 securityJsCode（和安全码配套）</label>
          <input class="input" id="amap-sec" placeholder="2021 年 12 月后创建的 Key 必须有" value="${attr(
            cfg.security
          )}" />
        </div>
        <div class="btn-row mt-6">
          <button class="btn btn-primary" data-act="save-key">保存 Key</button>
          <button class="btn" data-act="test-geo">测试一下</button>
        </div>
        <div class="hint mt-6" style="line-height:1.8">
          申请步骤：打开 <b>lbs.amap.com</b> → 注册/实名 → 控制台 → 应用管理 → 创建应用
          → 添加 Key → 服务平台选 <b>Web端(JS API)</b> → 域名白名单填
          <b>zzn-fanlai.github.io</b> → 保存后把 Key 和安全密钥复制到上面。
        </div>
      </div>

      <div class="card flat mt-16">
        <div class="small muted" style="line-height:1.9">
          距离怎么算的：<br>
          · 把店铺地址转成坐标（高德）→ 算和你家的<b>直线距离</b><br>
          · 时间按直线 × 1.25 的绕路系数估算：1.5 公里内给步行，更远给骑车<br>
          · 手机定位是用 GPS 坐标换算成高德坐标的，两者相差几百米，已做转换
        </div>
      </div>

      ${
        addrRows
          ? `<div class="card mt-16">
               <div class="card-title">📌 店铺地址解析情况</div>
               <div class="small muted" style="margin-bottom:6px">标「解析失败」的换个写法（加区名、去掉"附近"、用商场名）再试。</div>
               ${addrRows}
               <button class="btn btn-soft btn-block mt-10" data-act="regeo-all">全部重新解析</button>
             </div>`
          : ""
      }
    `,
    actions: {
      async "save-home"() {
        const el = document.getElementById("home-addr");
        const addr = String(el?.value || "").trim();
        if (!addr) {
          toast("先写个地址");
          return;
        }
        if (!isConfigured()) {
          setHome({ address: addr, lng: null, lat: null });
          toast("地址存好了；填上高德 Key 才能算距离", "ok");
          rerender();
          return;
        }
        toast("正在解析地址…");
        try {
          const coord = await geocode(addr);
          if (!coord) {
            setHome({ address: addr, lng: null, lat: null });
            toast("地图没认出这个地址，换个写法试试", "err");
          } else {
            setHome({ address: addr, lng: coord.lng, lat: coord.lat });
            toast("存好了，能算距离了", "ok");
          }
        } catch (err) {
          setHome({ address: addr, lng: null, lat: null });
          toast("Key 用不了：" + (err?.message || err), "err");
        }
        rerender();
      },

      async "use-current"() {
        if (!navigator.geolocation) {
          toast("这个浏览器不支持定位");
          return;
        }
        toast("正在定位…");
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { longitude, latitude } = pos.coords;
            // 手机给的是 WGS-84，高德用 GCJ-02：必须转，否则距离会差几百米
            const gcj = wgs84ToGcj02(longitude, latitude);
            let addr = "";
            if (isConfigured()) {
              try {
                addr = await reverseGeocode(gcj.lng, gcj.lat);
              } catch (_) {
                addr = "";
              }
            }
            setHome({
              address: addr || `${gcj.lat.toFixed(4)}, ${gcj.lng.toFixed(4)}`,
              lng: gcj.lng,
              lat: gcj.lat,
            });
            toast(addr ? "定位好了（已换算成高德坐标）" : "存了坐标，地址可以自己补一句", "ok");
            rerender();
          },
          (err) => {
            toast("定位失败：" + (err?.message || "没给权限"), "err");
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
      },

      "clear-home"() {
        clearHome();
        toast("已清除");
        rerender();
      },

      "save-key"() {
        const key = String(document.getElementById("amap-key")?.value || "").trim();
        const sec = String(document.getElementById("amap-sec")?.value || "").trim();
        if (!key) {
          toast("Key 不能为空");
          return;
        }
        setGeoConfig({ key, security: sec });
        toast("Key 存好了", "ok");
        rerender();
      },

      "regeo-all"() {
        clearGeoCache();
        toast("缓存清空了，正在重新解析…");
        rerender();
      },

      async "test-geo"() {
        const key = String(document.getElementById("amap-key")?.value || "").trim();
        const sec = String(document.getElementById("amap-sec")?.value || "").trim();
        if (key) setGeoConfig({ key, security: sec });
        if (!isConfigured()) {
          toast("先填 Key");
          return;
        }
        toast("正在测试…");
        try {
          await loadAmap();
          const home = getHome();
          const target = home?.address || "北京市朝阳区望京街 9 号院";
          const coord = await geocode(target);
          if (coord) toast(`能用：${target} → ${coord.lng.toFixed(4)}, ${coord.lat.toFixed(4)}`, "ok");
          else toast("脚本加载了，但没认出这个地址", "err");
        } catch (err) {
          toast("失败：" + (err?.message || err), "err");
        }
      },
    },
  };
}

/* ============================================================
   消息提醒
   ============================================================ */
/** 后台推送那张卡的内容：按平台给出能真的照做的说法 */
function pushCardHtml() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAndroid = /Android/i.test(ua);

  if (!pushSupported()) {
    return notice(
      "这台设备不支持后台推送。iPhone 需要先「添加到主屏幕」，再从<b>桌面图标</b>打开（iOS 16.4 以上）。",
      "warn"
    );
  }

  if (markedOn()) {
    return (
      notice("已开启：即使 App 被划掉，通知栏也会收到。", "ok") +
      `<button class="btn btn-ghost btn-block mt-10" data-act="disable-push">关闭后台推送</button>`
    );
  }

  // 安卓：推送通道依赖 Google FCM，国内机型基本连不上，提前说清楚，别让人以为是配置错
  if (isAndroid) {
    return (
      notice(
        "安卓的推送通道走 Google 服务（FCM），红米这类没有 Google 服务的机型连不上 —— 这不是你设置错了。" +
          "安卓用<b>站内红点 + 横幅</b>就够了；想收到通知栏消息，用 iPhone 从桌面图标打开再开这个。",
        "warn"
      ) + `<button class="btn btn-ghost btn-block mt-10" data-act="enable-push">仍然尝试开启</button>`
    );
  }

  return (
    notice("还没开启。开启后由服务器在你俩数据变化时直接推到通知栏。", "") +
    `<button class="btn btn-primary btn-block mt-10" data-act="enable-push">开启后台推送</button>`
  );
}

export function notifyPage() {
  const label = permissionLabel();

  return {
    title: "消息提醒",
    back: "#/me",
    tab: "me",
    html: `
      ${notice(label.text, label.kind === "ok" ? "ok" : label.kind === "warn" ? "warn" : "")}

      <div class="card mt-10">
        <div class="card-title">🔔 什么时候提醒你</div>
        <div class="small muted" style="line-height:1.9">
          · TA 发起邀约，等你点头<br>
          · 你的邀约被同意 / 被拒绝<br>
          · TA 点了一道菜，等你接单
        </div>
        <button class="btn btn-primary btn-block mt-10" data-act="enable-notify">开启通知</button>
        <button class="btn btn-soft btn-block mt-6" data-act="test-notify">发一条测试提醒</button>
      </div>

      <div class="card mt-10">
        <div class="card-title">📡 后台推送（App 关掉也能收到）</div>
        ${pushCardHtml()}
        <div class="hint mt-6">需要先填好「我的 → 同步设置」。</div>
      </div>

      <div class="card flat mt-16">
        <div class="small muted" style="line-height:1.9">
          提醒分三层，按设备能力自动降级：<br>
          ① <b>站内横幅</b> —— 页面开着时，顶部滑下来一条，点一下直接跳过去<br>
          ② <b>系统通知</b> —— App 切到后台时弹在通知栏（需要允许一次通知权限）<br>
          ③ <b>振动</b> —— 手机上配合横幅轻震一下<br><br>
          <b>为什么后台时可能收不到：</b><br>
          · 安卓：切到后台后浏览器会把网页的定时器压到一分钟以上，数据来不及时就没有可提醒的东西<br>
          · 苹果：<b>必须先「添加到主屏幕」</b>，从 Safari 标签页打开时系统不发放通知<br>
          · 两端都一样：App 被完全杀掉后，网页无法自己醒来<br><br>
          ✅ 上面那张「后台推送」就是服务器推送：部署好并开启后，<b>关掉 App 也能收到</b>。
        </div>
      </div>
    `,
    actions: {
      async "enable-notify"() {
        const res = await askNotify();
        if (res === "granted") {
          vibrate();
          toast("好了，之后会提醒你", "ok");
        } else if (res === "denied") {
          toast("被拒绝了，只能看站内横幅；可以去浏览器设置里改", "err");
        } else if (res === "unsupported") {
          toast("这个浏览器不支持系统通知，站内横幅照样有");
        } else {
          toast("没有授权成功");
        }
        rerender();
      },

      async "enable-push"() {
        try {
          const room = store.state.room?.code || "";
          if (!room) throw new Error("还没进房间 —— 先开个房间或加入对方的房间");
          await enablePush({
            roomCode: room,
            deviceId: store.state.profile?.deviceId || "",
            role: store.state.profile?.role || "",
          });
          toast("开启成功，关掉 App 也能收到了", "ok");
          rerender();
        } catch (err) {
          toast(String(err?.message || err), "err");
        }
      },

      async "disable-push"() {
        await disablePush();
        toast("已关闭后台推送");
        rerender();
      },

      async "test-notify"() {
        // 横幅不依赖权限，先给你看一眼效果
        showBanner({
          emoji: "🍳",
          title: "有人点菜了",
          body: "想吃「番茄炒蛋」，等你接单",
          href: "",
          actionText: "知道了",
          ms: 6000,
        });
        vibrate();

        const res = await askNotify();
        if (res !== "granted") {
          toast("横幅已经显示了；系统通知要先允许权限", res === "denied" ? "err" : "");
          return;
        }
        const ok = await systemNotify({
          title: "饭来 · 测试提醒",
          body: "看到这条说明通知通了",
          tag: "fanlai-test",
          href: "#/me",
          force: true,
        });
        toast(ok ? "发出去了，看看通知栏" : "没能弹出通知，看下面的说明", ok ? "ok" : "err");
      },
    },
  };
}
