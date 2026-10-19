/* ============================================================
   饭来 · 数据字典（枚举、分类、关键词）
   ============================================================ */

export const ROLES = {
  chef: {
    key: "chef",
    label: "大厨",
    emoji: "👨‍🍳",
    desc: "做饭的人。接单、买菜、下厨。",
    defaultNick: "大厨",
  },
  diner: {
    key: "diner",
    label: "食客",
    emoji: "🙋",
    desc: "吃饭的人。点菜、提要求、等开饭。",
    defaultNick: "食客",
  },
};

export const MEALS = [
  { key: "breakfast", label: "早餐", emoji: "🌅", time: "07:30" },
  { key: "lunch", label: "午餐", emoji: "🍚", time: "12:00" },
  { key: "dinner", label: "晚餐", emoji: "🌙", time: "18:30" },
];

export const MEAL_KEYS = MEALS.map((m) => m.key);

export function mealOf(key) {
  return MEALS.find((m) => m.key === key) || MEALS[2];
}

export function mealLabel(key) {
  return mealOf(key).label;
}

export function mealEmoji(key) {
  return mealOf(key).emoji;
}

/* ---------- 食材分区 ---------- */
export const ING_CATS = ["肉禽", "水产", "蔬果", "蛋奶", "主食", "调料", "其他"];

export const CAT_EMOJI = {
  肉禽: "🥩",
  水产: "🐟",
  蔬果: "🥬",
  蛋奶: "🥚",
  主食: "🍚",
  调料: "🧂",
  其他: "🧺",
};

const CAT_WORDS = {
  肉禽: [
    "猪", "牛", "羊", "鸡", "鸭", "鹅", "排骨", "五花", "里脊", "肉", "腿", "翅", "掌", "肝",
    "肚", "肠", "腩", "腊肉", "火腿", "培根", "香肠", "午餐肉", "肥牛", "肉末", "肉馅", "鸡胸",
    "鸡腿", "鸡爪", "鸡翅", "牛腩", "牛柳", "培根", "毛肚", "黄喉", "腰花", "肥肠",
  ],
  水产: [
    "鱼", "虾", "蟹", "贝", "蛤", "蚝", "鱿", "墨鱼", "海参", "鲍", "螺蛳", "田螺", "海螺", "花螺",
    "海带", "紫菜", "海苔", "虾仁", "鱼片", "带鱼", "黄鱼", "鲈鱼", "三文鱼", "龙利鱼", "扇贝", "蛏子",
  ],
  蔬果: [
    "菜", "葱", "姜", "蒜", "椒", "瓜", "茄", "豆", "菇", "笋", "萝卜", "土豆", "番茄",
    "西红柿", "洋葱", "芹", "韭", "菠菜", "生菜", "白菜", "油菜", "西兰花", "花菜", "藕",
    "莲藕", "山药", "玉米", "南瓜", "冬瓜", "黄瓜", "苦瓜", "丝瓜", "木耳", "银耳", "香菇",
    "金针菇", "杏鲍菇", "口蘑", "平菇", "香椿", "香菜", "薄荷", "柠檬", "苹果", "香蕉",
    "橙", "梨", "莓", "葡萄", "桃", "芒果", "牛油果", "紫甘蓝", "卷心菜", "豆芽", "豌豆",
    "青豆", "秋葵", "芦笋", "空心菜", "苋菜", "茼蒿", "莴笋", "荸荠", "茭白", "蒜苗", "青蒜",
  ],
  蛋奶: ["蛋", "奶", "芝士", "黄油", "奶油", "酸奶", "奶酪", "淡奶油", "马苏里拉", "豆浆", "豆腐"],
  主食: [
    "米", "面", "粉", "馒头", "面包", "饺子皮", "馄饨皮", "饼", "年糕", "粉丝", "粉条",
    "意面", "通心粉", "燕麦", "藜麦", "玉米面", "糯米", "小米", "吐司", "河粉", "米线",
    "挂面", "乌冬", "饺子", "馄饨", "汤圆", "春卷皮",
  ],
  调料: [
    "油", "盐", "糖", "醋", "酱", "料酒", "蚝油", "淀粉", "胡椒", "花椒", "八角", "桂皮",
    "香叶", "干辣椒", "辣椒粉", "孜然", "咖喱", "味精", "鸡精", "蜂蜜", "蚝", "生抽", "老抽",
    "豆瓣", "甜面酱", "蒜蓉酱", "番茄酱", "沙拉酱", "芝麻", "香油", "白酒", "啤酒", "可乐",
    "苏打", "酵母", "泡打粉", "五香粉", "椒盐", "腐乳", "豆豉", "榨菜", "陈皮", "香草",
  ],
};

