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

/**
 * 用指定 App 打开链接
 * @returns {"intent"|"scheme"|"failed"}
 */
export function openWithApp(appKey, url) {
  const app = APPS[appKey];
  const clean = normalizeLink(url);
  if (!app || !clean) return "failed";

  const webFallback = encodeURIComponent(clean);

  try {
    if (isAndroid()) {
      // Android：intent 语法，App 没装会自动用浏览器打开原链接
      const u = new URL(clean);
      const intent =
        `intent://${u.host}${u.pathname}${u.search}` +
        `#Intent;scheme=${u.protocol.replace(":", "")};package=${app.pkg};` +
        `S.browser_fallback_url=${webFallback};end`;
      window.location.href = intent;
      return "intent";
    }
    // iOS / 桌面：直接试 URL Scheme
    const deep = buildDeepLink(appKey, clean);
    if (!deep) return "failed";
    window.location.href = deep;
    return "scheme";
  } catch (err) {
    return "failed";
  }
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
       <div class="hint">点了没跳转 = 手机没装这个 App，或者被系统拦了 → 用下面的「在浏览器打开」或「复制链接」。</div>
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
          btn.addEventListener("click", () => {
            const app = APPS[btn.dataset.app];
            const mode = openWithApp(btn.dataset.app, clean);
            if (mode === "failed") {
              toast("打不开，试试复制链接", "err");
              return;
            }
            // iOS 唤起失败时页面不会有任何变化，给个提示兜底
            if (mode === "scheme") {
              setTimeout(() => {
                if (document.visibilityState === "visible") {
                  toast(`没能打开${app.label}，可能没装这个 App`, "err");
                }
              }, 1600);
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
