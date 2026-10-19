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

/** 链接面板 */
export function linkSheet({ url, name = "", platform = "" } = {}) {
  const clean = normalizeLink(url);
  if (!clean) {
    toast("这条没有链接");
    return;
  }
  const host = hostOf(clean);
  const hint = shortLinkHint(host);

  openSheet(
    `<h3>${esc(name || "打开链接")}</h3>
     <p class="sheet-sub">${esc([platformLabel(platform), host].filter((x) => x && x !== "手动录入").join(" · "))}</p>
     <div class="card tight" style="word-break:break-all;font-size:12.5px;color:var(--cocoa-70)">${esc(clean)}</div>
     ${hint ? `<div class="notice mt-10"><span class="n-ico">💡</span><span>${esc(hint)}</span></div>` : ""}
     <div class="btn-row mt-10">
       <button class="btn btn-primary" data-open-link>在浏览器打开</button>
       <button class="btn" data-copy-link>复制链接</button>
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
