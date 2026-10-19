/* ============================================================
   饭来 · 导入解析（纯本地规则引擎，不联网、不上传）
   ------------------------------------------------------------
   输入：用户从 小红书 / 抖音 / 美团 / 大众点评 复制来的分享文案
   输出：结构化的菜谱或餐厅草稿，交给「确认页」编辑后入库
   ============================================================ */
import { guessDishEmoji, CUISINES, REST_CUISINES } from "./catalog.js";
import { makeIngredient } from "./ingredients.js";

/* ---------- 平台识别 ---------- */
const HOSTS = [
  [/xiaohongshu\.com|xhslink\.com/i, "xhs"],
  [/douyin\.com|iesdouyin\.com|v\.douyin/i, "douyin"],
  [/meituan\.com|meituan\.net|dianping\.com|m\.dianping/i, "meituan"],
  [/elem\.me|ele\.me/i, "eleme"],
];

export function detectPlatform(text) {
  const s = String(text || "");
  for (const [re, key] of HOSTS) {
    if (re.test(s)) return key === "eleme" ? "eleme" : key;
  }
  if (/小红书/.test(s)) return "xhs";
  if (/抖音/.test(s)) return "douyin";
  if (/大众点评|点评/.test(s)) return "dianping";
  if (/美团/.test(s)) return "meituan";
  if (/饿了么/.test(s)) return "eleme";
  return "manual";
}

