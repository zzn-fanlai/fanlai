/* ============================================================
   饭来 · 食材：解析、归一、聚合
   ============================================================ */
import { inferIngCategory, ING_CATS } from "./catalog.js";

/** 单位别名 → 标准单位 */
const UNIT_ALIAS = {
  克: "g", 公克: "g", g: "g", G: "g", gram: "g",
  千克: "kg", 公斤: "kg", kg: "kg", KG: "kg",
  毫升: "ml", ml: "ml", ML: "ml",
  升: "l", L: "l",
  斤: "斤", 两: "两",
  个: "个", 枚: "个", 颗: "个",
  只: "只", 根: "根", 瓣: "瓣", 片: "片", 段: "段", 块: "块", 张: "张", 条: "条",
  粒: "粒", 把: "把", 碗: "碗", 杯: "杯", 勺: "勺", 汤匙: "勺", 大勺: "勺", 小勺: "小勺",
  茶匙: "茶匙", 小匙: "茶匙",
  包: "包", 袋: "袋", 盒: "盒", 罐: "罐", 瓶: "瓶",
};

/** 可换算的单位族（基准单位 → 倍率） */
const UNIT_FAMILY = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1000 },
};

const VAGUE_WORDS = ["适量", "少许", "若干", "少量", "一点点", "随意", "酌情", "按需", "看情况", "足量"];

/** 常见同义词归并，保证买菜清单不会出现"西红柿"和"番茄"两条 */
const NAME_ALIAS = new Map([
  ["西红柿", "番茄"],
  ["洋柿子", "番茄"],
  ["马铃薯", "土豆"],
  ["土豆仔", "土豆"],
  ["青葱", "葱"],
  ["小葱", "葱"],
  ["香葱", "葱"],
  ["生姜", "姜"],
  ["老姜", "姜"],
  ["大蒜", "蒜"],
  ["蒜头", "蒜"],
  ["蒜米", "蒜"],
  ["鸡子", "鸡蛋"],
  ["洋鸡蛋", "鸡蛋"],
  ["细砂糖", "糖"],
  ["白砂糖", "糖"],
  ["冰糖", "糖"],
  ["生抽酱油", "生抽"],
  ["老抽酱油", "老抽"],
  ["酱油", "生抽"],
  ["食盐", "盐"],
  ["食用油", "油"],
  ["花生油", "油"],
  ["玉米油", "油"],
  ["清水", "水"],
  ["温水", "水"],
  ["凉水", "水"],
  ["料酒黄酒", "料酒"],
  ["黄酒", "料酒"],
  ["生粉", "淀粉"],
  ["玉米淀粉", "淀粉"],
  ["土豆淀粉", "淀粉"],
  ["鸡精粉", "鸡精"],
]);

const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };

/** 去掉装饰性前缀 */
function cleanLine(line) {
  return String(line || "")
    .replace(/^[\s\u3000]+/, "")
    .replace(/^[•·※*\-–—+>·]+/, " ")
    .replace(/^[（(]\s*\d+\s*[)）]\s*/, "")
    .replace(/\s+$/, "")
    .trim();
}

function toNumber(tok) {
  if (tok === undefined || tok === null) return null;
  const s = String(tok).trim();
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (/^\d+\/\d+$/.test(s)) {
    const [a, b] = s.split("/").map(Number);
    return b ? a / b : null;
  }
  if (/^[一二两三四五六七八九十半]+$/.test(s)) {
    // 只处理 1-2 个字符的简单中文数字
    if (s.length === 1) return CN_NUM[s] ?? null;
    if (s === "十一") return 11;
    if (s === "十二") return 12;
    if (s.startsWith("十")) return 10 + (CN_NUM[s.slice(1)] ?? 0);
    if (s.endsWith("十")) return (CN_NUM[s[0]] ?? 0) * 10;
    return CN_NUM[s[0]] ?? null;
  }
  return null;
}

