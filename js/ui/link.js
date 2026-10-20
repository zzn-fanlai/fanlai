/* ============================================================
   饭来 · 链接快速跳转
   ------------------------------------------------------------
   三个区（做饭 / 外食 / 外卖）里只要存在链接，就用同一套跳转面板：
   · 在浏览器打开（短链没有协议时自动补 https://）
   · 复制链接（便于发微信，或去对应 App 里打开）
   ============================================================ */
import { esc, attr, copyText } from "../lib/util.js";
import { platformLabel } from "../lib/catalog.js";
import { openSheet, closeSheet, toast } from "./kit.js";

/** 补全协议、去空格 */
export function normalizeLink(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw)) return raw.startsWith("//") ? "https:" + raw : raw;
  if (/^www\./i.test(raw)) return "https://" + raw;
  if (/^[a-z]+:\/\//i.test(raw)) return raw;
  return "https://" + raw;
}

function hostOf(url) {
  try {
    return new URL(normalizeLink(url)).host.replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

/** 短链提示：这类链接在浏览器里常被拦，建议复制到 App 打开 */
function shortLinkHint(host) {
  if (/xhslink|xhs\.link/i.test(host)) return "小红书短链：浏览器里可能要求先装小红书 App，打不开就复制到小红书搜索。";
  if (/douyin|iesdouyin/i.test(host)) return "抖音短链：可能要装 App 才能看，打不开就复制到抖音打开。";
  if (/meituan|dianping|m\.dianping/i.test(host)) return "美团/点评链接：手机上可能需要装对应 App。";
  return "";
}

export function openLinkDirect(url) {
  const clean = normalizeLink(url);
  if (!clean) {
    toast("这条没有链接");
    return;
  }
  // 用 a[target=_blank] 比 window.open 更不容易被 iOS 拦
  const a = document.createElement("a");
  a.href = clean;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ============================================================
   唤起 App（小红书 / 抖音 / 美团 / 淘宝）
   ------------------------------------------------------------
   原理：
   · Android —— 用 intent:// 语法，带 package + 浏览器兜底地址，
     App 没装会自动退回浏览器，不会白屏。
   · iOS —— 用各家 URL Scheme（xhsdiscover:// 等），
     没装 App 时浏览器不会有反应，所以我们等 1.5 秒后给提示。
   ⚠️ 这些 Scheme 由各家 App 定义，可能随版本变化；
      所以「复制链接」永远是最后一道保险。
   ============================================================ */

export const APPS = {
  xhs: { key: "xhs", label: "小红书", emoji: "📕", pkg: "com.xingin.xhs", scheme: "xhsdiscover" },
  douyin: { key: "douyin", label: "抖音", emoji: "🎵", pkg: "com.ss.android.ugc.aweme", scheme: "snssdk1128" },
  meituan: { key: "meituan", label: "美团", emoji: "🟡", pkg: "com.sankuai.meituan", scheme: "imeituan" },
  taobao: { key: "taobao", label: "淘宝", emoji: "🧡", pkg: "com.taobao.taobao", scheme: "taobao" },
};

/** 根据链接域名猜它属于哪个 App */
export function detectApp(url) {
  const s = String(url || "");
  if (/xiaohongshu|xhslink|xhs\.link/i.test(s)) return "xhs";
  if (/douyin|iesdouyin/i.test(s)) return "douyin";
  if (/meituan|dianping/i.test(s)) return "meituan";
  if (/taobao|tmall/i.test(s)) return "taobao";
  return "";
}

function pickId(app, url) {
  const s = String(url || "");
  if (app === "xhs") {
    const m = s.match(/(?:explore|discovery\/item|note|item)\/([0-9a-zA-Z]{16,})/);
    return m ? m[1] : "";
  }
  if (app === "douyin") {
    const m = s.match(/video\/(\d{6,})/);
    return m ? m[1] : "";
  }
  if (app === "taobao") {
    const m = s.match(/[?&]id=(\d{6,})/);
    return m ? m[1] : "";
  }
  return "";
}

/** 各家 App 的 deep link（拿不到 ID 就退到 App 首页） */
export function buildDeepLink(app, url) {
  const id = pickId(app, url);
  switch (app) {
    case "xhs":
      return id ? `xhsdiscover://noteDetail?noteId=${id}` : "xhsdiscover://";
    case "douyin":
      return id ? `snssdk1128://aweme/detail/${id}` : "snssdk1128://";
    case "meituan":
      return "imeituan://";
    case "taobao":
      return id ? `taobao://item.taobao.com/item.htm?id=${id}` : "taobao://";
    default:
      return "";
  }
}

function isAndroid() {
  return /android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

function isMIUI() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /MIUI|HyperOS|Redmi|Xiaomi|POCO/i.test(ua);
}

/**
 * 用指定 App 打开链接
 * ------------------------------------------------------------
 * 现实：国产 App 基本做不到「从外部直接跳到某条内容」——
 *   · iOS —— scheme 不接受外部内容 ID，且各家不稳定
 *   · 小米等国产 ROM —— 浏览器普遍拦截 intent://
 * 所以统一走「先复制链接，再唤醒 App」：
 *   App 启动时会读剪贴板，弹出"打开剪贴板中的链接"，用户点一下就到内容了。
 * @returns {Promise<"copied"|"failed">}
 */
export async function openWithApp(appKey, url) {
  const app = APPS[appKey];
  const clean = normalizeLink(url);
  if (!app || !clean) return "failed";

  // ① 先把链接放进剪贴板（这是唯一通用的"带内容打开"方式）
  let copied = false;
  try {
    copied = await copyText(clean);
  } catch (_) {
    copied = false;
  }
  // 给 toast 一点时间显示，否则跳走后用户看不到
  await new Promise((r) => setTimeout(r, 130));

  const deep = buildDeepLink(appKey, clean);

  try {
    if (isAndroid()) {
      if (isMIUI()) {
        // MIUI / HyperOS 普遍拦截 intent://，直接走 scheme
        window.location.href = deep;
      } else {
        const u = new URL(clean);
        const intent =
          `intent://${u.host}${u.pathname}${u.search}` +
          `#Intent;scheme=${u.protocol.replace(":", "")};package=${app.pkg};` +
          `S.browser_fallback_url=${encodeURIComponent(clean)};end`;
        window.location.href = intent;
        // 1 秒后还停在页面上 → intent 没被处理，改用 scheme
        setTimeout(() => {
          if (document.visibilityState === "visible") window.location.href = deep;
        }, 900);
      }
    } else {
      // iOS / 桌面：直接试 scheme
      window.location.href = deep;
    }
  } catch (err) {
    return "failed";
  }
  return copied ? "copied" : "failed";
}

/** 链接面板 */
export function linkSheet({ url, name = "", platform = "" } = {}) {
  const clean = normalizeLink(url);
  if (!clean) {
    toast("这条没有链接");
    return;
  }
  const host = hostOf(clean);
  const hint = shortLinkHint(host);
  const detected = detectApp(clean);

  const appButtons = Object.values(APPS)
    .map((app) => {
      const active = app.key === detected;
      return `<button class="chip ${active ? "on" : ""}" data-app="${app.key}" style="font-size:13.5px;padding:9px 14px">${app.emoji} ${app.label}</button>`;
    })
    .join("");

  openSheet(
    `<h3>${esc(name || "打开链接")}</h3>
     <p class="sheet-sub">${esc([platformLabel(platform), host].filter((x) => x && x !== "手动录入").join(" · "))}</p>
     <div class="card tight" style="word-break:break-all;font-size:12.5px;color:var(--cocoa-70)">${esc(clean)}</div>

     <div class="field mt-10">
       <label>用哪个 App 打开</label>
       <div class="chips" data-app-row>${appButtons}</div>
       <div class="hint">
         点 App 按钮会 <b>先把链接复制到剪贴板</b>，再打开 App ——
         回去后 App 一般会提示「打开剪贴板中的链接」，点一下就到那条内容了。<br>
         点了完全没反应 = 手机没装这个 App。
       </div>
     </div>

     ${hint ? `<div class="notice"><span class="n-ico">💡</span><span>${esc(hint)}</span></div>` : ""}

     <div class="btn-row mt-10">
       <button class="btn" data-open-link>🌐 在浏览器打开</button>
       <button class="btn" data-copy-link>📋 复制链接</button>
     </div>
     <button class="btn btn-ghost btn-block mt-6" data-close-link>取消</button>`,
    {
      onMount(body) {
        body.querySelector("[data-open-link]").addEventListener("click", () => {
          closeSheet();
          openLinkDirect(clean);
        });
        body.querySelector("[data-copy-link]").addEventListener("click", async () => {
          const ok = await copyText(clean);
          closeSheet();
          toast(ok ? "链接已复制" : "复制失败，长按上面的网址复制", ok ? "ok" : "err");
        });
        body.querySelector("[data-close-link]").addEventListener("click", closeSheet);

        body.querySelectorAll("[data-app]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const app = APPS[btn.dataset.app];
            if (btn.dataset.busy === "1") return;
            btn.dataset.busy = "1";

            const mode = await openWithApp(btn.dataset.app, clean);

            // 用户从 App 返回后，按钮恢复可点
            setTimeout(() => {
              btn.dataset.busy = "";
            }, 2500);

            if (mode === "copied") {
              toast(`链接已复制，正在打开${app.label}…回去点「打开剪贴板中的链接」`, "ok");
            } else {
              toast("复制失败，请手动长按上面的网址复制", "err");
            }
          });
        });
      },
    }
  );
}

/** 列表/卡片上的小链接按钮（data-act="open-link"，由 app.js 统一拦截） */
export function linkChip({ url, name = "", platform = "", label = "链接", cls = "btn-xs btn-ghost" }) {
  const clean = normalizeLink(url);
  if (!clean) return "";
  return `<button class="btn ${cls}" data-act="open-link" data-url="${attr(clean)}" data-name="${attr(
    name
  )}" data-platform="${attr(platform)}" title="${attr(clean)}">🔗 ${esc(label)}</button>`;
}