export function extractUrl(text) {
  const m = String(text || "").match(/https?:\/\/[^\s，。；、】)）"'<>【】|]+/);
  if (!m) return "";
  return m[0].replace(/[.,;:!?]+$/, "");
}

/* ---------- 文本清洗 ---------- */
function normalize(raw) {
  return String(raw || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0|\u3000/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[ \t]+/g, " ");
}

const NOISE_LINE = [
  /^https?:\/\//i,
  /^(复制|打开|去|下载|点击|查看|关注|收藏|点赞|评论|分享|转发|扫码)/,
  /^[0-9.]+\s*(复制|打开|看看)/,
  /^(小红书|抖音|美团|大众点评|饿了么)\s*(App|APP|app)?\s*$/,
  /^\d[\d.,]*\s*(人|次|w|W|万)?\s*(看过|浏览|点赞|收藏|分享|播放)/,
  /^(发布了|笔记|视频|图文|分享自|来自|via|by)\b/i,
  /^[\s\-—–_=*·.,;:!?~]+$/,
  /^(展开|收起|更多|全文|查看全文)/,
  // 截图/笔记里常见的界面噪声
  /^(展开|收起)?\s*\d+\s*条评论/,
  /^\d+(\.\d+)?\s*(万|w|W)?\s*(赞|点赞|收藏|评论|分享)$/,
  /^(编辑于|发布于|IP属地|同款|猜你喜欢|相关推荐|广告)/,
  /^(@|＠)\S{1,20}\s*$/,
  // 纯话题标签行 / 日期地点 / 评论提示 / 按钮占位
  /^(\s*#[^\s#]+)+\s*$/,
  /^\d{1,2}\s*月\s*\d{1,2}\s*日/,
  /^共\s*\d+\s*条评论/,
  /^(说点什么|不喜欢|回复|查看更多|写评论)/,
];

function isNoise(line) {
  const s = String(line || "").trim();
  if (!s) return true;
  return NOISE_LINE.some((re) => re.test(s));
}

/* 抖音/小红书常见的标题尾巴营销词，如「可乐鸡翅这样做太香了」 */
const MARKETING_TAIL = [
  /[，,、]?\s*这样(做|吃|弄)(才|太|真|超|巨)?(香|好吃|下饭|对|简单|快)?$/,
  /(太|超|巨|真|特别|非常|比外卖还)(香|好吃|下饭|上头|简单|快手|解馋|香迷糊)(了|啦|啊|呀|哦|呢)?$/,
  /(零失败|一学就会|新手也?能?(做|会)|懒人(版|必备)?|全家(都)?(爱|抢)|巨(简单|好吃)|yyds)$/i,
  /(这样做|这样吃|这样做才对|这样做才好吃|赶紧试试|安排上)$/,
];

function trimMarketing(s) {
  let out = String(s || "").replace(/[！!。.~～，,、\s]+$/g, "").trim();
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 8) {
    changed = false;
    for (const re of MARKETING_TAIL) {
      const next = out.replace(re, "").replace(/[！!。.~～，,、\s]+$/g, "").trim();
      if (next !== out && next.length >= 2) {
        out = next;
        changed = true;
      }
    }
  }
  return out;
}

function stripDecor(s) {
  return String(s || "")
    .replace(/^[0-9]+[\uFE0F\u20E3]+\s*/g, "")  // 2⃣️ 这类 keycap 编号
    .replace(/https?:\/\/\S+/gi, "")               // 链接
    .replace(/#\s*[^\s#，,。、]{1,20}/g, "")       // 话题标签（# 后可能有空格）
    .replace(/@[^\s@，,。、]{1,20}/g, "")          // @某人
    .replace(/[|｜]\s*(小红书|抖音|美团|大众点评|饿了么)[^|]*$/g, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")               // 前导符号/emoji
    .replace(/[^\p{L}\p{N}）)】]+$/u, "")          // 尾部符号
    .replace(/的?(做法|教程|食谱|菜谱|做法大全|vlog|Vlog|VLOG)$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ---------- 菜名 ---------- */
function pickTitle(lines, platform) {
  const candidates = [];
  lines.forEach((line, idx) => {
    let s = line;

    // 抖音："看看【@某某的作品】可乐鸡翅这样做太香了！"
    const bracket = s.match(/【([^】]{0,30})】\s*(.+)?/);
    if (bracket) {
      const after = trimMarketing(stripDecor(bracket[2] || ""));
      const inside = bracket[1].replace(/^@|的作品$|^作者[:：]/g, "").trim();
      if (after && after.length >= 2) candidates.push({ text: after, score: 90 - idx });
      else if (inside && !/作品|用户|作者/.test(inside)) candidates.push({ text: inside, score: 70 - idx });
      return;
    }
    if (isNoise(s)) return;
    // 截图顶部的状态栏/界面文字（"3:54"、"图 3" 之类）
    if (/^\d{1,2}:\d{2}/.test(s)) return;
    if (/^[\d\s:：%A-Za-z._\-|]+$/.test(s)) return;
    // 至少要有一个以上汉字
    if ((s.match(/[\u4e00-\u9fa5]/g) || []).length < 2) return;
    // 跳过小标题行
    if (/^(用料|食材|材料|配料|主料|辅料|原料|做法|步骤|制作|教程)/.test(s)) return;
    // 跳过步骤行：以 1~2 位编号开头（"2 荆条和小米辣在锅中煸炒出虎皮"）几乎总是步骤
    if (/^\s*\d{1,2}\s*[.、:：)）]?\s/.test(s)) return;
    // 以烹饪动词开头的短句也当步骤
    if (/^(炒|煮|煸|煎|炸|蒸|炖|烤|焖|拌|切|倒|加|放|撒|淋|热锅|起锅|锅中|碗中|下锅|捞出|装盘)/.test(s)) return;
    // 含烹饪动作且较长 → 是步骤不是菜名（"香煎鸡排"这种 4 字菜名不受影响）
    if (s.length > 8 && COOK_VERB.test(s)) return;

    s = trimMarketing(stripDecor(s));
    if (!s || s.length < 2) return;
    if (s.length > 46) return;

    let score = 50 - idx;
    if (/[\u4e00-\u9fa5]/.test(s)) score += 10;
    if (s.length >= 3 && s.length <= 18) score += 8;
    if (/菜|饭|面|汤|肉|鱼|虾|鸡|蛋|锅|饼|包|粥|煲|炒|蒸|烤|拌|煮/.test(s)) score += 6;
    if (/^(今天|分享|推荐|周末|懒人|一看就会|好吃)/.test(s)) score -= 6;
    if (platform === "douyin" && /太香|好吃|绝了|必学/.test(s)) score -= 4;
    candidates.push({ text: s, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return "";
  return best.text.replace(/[，,。.!！?？~～]+$/, "").slice(0, 30);
}

/* ---------- 分区小标题清理 ---------- */
function stripSectionLabel(line) {
  return String(line || "")
    .replace(/^(主料|辅料|配料|调料|食材|用料|材料|所需材料|所需食材|原料|其他)[：:]\s*/, "")
    .trim();
}

/* ---------- 食材 ---------- */
function splitItems(blob) {
  return String(blob || "")
    .split(/[\n、，,；;／/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 40);
}

function pickIngredients(lines) {
  const startRe = /^(用料|食材|材料|所需材料|所需食材|配料|主料|辅料|原料)[：:\s]/;
  let start = -1;
  let inlineRest = "";
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    const m = s.match(startRe);
    if (m) {
      start = i;
      inlineRest = s.slice(m[0].length).trim();
      break;
    }
  }

  let blob = "";
  if (start >= 0) {
    const endRe = /^(做法|步骤|制作方法|制作步骤|做法步骤|操作步骤|烹饪步骤|教程|怎么做|开始做)/;
    const parts = [];
    if (inlineRest) parts.push(inlineRest);
    for (let i = start + 1; i < lines.length; i++) {
      if (endRe.test(lines[i])) break;
      if (isNoise(lines[i])) continue;
      parts.push(lines[i]);
    }
    blob = parts.join("\n");
  } else {
    // 兜底：找"、"最多的一行
    let best = "";
    for (const s of lines) {
      if (isNoise(s)) continue;
      const n = (s.match(/[、，,]/g) || []).length;
      if (n >= 2 && s.length > best.length) best = s;
    }
    blob = best;
  }

  if (!blob) return [];

  const out = [];
  for (const rawLine of blob.split("\n")) {
    const line = stripSectionLabel(rawLine);
    if (!line) continue;
    for (const item of splitItems(line)) {
      const ing = makeIngredient(item);
      if (!ing) continue;
      if (ing.name.length > 16) continue;
      if (out.some((x) => x.name === ing.name)) {
        // 同名合并数量
        const prev = out.find((x) => x.name === ing.name);
        if (typeof prev.qty === "number" && typeof ing.qty === "number" && prev.unit === ing.unit) {
          prev.qty += ing.qty;
        }
        continue;
      }
      out.push(ing);
    }
  }
  return out.slice(0, 40);
}

/* ---------- 步骤 ---------- */
function pickSteps(lines) {
  const startRe = /^(做法|步骤|制作方法|制作步骤|做法步骤|操作步骤|烹饪步骤|教程|怎么做|开始做|小贴士|注意事项|提示)[：:\s]?/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];

  const buf = [];
  const first = lines[start].replace(startRe, "").trim();
  if (first && !/^[：:]?$/.test(first)) buf.push(first);
  for (let i = start + 1; i < lines.length; i++) {
    if (isNoise(lines[i])) continue;
    buf.push(lines[i]);
  }
  if (!buf.length) return [];

  let text = buf.join("\n");

  // 编号切分：同时支持 "1." "①" "第一步" 形式
  const hasNumbering = /(^|\n)\s*(?:第?\s*[一二三四五六七八九十\d]+\s*[步.、::：)）]|[\u2460-\u2473])/.test(text);
  let chunks = [];

  if (hasNumbering) {
    const normalized = text.replace(
      /(?:^|\n)\s*(?:第\s*([一二三四五六七八九十\d]+)\s*步|([①②③④⑤⑥⑦⑧⑨⑩⑪⑫])|(\d+)\s*[.、:：)）])\s*/g,
      "\n@@"
    );
    chunks = normalized.split("@@").map((s) => s.replace(/\n+/g, " ").trim()).filter(Boolean);
  } else {
    // 无编号：按行切；若只有一行，按句号切
    if (buf.length > 1) {
      chunks = buf;
    } else {
      chunks = text.split(/[。；;]\s*/);
    }
  }

  const steps = [];
  for (let i = 0; i < chunks.length; i++) {
    let s = String(chunks[i] || "")
      .replace(/^(?:第\s*[一二三四五六七八九十\d]+\s*步|[\u2460-\u2473]|\d+\s*[.、:：)）])\s*/, "")
      .replace(/^[\s\-—–·•*]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length < 2) continue;
    if (s.length > 400) s = s.slice(0, 400) + "…";
    let minutes = null;
    const mm = s.match(/(\d{1,3})\s*(?:分钟|min|mins|minutes)/i);
    if (mm) minutes = Math.min(240, Number(mm[1]));
    steps.push({ text: s, minutes });
  }
  return steps.slice(0, 30);
}

/* ============================================================
   兜底通道：按语义逐句分类（应对 OCR / 无小标题的整段文本）
   ------------------------------------------------------------
   截图识别经常把「用料」识别成别的字、也没有换行，
   这时只靠小标题就会把整段做法塞进食材里。
   这里改用"句子特征"判断：
     · 带编号开头 / 含烹饪动词 / 句子够长  → 步骤
     · 短、无动词、长得像"名称+数量"        → 食材
   ============================================================ */

/** 烹饪动作词：出现即大概率是步骤 */
const COOK_VERB = new RegExp(
  [
    "炒", "煮", "煎", "炸", "蒸", "炖", "烤", "焖", "拌", "切", "剁", "倒", "淋", "撒",
    "翻", "盛", "捞", "放入", "加入", "下锅", "起锅", "热锅", "锅中", "转小", "转中", "转大",
    "小火", "中火", "大火", "泡发", "洗净", "焯", "腌制", "抓匀", "调匀", "拌匀", "装盘",
    "备用", "按压", "煸", "剥", "拍破", "封上", "铺", "盖", "焖煮", "收汁", "出锅", "摆盘",
  ].join("|")
);

/** 粗切：按行 + 按句号/分号 + 按行内编号 */
export function smartSplit(text) {
  const out = [];
  const push = (s) => {
    const t = String(s || "").trim();
    if (t) out.push(t);
  };
  for (const rawLine of String(text || "").split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.length <= 26) {
      push(line);
      continue;
    }
    // 长行先按句末标点断
    for (const sentence of line.split(/(?<=[。！？；!?;])/)) {
      const s = sentence.trim();
      if (!s) continue;
      if (s.length <= 26) {
        push(s);
        continue;
      }
      // 再按行内编号断（"1.xxx 2.xxx"）
      for (const part of s.split(/(?=\d{1,2}\s*[.、:：)）]\s*)/)) push(part);
    }
  }
  return out;
}

function stripListMark(s) {
  return String(s || "")
    .replace(/^[\s·•\-—*]+/, "")
    .replace(/^[0-9]+[\uFE0F\u20E3]+\s*/, "")
    .replace(/^\d{1,2}\s*[.、:：)）]\s*/, "")
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "")
    .trim();
}

