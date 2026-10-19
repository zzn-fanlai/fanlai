/* 饭来 · 演示数据种子（仅本地预览，绝不会覆盖线上数据）
 * 生效条件：localhost / 127.0.0.1 + URL 带 ?demo=1
 * 可选参数：&role=diner 以食客身份预览
 * 必须在 store.js 之前以普通脚本执行。
 */
(function () {
  "use strict";
  var KEY = "fanlai.v1";
  var host = location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  var params = new URLSearchParams(location.search);
  var demo = params.get("demo");
  if (!isLocal || demo !== "1") return;

  try {
    if (localStorage.getItem(KEY)) return; // 已有数据就不动
  } catch (e) {
    return;
  }

  var role = params.get("role") === "diner" ? "diner" : "chef";

  function iso(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function dayOffset(n) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  var NOW = Date.now();
  var T = dayOffset(0);

  function id(prefix, n) {
    return prefix + "_demo" + n;
  }
  function ing(name, qty, unit, cat) {
    return { name: name, qty: qty, unit: unit || "", category: cat };
  }
  function dishRow(o) {
    return Object.assign(
      {
        room_code: "482910",
        tags: [],
        source_url: "",
        source_platform: "manual",
        note: "",
        favorite: false,
        created_by: "dev_me",
        created_at: NOW - 86400000 * 5,
        updated_at: NOW - 86400000 * 5,
        updated_by: "dev_me",
        deleted: false,
      },
      o
    );
  }

  var dishes = [
    dishRow({
      id: id("dis", 1),
      title: "番茄炒蛋",
      emoji: "🍳",
      cuisine: "家常",
      servings: "2 人份",
      cook_minutes: 15,
      difficulty: "简单",
      favorite: true,
      ingredients: [
        ing("番茄", 2, "个", "蔬果"),
        ing("鸡蛋", 3, "个", "蛋奶"),
        ing("糖", 1, "勺", "调料"),
        ing("盐", "适量", "", "调料"),
        ing("食用油", 2, "勺", "调料"),
      ],
      steps: [
        { text: "番茄切块，鸡蛋打散加少许盐。", minutes: 3 },
        { text: "热锅倒油，倒入蛋液炒至凝固盛出。", minutes: 3 },
        { text: "余油下番茄炒出汁，加糖和盐。", minutes: 4 },
        { text: "倒回鸡蛋翻炒均匀出锅。", minutes: 2 },
      ],
    }),
    dishRow({
      id: id("dis", 2),
      title: "可乐鸡翅",
      emoji: "🍗",
      cuisine: "家常",
      servings: "2 人份",
      cook_minutes: 35,
      difficulty: "简单",
      favorite: true,
      source_platform: "douyin",
      source_url: "https://v.douyin.com/iRNBho6/",
      ingredients: [
        ing("鸡翅中", 500, "g", "肉禽"),
        ing("可乐", 330, "ml", "调料"),
        ing("姜", 3, "片", "蔬果"),
        ing("生抽", 2, "勺", "调料"),
        ing("料酒", 1, "勺", "调料"),
        ing("盐", "少许", "", "调料"),
      ],
      steps: [
        { text: "鸡翅两面划刀，冷水下锅焯水，捞出冲净浮沫。", minutes: 5 },
        { text: "锅中少油，鸡翅煎至两面金黄。", minutes: 6 },
        { text: "倒入可乐、生抽、料酒、姜片，大火烧开转小火焖。", minutes: 18 },
        { text: "大火收汁，汤汁浓稠裹住鸡翅即可。", minutes: 5 },
        { text: "装盘，撒点白芝麻。", minutes: 1 },
      ],
    }),
    dishRow({
      id: id("dis", 3),
      title: "蒜蓉西兰花",
      emoji: "🥦",
      cuisine: "快手",
      servings: "2 人份",
      cook_minutes: 10,
      difficulty: "简单",
      ingredients: [
        ing("西兰花", 1, "颗", "蔬果"),
        ing("蒜", 4, "瓣", "蔬果"),
        ing("蚝油", 1, "勺", "调料"),
        ing("盐", "适量", "", "调料"),
      ],
      steps: [
        { text: "西兰花切小朵，盐水泡 5 分钟后冲净。", minutes: 5 },
        { text: "水开加盐和油，西兰花焯 40 秒捞出过凉。", minutes: 2 },
        { text: "热油爆香蒜末，下西兰花和蚝油大火快炒。", minutes: 2 },
      ],
    }),
    dishRow({
      id: id("dis", 4),
      title: "酸菜鱼",
      emoji: "🐟",
      cuisine: "川湘",
      servings: "2-3 人份",
      cook_minutes: 45,
      difficulty: "中等",
      source_platform: "xhs",
      source_url: "https://www.xiaohongshu.com/discovery/item/demo",
      ingredients: [
        ing("黑鱼", 1, "条", "水产"),
        ing("酸菜", 200, "g", "调料"),
        ing("泡椒", 5, "个", "调料"),
        ing("鸡蛋", 1, "个", "蛋奶"),
        ing("淀粉", 2, "勺", "调料"),
        ing("姜", 3, "片", "蔬果"),
        ing("蒜", 3, "瓣", "蔬果"),
        ing("干辣椒", 8, "个", "调料"),
        ing("花椒", 1, "勺", "调料"),
      ],
      steps: [
        { text: "鱼片用蛋清、淀粉、盐抓匀腌 15 分钟。", minutes: 15 },
        { text: "鱼骨煎香，加姜蒜和酸菜炒出酸香。", minutes: 6 },
        { text: "加水煮开，下鱼骨煮 10 分钟成汤底。", minutes: 10 },
        { text: "鱼片逐片滑入，变白立刻关火。", minutes: 3 },
        { text: "另起锅热油，爆香干辣椒花椒，泼在鱼片上。", minutes: 4 },
      ],
    }),
    dishRow({
      id: id("dis", 5),
      title: "番茄鸡蛋面",
      emoji: "🍜",
      cuisine: "主食",
      servings: "2 人份",
      cook_minutes: 20,
      difficulty: "简单",
      ingredients: [
        ing("挂面", 200, "g", "主食"),
        ing("番茄", 2, "个", "蔬果"),
        ing("鸡蛋", 2, "个", "蛋奶"),
        ing("葱", 1, "根", "蔬果"),
        ing("盐", "适量", "", "调料"),
      ],
      steps: [
        { text: "番茄去皮切块，鸡蛋打散。", minutes: 4 },
        { text: "炒蛋盛出，下番茄炒出沙。", minutes: 5 },
        { text: "加水烧开，下面条煮熟。", minutes: 7 },
        { text: "倒回鸡蛋，调味撒葱花。", minutes: 2 },
      ],
    }),
    dishRow({
      id: id("dis", 6),
      title: "冬瓜排骨汤",
      emoji: "🍲",
      cuisine: "汤羹",
      servings: "3 人份",
      cook_minutes: 60,
      difficulty: "简单",
      ingredients: [
        ing("排骨", 400, "g", "肉禽"),
        ing("冬瓜", 300, "g", "蔬果"),
        ing("姜", 3, "片", "蔬果"),
        ing("料酒", 1, "勺", "调料"),
        ing("盐", "适量", "", "调料"),
      ],
      steps: [
        { text: "排骨冷水下锅焯水，撇净浮沫。", minutes: 6 },
        { text: "砂锅加水、排骨、姜片、料酒，小火炖 40 分钟。", minutes: 40 },
        { text: "下冬瓜块再炖 12 分钟，加盐调味。", minutes: 12 },
      ],
    }),
  ];

  var snap = function (d) {
    return {
      title: d.title,
      emoji: d.emoji,
      cuisine: d.cuisine,
      cook_minutes: d.cook_minutes,
      servings: d.servings,
      ingredients: d.ingredients,
      steps: d.steps,
    };
  };
  var byTitle = {};
  dishes.forEach(function (d) {
    byTitle[d.title] = d;
  });

  var requests = [
    {
      id: id("req", 1),
      room_code: "482910",
      dish_id: byTitle["可乐鸡翅"].id,
      dish_snapshot: { title: "可乐鸡翅", emoji: "🍗", cook_minutes: 35 },
      date: T,
      meal: "dinner",
      note: "少放点糖，上次有点甜",
      status: "pending",
      decision_note: "",
      target_dish_id: "",
      origin_id: "",
      created_by: "dev_partner",
      created_at: NOW - 3600000,
      updated_at: NOW - 3600000,
      updated_by: "dev_partner",
      deleted: false,
    },
    {
      id: id("req", 2),
      room_code: "482910",
      dish_id: byTitle["酸菜鱼"].id,
      dish_snapshot: { title: "酸菜鱼", emoji: "🐟", cook_minutes: 45 },
      date: dayOffset(1),
      meal: "dinner",
      note: "想吃辣一点的",
      status: "accepted",
      decision_note: "",
      target_dish_id: "",
      origin_id: "",
      created_by: "dev_partner",
      decided_by: "chef",
      decided_at: NOW - 86400000,
      created_at: NOW - 86400000 * 1.2,
      updated_at: NOW - 86400000,
      updated_by: "dev_me",
      deleted: false,
    },
    {
      id: id("req", 3),
      room_code: "482910",
      dish_id: byTitle["蒜蓉西兰花"].id,
      dish_snapshot: { title: "蒜蓉西兰花", emoji: "🥦", cook_minutes: 10 },
      date: T,
      meal: "lunch",
      note: "",
      status: "rejected",
      decision_note: "今天菜市场没买到西兰花，明天补上",
      target_dish_id: "",
      origin_id: "",
      created_by: "dev_partner",
      decided_by: "chef",
      decided_at: NOW - 7200000,
      created_at: NOW - 9000000,
      updated_at: NOW - 7200000,
      updated_by: "dev_me",
      deleted: false,
    },
  ];

  var plans = [
    {
      id: id("plan", 1),
      room_code: "482910",
      date: T,
      meal: "lunch",
      dish_id: byTitle["番茄炒蛋"].id,
      dish_snapshot: snap(byTitle["番茄炒蛋"]),
      request_id: "",
      status: "planned",
      amount: 0,
      thought: "",
      created_by: "dev_me",
      created_at: NOW - 5000000,
      updated_at: NOW - 5000000,
      updated_by: "dev_me",
      deleted: false,
    },
    {
      id: id("plan", 2),
      room_code: "482910",
      date: dayOffset(1),
      meal: "dinner",
      dish_id: byTitle["酸菜鱼"].id,
      dish_snapshot: snap(byTitle["酸菜鱼"]),
      request_id: id("req", 2),
      status: "planned",
      amount: 0,
      thought: "",
      created_by: "dev_me",
      created_at: NOW - 86400000,
      updated_at: NOW - 86400000,
      updated_by: "dev_me",
      deleted: false,
    },
    {
      id: id("plan", 3),
      room_code: "482910",
      date: dayOffset(-1),
      meal: "dinner",
      dish_id: byTitle["番茄鸡蛋面"].id,
      dish_snapshot: snap(byTitle["番茄鸡蛋面"]),
      request_id: "",
      status: "done",
      amount: 0,
      thought: "汤头很香，下次多放一个番茄",
      created_by: "dev_me",
      created_at: NOW - 86400000 * 1.9,
      updated_at: NOW - 86400000 * 1.8,
      updated_by: "dev_me",
      deleted: false,
    },
    {
      id: id("plan", 4),
      room_code: "482910",
      date: dayOffset(-3),
      meal: "dinner",
      dish_id: byTitle["冬瓜排骨汤"].id,
      dish_snapshot: snap(byTitle["冬瓜排骨汤"]),
      request_id: "",
      status: "done",
      amount: 0,
      thought: "",
      created_by: "dev_me",
      created_at: NOW - 86400000 * 3.5,
      updated_at: NOW - 86400000 * 3.4,
      updated_by: "dev_me",
      deleted: false,
    },
    {
      id: id("plan", 5),
      room_code: "482910",
      date: dayOffset(2),
      meal: "dinner",
      dish_id: byTitle["蒜蓉西兰花"].id,
      dish_snapshot: snap(byTitle["蒜蓉西兰花"]),
      request_id: "",
      status: "planned",
      amount: 0,
      thought: "",
      created_by: "dev_me",
      created_at: NOW - 3600000,
      updated_at: NOW - 3600000,
      updated_by: "dev_me",
      deleted: false,
    },
  ];

  var restaurants = [
    {
      id: id("rest", 1),
      room_code: "482910",
      name: "炭火烤肉 · 望京店",
      kind: "dine",
      platform: "meituan",
      cuisine: "烤肉",
      avg_price: 88,
      address: "北京市朝阳区望京街 9 号院 3 号楼",
      delivery_fee: null,
      eta_minutes: null,
      link: "https://www.dianping.com/shop/demo1",
      note: "要排队，记得提前取号",
      craving: 5,
      created_by: "dev_me",
      created_at: NOW - 86400000 * 4,
      updated_at: NOW - 86400000 * 4,
      updated_by: "dev_me",
      deleted: false,
    },
    {
      id: id("rest", 2),
      room_code: "482910",
      name: "老王烧烤",
      kind: "dine",
      platform: "manual",
      cuisine: "烧烤",
      avg_price: 55,
      address: "幸福路 12 号",
      delivery_fee: null,
      eta_minutes: null,
      link: "",
      note: "烤茄子必点",
      craving: 3,
      created_by: "dev_partner",
      created_at: NOW - 86400000 * 9,
      updated_at: NOW - 86400000 * 9,
      updated_by: "dev_partner",
      deleted: false,
    },
    {
      id: id("rest", 3),
      room_code: "482910",
      name: "楼下湖南米粉",
      kind: "takeout",
      platform: "meituan",
      cuisine: "快餐",
      avg_price: 25,
      address: "朝阳区幸福路 12 号 3 单元 502",
      delivery_fee: 5,
      eta_minutes: 35,
      link: "",
      note: "加辣加酸豆角",
      craving: 4,
      created_by: "dev_me",
      created_at: NOW - 86400000 * 2,
      updated_at: NOW - 86400000 * 2,
      updated_by: "dev_me",
      deleted: false,
    },
  ];

  function restSnap(r) {
    return {
      name: r.name,
      cuisine: r.cuisine,
      avg_price: r.avg_price,
      address: r.address,
      delivery_fee: r.delivery_fee,
      eta_minutes: r.eta_minutes,
      link: r.link,
      platform: r.platform,
    };
  }

  var invites = [
    {
      id: id("inv", 1),
      room_code: "482910",
      kind: "dine",
      restaurant_id: restaurants[0].id,
      restaurant_snapshot: restSnap(restaurants[0]),
      proposer: "chef",
      status: "pending",
      scheduled_at: dayOffset(1) + "T19:00",
      note: "这周辛苦了，带你吃肉",
      amount: 0,
      payer: "none",
      decision_note: "",
      decided_by: "",
      decided_at: 0,
      created_at: NOW - 5400000,
      updated_at: NOW - 5400000,
      updated_by: "dev_me",
      deleted: false,
    },
    {
      id: id("inv", 2),
      room_code: "482910",
      kind: "dine",
      restaurant_id: restaurants[1].id,
      restaurant_snapshot: restSnap(restaurants[1]),
      proposer: "diner",
      status: "agreed",
      scheduled_at: dayOffset(-3) + "T20:00",
      note: "",
      amount: 168,
      payer: "diner",
      decision_note: "",
      decided_by: "chef",
      decided_at: NOW - 86400000 * 3.2,
      created_at: NOW - 86400000 * 3.4,
      updated_at: NOW - 86400000 * 3.2,
      updated_by: "dev_me",
      deleted: false,
    },
    {
      id: id("inv", 3),
      room_code: "482910",
      kind: "takeout",
      restaurant_id: restaurants[2].id,
      restaurant_snapshot: restSnap(restaurants[2]),
      proposer: "diner",
      status: "agreed",
      scheduled_at: dayOffset(-2) + "T20:30",
      note: "今天都不想动",
      amount: 46,
      payer: "split",
      decision_note: "",
      decided_by: "chef",
      decided_at: NOW - 86400000 * 2.2,
      created_at: NOW - 86400000 * 2.3,
      updated_at: NOW - 86400000 * 2.2,
      updated_by: "dev_me",
      deleted: false,
    },
  ];

  var checks = [
    { id: "482910_" + T + "~" + dayOffset(2) + "_鸡蛋", room_code: "482910", scope: T + "~" + dayOffset(2), item_key: "鸡蛋", checked: true, created_at: NOW, updated_at: NOW, updated_by: "dev_me", deleted: false },
    { id: "482910_" + T + "~" + dayOffset(2) + "_番茄", room_code: "482910", scope: T + "~" + dayOffset(2), item_key: "番茄", checked: true, created_at: NOW, updated_at: NOW, updated_by: "dev_me", deleted: false },
  ];

  var members = [
    {
      id: "482910_dev_me",
      room_code: "482910",
      device_id: "dev_me",
      role: "chef",
      nickname: "饲养员",
      joined_at: NOW - 86400000 * 30,
      created_at: NOW - 86400000 * 30,
      updated_at: NOW - 86400000 * 30,
      updated_by: "dev_me",
      deleted: false,
    },
    {
      id: "482910_dev_partner",
      room_code: "482910",
      device_id: "dev_partner",
      role: "diner",
      nickname: "小馋虫",
      joined_at: NOW - 86400000 * 29,
      created_at: NOW - 86400000 * 29,
      updated_at: NOW - 86400000 * 29,
      updated_by: "dev_partner",
      deleted: false,
    },
  ];

  var state = {
    version: 1,
    profile: { deviceId: "dev_me", role: role, nickname: role === "diner" ? "小馋虫" : "饲养员", joinedAt: NOW - 86400000 * 30 },
    room: { code: "482910", createdAt: NOW - 86400000 * 30 },
    sync: { url: "", key: "", lastSyncAt: 0, lastError: "", cursor: {}, lastPushedAt: 0 },
    data: {
      rooms: [{ id: "482910", code: "482910", created_at: NOW - 86400000 * 30, updated_at: NOW - 86400000 * 30, updated_by: "dev_me", deleted: false }],
      members: members,
      dishes: dishes,
      requests: requests,
      plans: plans,
      restaurants: restaurants,
      invites: invites,
      checks: checks,
    },
    local: { lastSeen: { requests: 0, invites: 0 }, onboardSeen: true, installHintSeen: false },
    dirty: [],
  };

  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    console.log("[饭来] 已注入演示数据（仅本机预览）");
  } catch (e) {
    console.warn("[饭来] 演示数据注入失败", e);
  }
})();
