/* ============================================================
   饭来 · UI 小工具（Toast / 弹层 / 确认框 / 输入框 / 空状态）
   ============================================================ */
import { esc, attr } from "../lib/util.js";

/* ---------- Toast ---------- */
let toastTimer = null;
export function toast(msg, kind = "") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = "toast";
    setTimeout(() => (el.hidden = true), 220);
  }, 2200);
}

/** 通知外壳重绘当前视图（视图内部状态变化时用，避免循环 import） */
export function rerender() {
  window.dispatchEvent(new Event("fanlai:rerender"));
}

/* ---------- 底部弹层（长表单用） ---------- */
export function openSheet(html, { onMount, onClose } = {}) {
  const root = document.getElementById("sheet");
  const content = document.getElementById("sheet-content");
  if (!root || !content) return () => {};
  content.innerHTML = html;
  root.hidden = false;
  document.body.style.overflow = "hidden";

  const close = () => {
    root.hidden = true;
    content.innerHTML = "";
    document.body.style.overflow = "";
    if (onClose) onClose();
  };
  root._close = close;
  if (onMount) onMount(content, close);
  return close;
}

export function closeSheet() {
  const root = document.getElementById("sheet");
  if (root && !root.hidden && root._close) root._close();
}

/* ---------- 动态浮层（对话框，可叠加） ---------- */
let zBase = 100;
function openDialog(html, { onMount, dismissible = true } = {}) {
  const layer = document.createElement("div");
  layer.className = "sheet";
  layer.style.zIndex = String(zBase++);
  layer.innerHTML = `
    <div class="sheet-mask"></div>
    <div class="sheet-body" role="dialog" aria-modal="true">
      <div class="sheet-grip"></div>
      ${html}
    </div>`;
  document.body.appendChild(layer);

  const close = (result) => {
    layer.remove();
    if (!document.querySelector(".sheet:not([hidden])")) document.body.style.overflow = "";
    layer._resolve && layer._resolve(result);
  };
  layer._close = close;

  if (dismissible) {
    layer.querySelector(".sheet-mask").addEventListener("click", () => close());
  }
  document.body.style.overflow = "hidden";
  if (onMount) onMount(layer.querySelector(".sheet-body"), close);
  return { el: layer, close };
}

/* ---------- 确认框 ---------- */
export function confirmAction({
  title = "确定吗？",
  desc = "",
  ok = "确定",
  cancel = "取消",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const { el, close } = openDialog(
      `<h3>${esc(title)}</h3>
       ${desc ? `<p class="sheet-sub">${esc(desc)}</p>` : '<div style="height:10px"></div>'}
       <div class="btn-row mt-10">
         <button class="btn" data-r="0">${esc(cancel)}</button>
         <button class="btn ${danger ? "btn-primary" : "btn-primary"}" data-r="1">${esc(ok)}</button>
       </div>`,
      {
        onMount(body) {
          body.querySelectorAll("[data-r]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const v = btn.dataset.r === "1";
              close();
              resolve(v);
            });
          });
          el._resolve = () => resolve(false);
        },
      }
    );
  });
}

/* ---------- 文本输入框 ---------- */
export function askText({
  title = "",
  desc = "",
  label = "",
  value = "",
  placeholder = "",
  multiline = false,
  ok = "保存",
  cancel = "取消",
  maxlength = 500,
  optional = false,
} = {}) {
  return new Promise((resolve) => {
    const input = multiline
      ? `<textarea class="input" id="ask-input" maxlength="${maxlength}" placeholder="${attr(placeholder)}">${esc(value)}</textarea>`
      : `<input class="input" id="ask-input" maxlength="${maxlength}" placeholder="${attr(placeholder)}" value="${attr(value)}" />`;
    const { el, close } = openDialog(
      `${title ? `<h3>${esc(title)}</h3>` : ""}
       ${desc ? `<p class="sheet-sub">${esc(desc)}</p>` : ""}
       <div class="field">${label ? `<label for="ask-input">${esc(label)}</label>` : ""}${input}</div>
       <div class="btn-row">
         <button class="btn" data-r="0">${esc(cancel)}</button>
         <button class="btn btn-primary" data-r="1">${esc(ok)}</button>
       </div>`,
      {
        onMount(body) {
          const field = body.querySelector("#ask-input");
          setTimeout(() => field.focus(), 60);
          const submit = () => {
            const v = field.value.trim();
            if (!v && !optional) {
              toast("写点什么吧");
              return;
            }
            close();
            resolve(v);
          };
          body.querySelectorAll("[data-r]").forEach((btn) => {
            btn.addEventListener("click", () => {
              if (btn.dataset.r === "1") submit();
              else {
                close();
                resolve(null);
              }
            });
          });
          field.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" && !multiline) {
              ev.preventDefault();
              submit();
            }
          });
          el._resolve = () => resolve(null);
        },
      }
    );
  });
}