export function looksLikeStep(s) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (/^\d{1,2}\s*[.、:：)）]/.test(t)) return true;
  if (COOK_VERB.test(t)) return true;
  if (t.replace(/\s/g, "").length >= 20) return true;
  return false;
}

function looksLikeIngredient(s) {
  const t = stripListMark(s);
  if (!t) return false;
  if (looksLikeStep(t)) return false;
  return t.replace(/\s/g, "").length <= 14;
}

/**
 * 语义分类：返回 { ingredients:[字符串], steps:[字符串] }
 */
export function classifySegments(text) {
  const segs = smartSplit(text);
  const ingredients = [];
  const steps = [];
  let mode = null; // "ing" | "step" | null

  const takeIng = (s) => {
    const t = stripListMark(s).replace(/^(用料|食材|材料|所需材料|所需食材|配料|主料|辅料|原料)[：:\s]*/, "");
    if (!t) return false;
    let pieces = t.split(/[、，,；;／/]+/);
    // OCR 常把食材用空格隔开而不是顿号
    if (pieces.length === 1 && t.replace(/\s/g, "").length > 12) {
      pieces = t.split(/\s+/);
    }
    let added = 0;
    for (const piece of pieces) {
      const v = String(piece || "").trim();
      if (!v || v.length > 14) continue;
      if (looksLikeStep(v)) continue;
      ingredients.push(v);
      added++;
    }
    return added > 0;
  };

  for (const seg of segs) {
    // 先丢掉界面噪声（状态栏时间、纯字母数字行、点赞数等）
    if (isNoise(seg)) continue;
    if (/^\d{1,2}:\d{2}/.test(seg)) continue;
    if (/^[\d\s:：%A-Za-z._\-|/]+$/.test(seg)) continue;
    // 分区标题（可能出现在行首也可能独立成行）
    if (/^(用料|食材|材料|所需材料|所需食材|配料|主料|辅料|原料)[：:\s]?/.test(seg)) {
      mode = "ing";
      const rest = seg.replace(/^(用料|食材|材料|所需材料|所需食材|配料|主料|辅料|原料)[：:\s]*/, "");
      if (rest) takeIng(rest);
      continue;
    }
    if (/^(做法|步骤|制作方法|制作步骤|做法步骤|操作步骤|烹饪步骤|小贴士|注意事项|提示)[：:\s]?/.test(seg)) {
      mode = "step";
      const rest = seg.replace(/^(做法|步骤|制作方法|制作步骤|做法步骤|操作步骤|烹饪步骤|小贴士|注意事项|提示)[：:\s]*/, "");
      if (rest && rest.length > 4) steps.push(rest);
      continue;
    }
    if (mode === "ing") {
      if (looksLikeStep(seg)) {
        steps.push(stripListMark(seg));
        mode = "step";
      } else takeIng(seg);
      continue;
    }
    if (mode === "step") {
      const t = stripListMark(seg);
      if (t) steps.push(t);
      continue;
    }
    // 还没遇到分区：靠特征猜
    if (looksLikeStep(seg)) steps.push(stripListMark(seg));
    else if (looksLikeIngredient(seg)) takeIng(seg);
  }

  return {
    ingredients: Array.from(new Set(ingredients.map((s) => s.trim()).filter(Boolean))).slice(0, 30),
    steps: steps.map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 25),
  };
}

