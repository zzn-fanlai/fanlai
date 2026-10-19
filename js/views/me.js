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
} from "../ui/kit.js";
import { downloadBlob } from "../lib/exportImage.js";
import { statsFor } from "../lib/model.js";

const APP_VERSION = "1.0.6";

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
        <a class="row" href="#/me/about">
          <div class="row-emoji">🍚</div>
          <div class="row-main">
            <div class="row-title"><span class="t">关于饭来</span></div>
            <div class="row-sub"><span>怎么用、隐私、版本 ${APP_VERSION}</span></div>
          </div>
          <div class="row-aside"><span class="row-chev">›</span></div>
        </a>
      </div>

      <div class="card flat mt-16">
        <div class="small muted" style="line-height:1.8">
          把饭来装到桌面：iPhone 用 Safari 打开 → 分享 → 添加到主屏幕；安卓用 Chrome → 菜单 → 安装应用。
        </div>
      </div>

      <div class="center tiny muted mt-16">饭来 ${APP_VERSION} · 数据在你自己的 Supabase 里</div>
    `,
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