function normUnit(u) {
  if (!u) return "";
  const key = String(u).trim();
  return UNIT_ALIAS[key] ?? UNIT_ALIAS[key.toLowerCase()] ?? key;
}

/**
 * 解析一行食材，返回 { name, qty, unit, vague }
 * 支持："番茄2个" / "2个番茄" / "五花肉 300g" / "盐 适量" / "1/2 茶匙 白胡椒"
 */
export function parseIngredientLine(line) {
  const raw = cleanLine(line);
  if (!raw) return null;

  // 去掉尾部括号里的补充说明，例如 "（可选）"
  const text = raw.replace(/[（(](?:可选|按需|装饰用?|可不加)[)）]/g, "").trim();
  if (!text) return null;

  // 1) 模糊量词
  for (const w of VAGUE_WORDS) {
    if (text.includes(w)) {
      const name = text.replace(w, "").replace(/[：:，,、\s]+$/, "").trim();
      if (!name) continue;
      return { name, qty: w, unit: "", vague: true };
    }
  }

  // 2) 数字 + 单位（数字在前）
  const m1 = text.match(
    /^([\d.]+\s*\/\s*\d+|\d+(?:\.\d+)?|[一二两三四五六七八九十半]+)\s*(克|公克|千克|公斤|毫升|升|斤|两|个|枚|颗|只|根|瓣|片|段|块|张|条|粒|把|碗|杯|勺|汤匙|大勺|小勺|茶匙|小匙|包|袋|盒|罐|瓶|g|kg|ml|l|G|KG|ML|L)\s*(.*)$/
  );
  if (m1) {
    const value = toNumber(m1[1]);
    const unit = normUnit(m1[2]);
    let rest = (m1[3] || "").trim();
    // "2 个鸡蛋" → rest 即名称；"300g 五花肉" 同理
    rest = rest.replace(/^[的是]/, "").trim();
    if (rest && rest.length <= 30) {
      return { name: rest, qty: value, unit, vague: false };
    }
    // 数字在名称之后的情况会落到下面
  }

  // 3) 名称 + 数字单位（数字在后）
  const m2 = text.match(
    /^(.+?)\s*([\d.]+\s*\/\s*\d+|\d+(?:\.\d+)?|[一二两三四五六七八九十半]+)\s*(克|公克|千克|公斤|毫升|升|斤|两|个|枚|颗|只|根|瓣|片|段|块|张|条|粒|把|碗|杯|勺|汤匙|大勺|小勺|茶匙|小匙|包|袋|盒|罐|瓶|g|kg|ml|l|G|KG|ML|L)$/
  );
  if (m2) {
    const name = m2[1].replace(/[，,：:\s]+$/, "").trim();
    if (name) {
      return { name, qty: toNumber(m2[2]), unit: normUnit(m2[3]), vague: false };
    }
  }

  // 4) 完全无数量：整行当名称（去掉冒号与括号尾巴）
  const name = text.replace(/[：:]\s*$/, "").replace(/[（(].*?[)）]\s*$/, "").trim();
  if (!name) return null;
  return { name, qty: "", unit: "", vague: false };
}