/* ---------- 选择器（列表单选） ---------- */
export function chooseOne({ title, desc = "", options = [], value = "" }) {
  return new Promise((resolve) => {
    const rows = options
      .map(
        (o, i) => `
      <button class="row" data-i="${i}">
        <div class="row-emoji">${esc(o.emoji || "•")}</div>
        <div class="row-main">
          <div class="row-title"><span class="t">${esc(o.label)}</span></div>
          ${o.desc ? `<div class="row-sub">${esc(o.desc)}</div>` : ""}
        </div>
        <div class="row-aside">${o.value === value ? '<span style="color:var(--tomato)">✓</span>' : ""}</div>
      </button>`
      )
      .join("");
    const { el, close } = openDialog(
      `${title ? `<h3>${esc(title)}</h3>` : ""}
       ${desc ? `<p class="sheet-sub">${esc(desc)}</p>` : ""}
       <div class="list">${rows}</div>
       <button class="btn btn-ghost btn-block mt-10" data-r="0">取消</button>`,
      {
        onMount(body) {
          body.querySelectorAll("[data-i]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const o = options[Number(btn.dataset.i)];
              close();
              resolve(o.value);
            });
          });
          body.querySelector('[data-r="0"]').addEventListener("click", () => {
            close();
            resolve(null);
          });
          el._resolve = () => resolve(null);
        },
      }
    );
  });
}

/* ---------- 复用片段 ---------- */
export function emptyState({ emoji = "🍚", title = "还什么都没有", hint = "", action = "" } = {}) {
  return `
    <div class="empty">
      <div class="e-ico">${emoji}</div>
      <div class="e-title">${esc(title)}</div>
      ${hint ? `<div class="e-hint">${hint}</div>` : ""}
      ${action}
    </div>`;
}

export function notice(text, kind = "") {
  const ico = kind === "warn" ? "⚠️" : kind === "err" ? "⛔" : kind === "ok" ? "✅" : "💡";
  return `<div class="notice ${kind}"><span class="n-ico">${ico}</span><span>${text}</span></div>`;
}

export function badge(status, map) {
  const meta = map[status] || { label: status, cls: "" };
  return `<span class="badge ${meta.cls}">${esc(meta.label)}</span>`;
}

export function segButtons(items, active, actName, { className = "" } = {}) {
  return `<div class="segmented ${className}">
    ${items
      .map(
        (it) =>
          `<button class="${it.value === active ? "on" : ""}" data-act="${actName}" data-value="${attr(it.value)}">${esc(
            it.label
          )}</button>`
      )
      .join("")}
  </div>`;
}

export function chipRow(items, active, actName, { extra = "" } = {}) {
  return `<div class="chips">
    ${items
      .map(
        (it) =>
          `<button class="chip ${it.value === active ? "on" : ""} ${extra}" data-act="${actName}" data-value="${attr(
            it.value
          )}">${esc(it.label)}</button>`
      )
      .join("")}
  </div>`;
}

export function heartRating(n) {
  const v = Math.max(0, Math.min(5, Number(n) || 0));
  return "♥".repeat(v) + "♡".repeat(5 - v);
}

/* ---------- 长图预览（可下载 / 长按保存兜底） ---------- */
export function openImagePreview(url, filename = "饭来.png", { onClose } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "preview-wrap";
  wrap.innerHTML = `
    <div class="preview-bar">
      <button class="btn btn-primary" data-dl>保存图片</button>
      <button class="btn" data-x>关闭</button>
    </div>
    <img src="${attr(url)}" alt="导出预览" />
    <div class="center small" style="color:rgba(255,255,255,.72);padding-bottom:10px">
      如果点了没反应，长按上面的图片 → 存储到照片
    </div>`;
  document.body.appendChild(wrap);

  const close = () => {
    wrap.remove();
    if (onClose) onClose();
  };
  wrap.querySelector("[data-x]").addEventListener("click", close);
  wrap.querySelector("[data-dl]").addEventListener("click", async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("已保存到下载目录", "ok");
    } catch (err) {
      toast("保存失败，长按图片试试", "err");
    }
  });
  return close;
}