/* ============================================================
   分区状态机：按「食材 / 调料 / 步骤」逐行推进
   ------------------------------------------------------------
   真实笔记常见写法（截图 OCR 也是这个结构）：
     超级下饭的烧椒排骨
     食材：排骨、螺丝椒（小米辣可以不用）
     调料：蒜、青红花椒、老姜…
     1：排骨清水把血水冲洗干净…
     2 制作烧椒：…
   关键：步骤不一定有「做法」两个字，编号开头就算。
   ============================================================ */

const ING_SECTION_RE =
  /^(食材|用料|材料|所需材料|所需食材|配料|主料|辅料|原料|调料|调味料|佐料|调味|腌料)[：:\s]/;
const STEP_SECTION_RE =
  /^(做法|步骤|制作方法|制作步骤|做法步骤|操作步骤|烹饪步骤|小贴士|注意事项|提示|教程)[：:\s]/;

/** "1：" "2." "3、" "2 制作烧椒" 都算步骤开头 */
function isStepStart(line) {
  const s = String(line || "").trim();
  if (/^[0-9]{1,2}\s*[:：、.）)]\s*\S/.test(s)) return true;
  if (/^[0-9]{1,2}\s+\S/.test(s)) return true;
  if (/^[①②③④⑤⑥⑦⑧⑨⑩]\s*\S/.test(s)) return true;
  return false;
}