export function normalizeIngName(name) {
  let n = String(name || "")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[（(].*?[)）]/g, "")
    .replace(/[，,。.、;；:：!！?？'"“”‘’]/g, "")
    .trim();
  if (!n) return "";
  const alias = NAME_ALIAS.get(n);
  if (alias) return alias;
  // 去掉"新鲜""本地""上好"等修饰前缀
  n = n.replace(/^(新鲜|本地|有机|优质|上好|土|嫩|老)/, "");
  return n || "";
}

/** 从一行文本构造结构化食材 */
export function makeIngredient(line) {
  const p = parseIngredientLine(line);
  if (!p) return null;
  const key = normalizeIngName(p.name);
  if (!key) return null;
  return {
    name: key,
    qty: p.qty,
    unit: p.unit,
    vague: !!p.vague,
    category: inferIngCategory(key),
  };
}

/** 展示用的数量文案 */
export function qtyText(ing) {
  if (!ing) return "";
  if (ing.vague) return ing.qty || "适量";
  if (ing.qty === "" || ing.qty === null || ing.qty === undefined) return "";
  if (typeof ing.qty !== "number") return String(ing.qty);
  const num = Number.isInteger(ing.qty) ? String(ing.qty) : String(Math.round(ing.qty * 100) / 100);
  return `${num}${ing.unit || ""}`;
}

/**
 * 聚合多道菜的食材 → 按分区输出
 * @param {Array<{dishTitle:string, ingredients:Array}>} sources
 * @returns {Array<{category, items:Array<{key,name,qtyText,parts:Array<{text,from}>}>}>}
 */
export function aggregateIngredients(sources) {
  /** @type {Map<string, {key,name,category,nums:Map<string,{value:number,unit:string}>,vague:Set<string>,parts:Array,from:Set<string>}>} */
  const map = new Map();

  for (const src of sources || []) {
    for (const raw of src.ingredients || []) {
      if (!raw) continue;
      const key = normalizeIngName(raw.name);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: key,
          category: raw.category || inferIngCategory(key),
          nums: new Map(),
          vague: new Set(),
          parts: [],
          from: new Set(),
        });
      }
      const node = map.get(key);
      if (src.dishTitle) node.from.add(src.dishTitle);

      const t = qtyText(raw);
      if (t && !node.parts.some((p) => p.text === t)) {
        node.parts.push({ text: t, from: src.dishTitle || "" });
      }

      if (raw.vague || (raw.qty === "" && !raw.unit) || typeof raw.qty !== "number") {
        if (t) node.vague.add(t);
        continue;
      }
      const unit = raw.unit || "";
      const fam = UNIT_FAMILY[unit];
      const bucketKey = fam ? fam.base : unit || "个";
      const value = fam ? raw.qty * fam.factor : raw.qty;
      const bucket = node.nums.get(bucketKey) || { value: 0, unit: bucketKey };
      bucket.value += value;
      node.nums.set(bucketKey, bucket);
    }
  }

  const out = [];
  for (const node of map.values()) {
    const parts = [];
    for (const [unit, bucket] of node.nums) {
      let v = bucket.value;
      let u = unit;
      if (unit === "g" && v >= 1000) {
        v = Math.round((v / 1000) * 10) / 10;
        u = "kg";
      } else if (unit === "ml" && v >= 1000) {
        v = Math.round((v / 1000) * 10) / 10;
        u = "l";
      } else {
        v = Math.round(v * 100) / 100;
      }
      parts.push(`${Number.isInteger(v) ? v : v}${u}`);
    }
    for (const v of node.vague) parts.push(v);
    if (!parts.length && node.parts.length) {
      parts.push(...node.parts.map((p) => p.text));
    }
    out.push({
      key: node.key,
      name: node.name,
      category: ING_CATS.includes(node.category) ? node.category : "其他",
      qtyText: parts.join(" + ") || "适量",
      parts: node.parts,
      from: Array.from(node.from),
    });
  }

  const order = new Map(ING_CATS.map((c, i) => [c, i]));
  out.sort((a, b) => {
    const ca = order.get(a.category) ?? 99;
    const cb = order.get(b.category) ?? 99;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  const groups = [];
  for (const item of out) {
    let g = groups.find((x) => x.category === item.category);
    if (!g) {
      g = { category: item.category, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

/** 稳定 key：房间 + 范围 + 食材 */
export function checkId(roomCode, scope, itemKey) {
  return `${roomCode}_${scope}_${itemKey}`;
}

/** 纯文本清单（用于复制） */
export function shoppingText(groups, title = "买菜清单") {
  const lines = [title, ""];
  for (const g of groups) {
    lines.push(`【${g.category}】`);
    for (const item of g.items) lines.push(`· ${item.name}  ${item.qtyText}`);
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}
