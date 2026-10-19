/* ============================================================
   饭来 · 长图导出（Canvas 手绘，零依赖）
   ------------------------------------------------------------
   两遍布局：第一遍用离屏 canvas 测量并累计 y，第二遍真正绘制
   ============================================================ */
import { relativeDay, isoWeekday, fmtMD } from "./util.js";
import { mealLabel, CAT_EMOJI } from "./catalog.js";
import { qtyText } from "./ingredients.js";

const C = {
  cream: "#FFF9F2",
  paper: "#FFFFFF",
  tomato: "#E4572E",
  tomatoSoft: "#FDE8E1",
  yolk: "#F2B705",
  yolkSoft: "#FEF4D6",
  cocoa: "#3D2B1F",
  cocoa55: "rgba(61,43,31,.55)",
  cocoa38: "rgba(61,43,31,.38)",
  line: "rgba(61,43,31,.12)",
  sage: "#7A9E7E",
  sageSoft: "#E8F0E7",
};

const W = 1080;
const PAD = 56;
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, -apple-system, sans-serif';
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

function font(size, weight = 400) {
  return `${weight} ${size}px ${FONT}`;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth) {
  const chars = Array.from(String(text || ""));
  const lines = [];
  let cur = "";
  for (const ch of chars) {
    if (ch === "\n") {
      lines.push(cur);
      cur = "";
      continue;
    }
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/* ============================================================
   布局引擎
   ============================================================ */
function createLayout() {
  const measure = document.createElement("canvas").getContext("2d");
  const ops = [];
  let y = PAD;

  const api = {
    ops,
    get y() {
      return y;
    },

    gap(h = 20) {
      y += h;
    },

    /** 主标题 */
    title(text, sub) {
      measure.font = font(58, 700);
      measure.fillStyle = C.cocoa;
      ops.push({ t: "text", text, x: PAD, y: y + 58, size: 58, weight: 700, color: C.cocoa });
      y += 74;
      if (sub) {
        measure.font = font(30, 500);
        ops.push({ t: "text", text: sub, x: PAD, y: y + 30, size: 30, weight: 500, color: C.cocoa55 });
        y += 44;
      }
    },

    hr() {
      ops.push({ t: "line", x1: PAD, y1: y, x2: W - PAD, y2: y, color: C.line, dash: [8, 8] });
      y += 24;
    },

    sectionLabel(text, color = C.tomato) {
      measure.font = font(26, 700);
      const w = measure.measureText(text).width + 34;
      ops.push({ t: "pill", x: PAD, y, w, h: 44, color, text, size: 26 });
      y += 44 + 16;
    },

    /** 白卡片包裹的内容块 */
    card(drawFn) {
      const idx = ops.length;
      const startY = y;
      y += 24;
      drawFn();
      y += 20;
      ops.splice(idx, 0, {
        t: "card",
        x: PAD,
        y: startY,
        w: W - PAD * 2,
        h: y - startY,
      });
      y += 20;
    },

    dishHeader(emoji, title, meta) {
      measure.font = font(38, 700);
      ops.push({ t: "emoji", text: emoji || "🍳", x: PAD + 26, y: y + 40, size: 40 });
      const tw = W - PAD * 2 - 52 - 76;
      const lines = wrap(measure, title, tw);
      ops.push({ t: "text", text: lines[0], x: PAD + 76, y: y + 38, size: 38, weight: 700, color: C.cocoa });
      y += 50;
      if (meta) {
        measure.font = font(24, 500);
        ops.push({ t: "text", text: meta, x: PAD + 76, y: y + 24, size: 24, weight: 500, color: C.cocoa55 });
        y += 34;
      }
    },

    para(text, { size = 28, weight = 400, color = C.cocoa, indent = 0, lineH = 1.55 } = {}) {
      measure.font = font(size, weight);
      const maxW = W - PAD * 2 - 52 - indent;
      const lines = wrap(measure, text, maxW);
      const lh = Math.round(size * lineH);
      lines.forEach((ln, i) => {
        ops.push({ t: "text", text: ln, x: PAD + 26 + indent, y: y + lh * (i + 1) - Math.round(size * 0.3), size, weight, color });
      });
      y += lh * lines.length + 6;
    },

    kv(left, right, { leftColor = C.cocoa, rightColor = C.cocoa55 } = {}) {
      measure.font = font(27, 500);
      ops.push({ t: "text", text: left, x: PAD + 26, y: y + 28, size: 27, weight: 500, color: leftColor });
      measure.font = font(27, 600);
      const rw = measure.measureText(right).width;
      ops.push({ t: "text", text: right, x: W - PAD - 26 - rw, y: y + 28, size: 27, weight: 600, color: rightColor });
      y += 42;
    },

    footer(text) {
      measure.font = font(22, 500);
      y += 16;
      ops.push({ t: "text", text, x: W / 2, y, size: 22, weight: 500, color: C.cocoa38, align: "center" });
      y += 30;
    },

    finish() {
      return Math.max(y + PAD, 400);
    },
  };
  return api;
}

function paint(layout, height) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");

  // 背景
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 顶部色斑
  const g = ctx.createRadialGradient(W * 0.12, 0, 10, W * 0.12, 0, 420);
  g.addColorStop(0, "rgba(244,194,194,.45)");
  g.addColorStop(1, "rgba(244,194,194,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 420);
  const g2 = ctx.createRadialGradient(W * 0.9, 0, 10, W * 0.9, 0, 380);
  g2.addColorStop(0, "rgba(242,183,5,.32)");
  g2.addColorStop(1, "rgba(242,183,5,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, 380);

  ctx.textBaseline = "alphabetic";

  for (const op of layout.ops) {
    if (op.t === "card") {
      ctx.save();
      ctx.shadowColor = "rgba(61,43,31,.10)";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = C.paper;
      roundRect(ctx, op.x, op.y, op.w, op.h, 32);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      roundRect(ctx, op.x, op.y, op.w, op.h, 32);
      ctx.stroke();
    } else if (op.t === "line") {
      ctx.save();
      ctx.strokeStyle = op.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(op.dash || []);
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
      ctx.restore();
    } else if (op.t === "pill") {
      ctx.fillStyle = op.color;
      roundRect(ctx, op.x, op.y, op.w, op.h, op.h / 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = font(op.size, 700);
      ctx.fillText(op.text, op.x + 17, op.y + op.h / 2 + op.size * 0.36);
    } else if (op.t === "emoji") {
      ctx.font = `${op.size}px ${EMOJI_FONT}`;
      ctx.fillStyle = C.cocoa;
      ctx.fillText(op.text, op.x, op.y);
    } else if (op.t === "text") {
      ctx.font = font(op.size, op.weight || 400);
      ctx.fillStyle = op.color || C.cocoa;
      if (op.align === "center") {
        ctx.textAlign = "center";
        ctx.fillText(op.text, op.x, op.y);
        ctx.textAlign = "start";
      } else {
        ctx.fillText(op.text, op.x, op.y);
      }
    }
  }
  return canvas;
}

/* ============================================================
   菜单长图
   ============================================================ */
export function menuCanvas({ date, plans, nickname = "" }) {
  const L = createLayout();
  L.title("今日菜单", `${fmtMD(date)} ${isoWeekday(date)}${nickname ? " · " + nickname : ""}`);
  L.hr();

  const byMeal = new Map();
  for (const p of plans) {
    if (!byMeal.has(p.meal)) byMeal.set(p.meal, []);
    byMeal.get(p.meal).push(p);
  }

  if (!plans.length) {
    L.para("这一餐还什么都没安排。", { color: C.cocoa55 });
  }

  for (const [meal, items] of byMeal) {
    L.sectionLabel(mealLabel(meal));
    for (const p of items) {
      const d = p.dish_snapshot || {};
      L.card((x, w) => {
        L.dishHeader(d.emoji, d.title || "一道菜", [d.cook_minutes ? `约 ${d.cook_minutes} 分钟` : "", d.servings || ""].filter(Boolean).join(" · "));
        const ings = (d.ingredients || []).map((i) => `${i.name} ${qtyText(i)}`.trim()).filter(Boolean);
        if (ings.length) {
          L.para("食材：" + ings.join("、"), { size: 25, color: C.cocoa55 });
        }
        if (d.steps?.length) {
          d.steps.forEach((s, i) => L.para(`${i + 1}. ${s.text}`, { size: 25, color: C.cocoa }));
        }
      });
    }
  }

  L.footer("饭来 · 两个人的吃饭小本子");
  return paint(L, L.finish());
}

/* ============================================================
   买菜清单长图
   ============================================================ */
export function shoppingCanvas({ groups, title = "买菜清单", sub = "" }) {
  const L = createLayout();
  L.title(title, sub);
  L.hr();
  for (const g of groups) {
    L.sectionLabel(`${CAT_EMOJI[g.category] || "🧺"} ${g.category}`, C.cocoa);
    L.card(() => {
      for (const item of g.items) {
        L.kv(item.name, item.qtyText);
      }
    });
  }
  L.footer("饭来 · 别买重了");
  return paint(L, L.finish());
}

/* ============================================================
   饭局卡片
   ============================================================ */
export function cardCanvas({ invite, kind, names = {} }) {
  const r = invite.restaurant_snapshot || {};
  const L = createLayout();
  L.title(kind === "takeout" ? "外卖定了" : "出去吃！", kind === "takeout" ? "今晚不用动火" : "两个人都点头了");
  L.hr();
  L.card(() => {
    L.dishHeader(kind === "takeout" ? "🛵" : "🍽️", r.name || "一家店", [r.cuisine, r.platform].filter(Boolean).join(" · "));
    const when = String(invite.scheduled_at || "").replace("T", " ").slice(0, 16);
    if (when) L.kv("时间", when);
    if (r.avg_price) L.kv("人均", `¥${r.avg_price}`);
    if (r.address) L.kv(kind === "takeout" ? "送到" : "地点", r.address);
    if (kind === "takeout" && r.delivery_fee) L.kv("配送费", `¥${r.delivery_fee}`);
    if (invite.amount) L.kv("这顿花了", `¥${invite.amount}`);
    if (invite.note) L.para(invite.note, { size: 26, color: C.cocoa55 });
  });
  L.footer(invite.proposer ? `${names.by || ""}发起 · 饭来` : "饭来");
  return paint(L, L.finish());
}

/* ---------- 工具 ---------- */
export function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), "image/png", 0.95);
    else resolve(null);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