/** 去掉括号补充说明，并拆成多条食材 */
function splitIngredientText(text) {
  const cleaned = String(text || "")
    .replace(/[（(][^）)]*[）)]/g, "") // （小米辣可以不用，我吃的辣）
    .replace(/^[\s·•\-—*、，,]+/, "")
    .trim();
  if (!cleaned) return [];
  let pieces = cleaned.split(/[、，,；;／/]+/);
  if (pieces.length === 1 && cleaned.replace(/\s/g, "").length > 12) {
    pieces = cleaned.split(/\s+/);
  }
  return pieces.map((p) => p.trim()).filter((p) => p && p.length <= 14 && !looksLikeStep(p));
}

function cleanStepText(text) {
  return String(text || "")
    .replace(/^\s*[0-9]{1,2}\s*[:：、.）)]\s*/, "")
    .replace(/^\s*[0-9]{1,2}\s+/, "") // "2 制作烧椒：" 这种空格编号
    .replace(/^\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "")
    .replace(/^[\s·•\-—*]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 结构化解析：返回 { title, ingredients:[字符串], steps:[字符串] } */
export function parseSections(lines) {
  const ingredients = [];
  const steps = [];
  const titleCandidates = [];
  let mode = null;
  let firstSectionAt = -1;

  lines.forEach((raw, idx) => {
    const line = String(raw || "").trim();
    if (!line) return;
    if (isNoise(line)) return;
    if (/^\d{1,2}:\d{2}/.test(line)) return; // 状态栏时间
    if (/^[\d\s:：%A-Za-z._\-|/]+$/.test(line)) return; // 纯字母数字行
    if (/^\d+\s*(条评论)?$/.test(line)) return;

    const ingM = line.match(ING_SECTION_RE);
    if (ingM) {
      if (firstSectionAt < 0) firstSectionAt = idx;
      mode = "ing";
      const rest = line.slice(ingM[0].length);
      if (rest) ingredients.push(...splitIngredientText(rest));
      return;
    }
    const stepM = line.match(STEP_SECTION_RE);
    if (stepM) {
      if (firstSectionAt < 0) firstSectionAt = idx;
      mode = "step";
      const rest = line.slice(stepM[0].length);
      if (rest.length > 2) steps.push(cleanStepText(rest));
      return;
    }
    if (isStepStart(line)) {
      if (firstSectionAt < 0) firstSectionAt = idx;
      mode = "step";
      steps.push(cleanStepText(line));
      return;
    }

    if (mode === "ing") {
      // 食材段里冒出长句 + 烹饪动作 → 其实已经进到做法了
      const compact = line.replace(/\s/g, "");
      if (COOK_VERB.test(line) && compact.length > 12) {
        mode = "step";
        steps.push(cleanStepText(line));
        return;
      }
      ingredients.push(...splitIngredientText(line));
      return;
    }
    if (mode === "step") {
      const t = cleanStepText(line);
      if (t.length >= 2) steps.push(t);
      return;
    }
    titleCandidates.push({ text: stripDecor(line), idx });
  });

  // 标题：优先取「第一个分区前 1~4 行」里最像菜名的一句
  const near = titleCandidates.filter(
    (c) => firstSectionAt < 0 || (c.idx >= firstSectionAt - 4 && c.idx < firstSectionAt)
  );
  const pool = near.length ? near : titleCandidates;
  const scored = pool
    .map((c) => {
      let s = 0;
      if (/菜|饭|面|汤|肉|鱼|虾|鸡|蛋|锅|饼|包|粥|煲|炒|蒸|烤|拌|煮|排骨|豆腐|丸子/.test(c.text)) s += 10;
      if (c.text.length >= 3 && c.text.length <= 16) s += 6;
      if (s > 0) s += Math.max(0, 6 - Math.abs(c.text.length - 8));
      return { ...c, s };
    })
    .sort((a, b) => b.s - a.s);

  return {
    title: scored.length && scored[0].s >= 8 ? scored[0].text : "",
    ingredients: Array.from(new Set(ingredients)),
    steps,
  };
}

function pickServings(text) {
  const m = String(text).match(/(\d{1,2})\s*(?:人份|个人|人吃|人食)/);
  if (m) return `${m[1]} 人份`;
  if (/一人食|单人/.test(text)) return "1 人份";
  if (/两人|双人/.test(text)) return "2 人份";
  return "";
}

function pickCookMinutes(text) {
  const s = String(text);
  if (/一个半小时/.test(s)) return 90;
  if (/半小时/.test(s)) return 30;
  if (/一小时|1\s*小时/.test(s)) return 60;
  const m = s.match(/(\d{1,3})\s*(?:分钟|min|mins)/i);
  if (m) {
    const v = Number(m[1]);
    if (v >= 3 && v <= 300) return v;
  }
  return null;
}

function guessCuisine(title, text) {
  const s = `${title} ${text}`;
  if (/川|麻辣|水煮|回锅|宫保|辣子|麻婆|湘|剁椒|小炒肉/.test(s)) return "川湘";
  if (/煲|炖|汤|羹|砂锅/.test(s)) return "汤羹";
  if (/沙拉|凉拌|拌菜|刺身/.test(s)) return "凉菜";
  if (/蛋糕|面包|饼干|吐司|布丁|芝士焗|烤箱|烘焙/.test(s)) return "烘焙";
  if (/意面|披萨|牛排|奶油蘑菇|西式/.test(s)) return "西式";
  if (/炒饭|拌面|炒面|盖饭|饺子|馒头|粥/.test(s)) return "主食";
  if (/蒜蓉|白灼|清蒸|豉汁|广式|粤/.test(s)) return "粤式";
  if (/分钟|快手|懒人|一锅出|十分钟/.test(s)) return "快手";
  return "家常";
}

/* ============================================================
   主入口：解析菜谱分享文案
   ============================================================ */
export function parseRecipe(raw) {
  const text = normalize(raw);
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const platform = detectPlatform(text);
  const url = extractUrl(text);

  // ① 先走分区状态机：对「食材/调料/1：…」这种笔记结构最准
  const sec = parseSections(lines);
  const secIngs = sec.ingredients.map((l) => makeIngredient(l)).filter(Boolean);
  const stepMinutes = (t) => {
    const mm = t.match(/(\d{1,3})\s*(?:分钟|min)/i);
    return mm ? Math.min(240, Number(mm[1])) : null;
  };
  const secSteps = sec.steps.map((t) => ({ text: t, minutes: stepMinutes(t) }));

  // ② 老的分区标记法作为补充（分享文案里更常见）
  let ingredients = secIngs.length ? secIngs : pickIngredients(lines);
  let steps = secSteps.length ? secSteps : pickSteps(lines);
  const title = sec.title || pickTitle(lines, platform);

  // ---- 兜底：小标题缺失（OCR 常见）时按语义重新切分 ----
  // 触发条件：没有步骤 / 步骤异常少 / 食材多到不合理 / 食材里混进了做法句子
  const segs = smartSplit(text);
  const substantial = segs.length >= 3 || text.length >= 60;
  const dirtyIngredients = ingredients.some((i) => COOK_VERB.test(String(i.name || "")) && String(i.name).length > 5);
  const degenerate =
    substantial && (steps.length === 0 || steps.length <= 1 || ingredients.length > 18 || dirtyIngredients);

  if (degenerate) {
    const c = classifySegments(text);
    if (c.steps.length > steps.length) {
      steps = c.steps.map((t) => {
        let minutes = null;
        const mm = t.match(/(\d{1,3})\s*(?:分钟|min)/i);
        if (mm) minutes = Math.min(240, Number(mm[1]));
        return { text: t, minutes };
      });
    }
    if (c.ingredients.length > ingredients.length) {
      const rebuilt = c.ingredients.map((line) => makeIngredient(line)).filter(Boolean);
      if (rebuilt.length > ingredients.length) ingredients = rebuilt;
    }
  }

  const joined = text;
  const cookMinutes = pickCookMinutes(joined);
  const servings = pickServings(joined);

  let cuisine = guessCuisine(title, joined);
  if (!CUISINES.includes(cuisine)) cuisine = "家常";
  if (!cookMinutes && cuisine === "家常" && /分钟|快手|懒人/.test(joined) === false) {
    // 保守：没依据就不猜时长
  }

  return {
    title: title || "",
    emoji: guessDishEmoji(title || ""),
    cuisine,
    servings,
    cook_minutes: cookMinutes || null,
    difficulty: steps.length > 8 || ingredients.length > 12 ? "中等" : "简单",
    ingredients,
    steps,
    source_url: url,
    source_platform: platform,
    note: "",
    confidence: {
      title: !!title,
      ingredients: ingredients.length,
      steps: steps.length,
      level: ingredients.length >= 3 && steps.length >= 2 ? "high" : title ? "medium" : "low",
    },
    raw: text.slice(0, 4000),
  };
}

/* ============================================================
   主入口：解析餐厅分享文案
   ============================================================ */
export function parseRestaurant(raw) {
  const text = normalize(raw);
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const platform = detectPlatform(text);
  const url = extractUrl(text);

  /* 店名 */
  let name = "";
  const bm = text.match(/【([^】]{2,30})】/);
  if (bm && !/作品|用户|作者/.test(bm[1])) name = bm[1].trim();
  if (!name) {
    const nm = text.match(/(?:店名|店铺名称|店铺|餐厅|商家|商户)[：:\s]\s*([^\n，,。；;]{2,30})/);
    if (nm) name = nm[1].trim();
  }
  if (!name) {
    for (const line of lines) {
      if (isNoise(line)) continue;
      if (/^(人均|地址|电话|营业|评分|距离|推荐|特色|优惠)/.test(line)) continue;
      const s = stripDecor(line.replace(/[【】“”"「」]/g, ""));
      if (s.length >= 2 && s.length <= 24) {
        name = s;
        break;
      }
    }
  }
  name = String(name || "")
    .replace(/^[【\[（(“"']+|[】\]）)”"']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  /* 人均 */
  let avgPrice = null;
  const p1 = text.match(/人均[^\d¥￥]{0,6}[¥￥]?\s*(\d{1,5}(?:\.\d{1,2})?)/);
  const p2 = text.match(/[¥￥]\s*(\d{1,5}(?:\.\d{1,2})?)\s*\/?\s*人/);
  const p3 = text.match(/(\d{1,5}(?:\.\d{1,2})?)\s*元?\s*\/\s*人/);
  const pm = p1 || p2 || p3;
  if (pm) avgPrice = Number(pm[1]);

  /* 地址 */
  let address = "";
  const am = text.match(/(?:地址|位置|地点|位于)[：:\s]\s*([^\n]{4,80})/);
  if (am) address = am[1].replace(/[，,。；;]$/, "").trim();
  if (!address) {
    const am2 = text.match(/([\u4e00-\u9fa5]{2,10}(?:路|街|道|巷|大道)[\u4e00-\u9fa5\d]{0,4}\d*号?[\u4e00-\u9fa5\d]{0,20})/);
    if (am2) address = am2[1];
  }

  /* 品类 */
  let cuisine = "其他";
  const pool = `${name} ${text}`;
  for (const c of REST_CUISINES) {
    if (c === "其他") continue;
    if (pool.includes(c)) {
      cuisine = c;
      break;
    }
  }

  /* 外卖字段 */
  let deliveryFee = null;
  const df = text.match(/配送费[^\d]{0,4}(\d{1,4}(?:\.\d{1,2})?)/);
  if (df) deliveryFee = Number(df[1]);
  let etaMinutes = null;
  const em = text.match(/(\d{1,3})\s*分钟/);
  if (em) etaMinutes = Number(em[1]);

  /* 标签 */
  const tags = Array.from(text.matchAll(/#([^\s#，,。、]{1,16})/g)).map((m) => m[1]).slice(0, 6);

  /* 评分 */
  let rating = null;
  const rm = text.match(/(?:评分|评价)[^\d]{0,4}(\d(?:\.\d)?)\s*(?:分)?/);
  if (rm) rating = Number(rm[1]);

  return {
    name: name || "",
    platform,
    cuisine,
    avg_price: avgPrice,
    address,
    link: url,
    delivery_fee: deliveryFee,
    eta_minutes: etaMinutes,
    tags,
    rating,
    confidence: {
      name: !!name,
      price: avgPrice !== null,
      address: !!address,
      level: name && (avgPrice !== null || address) ? "high" : name ? "medium" : "low",
    },
    raw: text.slice(0, 4000),
  };
}