export function inferIngCategory(name) {
  const n = String(name || "").replace(/\s/g, "");
  if (!n) return "其他";
  // 优先级：蛋奶 → 调料 → 水产 → 肉禽 → 主食 → 蔬果
  for (const cat of ["蛋奶", "调料", "水产", "肉禽", "主食", "蔬果"]) {
    for (const w of CAT_WORDS[cat]) {
      if (n.includes(w)) return cat;
    }
  }
  return "其他";
}

/* ---------- 菜谱 ---------- */
export const CUISINES = [
  "家常", "川湘", "粤式", "快手", "汤羹", "主食", "凉菜", "西式", "烘焙", "其他",
];

export const DIFFICULTIES = ["简单", "中等", "挑战"];

export const DISH_EMOJIS = [
  "🍳", "🥘", "🍜", "🍲", "🥗", "🍚", "🍝", "🥟", "🍤", "🍗",
  "🥩", "🍅", "🥕", "🌽", "🍆", "🥦", "🍄", "🐟", "🌶️", "🥚",
  "🍞", "🍰", "🥤", "🫕", "🧆", "🥙", "🍱", "🧄",
];

export const COOK_EMOJI_KEYWORDS = [
  [/汤|羹|煲|锅|炖|粥/, "🍲"],
  [/面|粉|米线|意面|拉面|拌面/, "🍜"],
  [/饺|包|馄饨|烧麦|馒头/, "🥟"],
  [/鸡|翅|腿|鸭/, "🍗"],
  [/牛|猪|排|肉|羊/, "🥩"],
  [/鱼|虾|蟹|海鲜/, "🍤"],
  [/蛋/, "🍳"],
  [/饭|炒饭|盖饭/, "🍚"],
  [/沙拉|拌|凉菜/, "🥗"],
  [/蛋糕|面包|甜|饼/, "🍰"],
  [/茶|饮|汁|奶/, "🥤"],
];

export function guessDishEmoji(title = "") {
  for (const [re, emoji] of COOK_EMOJI_KEYWORDS) {
    if (re.test(title)) return emoji;
  }
  return "🍳";
}

/* ---------- 餐厅 ---------- */
export const REST_CUISINES = [
  "火锅", "烤肉", "烧烤", "川菜", "湘菜", "粤菜", "日料", "韩餐", "西餐",
  "东南亚", "快餐", "小吃", "面馆", "甜品饮品", "其他",
];

export const PLATFORMS = {
  meituan: { key: "meituan", label: "美团", emoji: "🟡" },
  dianping: { key: "dianping", label: "大众点评", emoji: "🟠" },
  eleme: { key: "eleme", label: "饿了么", emoji: "🔵" },
  xhs: { key: "xhs", label: "小红书", emoji: "📕" },
  douyin: { key: "douyin", label: "抖音", emoji: "🎵" },
  manual: { key: "manual", label: "手动录入", emoji: "✍️" },
};

export function platformLabel(key) {
  return (PLATFORMS[key] || PLATFORMS.manual).label;
}

export const KINDS = {
  dine: { key: "dine", label: "外食", emoji: "🍽️", route: "dine" },
  takeout: { key: "takeout", label: "外卖", emoji: "🛵", route: "takeout" },
};

/* ---------- 状态文案 ---------- */
export const REQUEST_STATUS = {
  pending: { label: "待接单", cls: "pending" },
  accepted: { label: "已接单", cls: "accepted" },
  swapped: { label: "已换菜", cls: "swapped" },
  postponed: { label: "已推后", cls: "postponed" },
  rejected: { label: "已拒绝", cls: "rejected" },
  cancelled: { label: "已撤回", cls: "cancelled" },
};

export const PLAN_STATUS = {
  planned: { label: "待做", cls: "planned" },
  cooking: { label: "在做", cls: "cooking" },
  done: { label: "已做", cls: "done" },
  skipped: { label: "跳过", cls: "skipped" },
};

export const INVITE_STATUS = {
  pending: { label: "等 TA 确认", cls: "pending" },
  agreed: { label: "成了", cls: "agreed" },
  declined: { label: "不去了", cls: "declined" },
  cancelled: { label: "已取消", cls: "cancelled" },
};

export const PAYERS = {
  chef: { key: "chef", label: "大厨请" },
  diner: { key: "diner", label: "食客请" },
  split: { key: "split", label: "AA" },
  none: { key: "none", label: "没算钱" },
};
