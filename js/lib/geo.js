/* ============================================================
   饭来 · 地址与距离
   ------------------------------------------------------------
   家庭住址存在本机（localStorage），餐厅地址按需向高德地理编码，
   结果缓存在本机 —— 同一个地址只请求一次。

   两个坐标系必须分清：
     · 手机定位（navigator.geolocation）给的是 WGS-84（GPS 原始坐标）
     · 高德给的、以及高德能正确识别的，是 GCJ-02（火星坐标）
   国内两者相差 50~600 米，直接混用会让距离明显偏。
   所以定位结果要先做 WGS-84 → GCJ-02 转换。

   高德 Key 有两种填法（后者优先）：
     1. 直接写在 AMAP_KEY / AMAP_SECURITY
     2. 「我的 → 地址与距离」里粘贴
   ============================================================ */

/** 高德「Web端(JS API)」Key —— 写在代码里，两台手机都不用再填
 *  ⚠️ 前端 Key 打开源码就能看到；务必在控制台配好域名白名单
 *     （zzn-fanlai.github.io），否则别人也能拿去消耗你的免费额度。 */
export const AMAP_KEY = "d76e11b369d65e3a277295a8e4262944";
export const AMAP_SECURITY = "77b10cff9c0e1d53f8cf7f88ec1b58dc";

const LS_SETTINGS = "fanlai.geo.settings.v1";
const LS_CACHE = "fanlai.geo.cache.v1";
const LS_FAIL = "fanlai.geo.fail.v1";

const FAIL_TTL = 6 * 60 * 60 * 1000; // 解析失败 6 小时后再重试
const REQ_GAP = 180; // 两次请求之间隔一下，避免触发 QPS 限制

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

/* ---------------- 内存缓存（避免每次渲染都反序列化整份 JSON） ---------------- */
let cacheMem = null;
function getCache() {
  if (!cacheMem) cacheMem = readJSON(LS_CACHE, {});
  return cacheMem;
}
function setCache(addr, coord) {
  const c = getCache();
  c[addr] = coord;
  writeJSON(LS_CACHE, c);
}

let failMem = null;
function getFail() {
  if (!failMem) failMem = readJSON(LS_FAIL, {});
  return failMem;
}
function markFail(addr) {
  const f = getFail();
  f[addr] = Date.now();
  writeJSON(LS_FAIL, f);
}
function recentlyFailed(addr) {
  const t = getFail()[addr] || 0;
  return t && Date.now() - t < FAIL_TTL;
}
function clearFail(addr) {
  const f = getFail();
  if (addr) delete f[addr];
  else failMem = {};
  writeJSON(LS_FAIL, addr ? f : {});
}

/** 清掉某个地址（或全部）的缓存，下次重新解析 */
export function forgetAddress(addr) {
  const c = getCache();
  delete c[addr];
  writeJSON(LS_CACHE, c);
  clearFail(addr);
  notifyListeners();
}

export function clearGeoCache() {
  cacheMem = {};
  failMem = {};
  writeJSON(LS_CACHE, {});
  writeJSON(LS_FAIL, {});
  loadFailAt = 0;
  amapPromise = null;
  notifyListeners();
}

/* ---------------- Key 配置 ---------------- */
export function getConfig() {
  const s = readJSON(LS_SETTINGS, {});
  return {
    key: String(s.key || AMAP_KEY || "").trim(),
    security: String(s.security || AMAP_SECURITY || "").trim(),
    home: s.home || null, // { address, lng, lat }
  };
}

export function setConfig({ key, security }) {
  const s = readJSON(LS_SETTINGS, {});
  if (key !== undefined) s.key = String(key || "").trim();
  if (security !== undefined) s.security = String(security || "").trim();
  if (key !== undefined) {
    cacheMem = {};
    failMem = {};
    writeJSON(LS_CACHE, {});
    writeJSON(LS_FAIL, {});
  }
  writeJSON(LS_SETTINGS, s);
  amapPromise = null;
}

export function isConfigured() {
  return !!getConfig().key;
}

/* ---------------- 家庭住址 ---------------- */
export function getHome() {
  const home = getConfig().home;
  if (!home || !home.address) return null;
  return home;
}

export function setHome(home) {
  const s = readJSON(LS_SETTINGS, {});
  s.home = home || null;
  writeJSON(LS_SETTINGS, s);
  notifyListeners();
}

export function clearHome() {
  const s = readJSON(LS_SETTINGS, {});
  s.home = null;
  writeJSON(LS_SETTINGS, s);
  notifyListeners();
}

/**
 * 家庭住址只存了文字、没有坐标时（比如 Key 是后配的），自动补算一次。
 * 这是"有些地址不显示距离"最常见的原因。
 */
export async function ensureHomeCoords() {
  const home = getHome();
  if (!home || home.lng != null || !isConfigured()) return false;
  try {
    const coord = await geocode(home.address);
    if (coord) {
      setHome({ ...home, lng: coord.lng, lat: coord.lat });
      return true;
    }
  } catch (_) {}
  return false;
}

/* ---------------- WGS-84 → GCJ-02 ---------------- */
const PI = Math.PI;
const AXIS = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lng, lat) {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}
function tLat(x, y) {
  let r =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  r += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return r;
}
function tLng(x, y) {
  let r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  r += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return r;
}

/** GPS 坐标（WGS-84）→ 高德/腾讯用的 GCJ-02。国外原样返回。 */
export function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return { lng, lat };
  let dLat = tLat(lng - 105.0, lat - 35.0);
  let dLng = tLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((AXIS * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return { lng: lng + dLng, lat: lat + dLat };
}

/* ---------------- 地址清洗 ---------------- */
/** 去掉括号补充、"附近"、多余标点 —— 高德对这些很挑 */
export function cleanAddress(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  s = s.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, ""); // 括号内容
  s = s.replace(/(附近|旁边|对面|往里走|进门|左手边|右手边|楼上|楼下|负一层|B1|B2)/gi, "");
  s = s.replace(/[，,。;；]+/g, " ").replace(/\s+/g, "").trim();
  s = s.replace(/^中国/, "");
  return s;
}

/** 生成几个候选写法，从最可能到最宽松 */
export function addressCandidates(input) {
  const raw = String(input || "").trim();
  const cleaned = cleanAddress(raw);
  const list = [];
  for (const s of [cleaned, raw]) {
    if (s && !list.includes(s)) list.push(s);
  }
  // "北京市朝阳区望京街9号院3号楼" → 也试去掉末尾楼栋号
  const noBuilding = cleaned.replace(/\d+号楼.*$/, "").replace(/\d+层.*$/, "");
  if (noBuilding && noBuilding !== cleaned && !list.includes(noBuilding)) list.push(noBuilding);
  return list.slice(0, 3);
}

/* ---------------- 高德脚本 ---------------- */
let amapPromise = null;
// 脚本加载失败（Key 无效 / 域名白名单 / 网络）时短期停止重试，避免每次渲染都塞一个 script 标签
let loadFailAt = 0;
const LOAD_FAIL_TTL = 60 * 1000;

export function amapBroken() {
  return loadFailAt > 0 && Date.now() - loadFailAt < LOAD_FAIL_TTL;
}

export function loadAmap() {
  if (amapPromise) return amapPromise;
  const { key, security } = getConfig();
  if (!key) return Promise.reject(new Error("未配置高德 Key"));

  amapPromise = new Promise((resolve, reject) => {
    if (window.AMap) {
      resolve(window.AMap);
      return;
    }
    if (security) window._AMapSecurityConfig = { securityJsCode: security };
    const s = document.createElement("script");
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(
      key
    )}&plugin=AMap.Geocoder,AMap.PlaceSearch`;
    s.async = true;
    s.onload = () => (window.AMap ? resolve(window.AMap) : reject(new Error("高德脚本加载失败")));
    s.onerror = () => reject(new Error("高德脚本加载失败（网络或 Key 域名白名单）"));
    document.head.appendChild(s);
  })
    .then((AMap) => {
      loadFailAt = 0;
      return AMap;
    })
    .catch((err) => {
      amapPromise = null;
      loadFailAt = Date.now();
      notifyListeners(); // 让界面从"解析中"变成"Key 不可用"
      throw err;
    });

  return amapPromise;
}

/* ---------------- 串行队列（避免 QPS 超限） ---------------- */
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, REQ_GAP)));
  return run;
}

function geocodeByGeocoder(AMap, addr) {
  return new Promise((resolve) => {
    const geo = new AMap.Geocoder({ city: "全国" });
    geo.getLocation(addr, (status, result) => {
      if (status === "complete" && result && result.geocodes && result.geocodes.length) {
        const loc = result.geocodes[0].location;
        resolve({ lng: Number(loc.lng), lat: Number(loc.lat) });
      } else {
        resolve(null);
      }
    });
  });
}

function geocodeBySearch(AMap, addr) {
  return new Promise((resolve) => {
    try {
      const ps = new AMap.PlaceSearch({ pageSize: 1, city: "全国" });
      ps.search(addr, (status, result) => {
        const p = result && result.poiList && result.poiList.pois && result.poiList.pois[0];
        if (status === "complete" && p && p.location) {
          resolve({ lng: Number(p.location.lng), lat: Number(p.location.lat) });
        } else {
          resolve(null);
        }
      });
    } catch (_) {
      resolve(null);
    }
  });
}

/** 地址 → { lng, lat }（GCJ-02），失败返回 null；失败的会记 6 小时，避免反复请求 */
export async function geocode(address) {
  const addr = String(address || "").trim();
  if (!addr) return null;

  const cached = getCache()[addr];
  if (cached) return cached;
  if (recentlyFailed(addr)) return null;

  const AMap = await loadAmap();

  const coord = await enqueue(async () => {
    // 先按清洗后的地址解码，再用 POI 搜索兜底（商场/店名类地址只有 POI 搜得到）
    for (const cand of addressCandidates(addr)) {
      const hit = await geocodeByGeocoder(AMap, cand);
      if (hit) return hit;
    }
    for (const cand of addressCandidates(addr)) {
      const hit = await geocodeBySearch(AMap, cand);
      if (hit) return hit;
    }
    return null;
  });

  if (!coord) {
    markFail(addr);
    notifyListeners(); // 让界面从"解析中"变成"解析失败"
    return null;
  }
  setCache(addr, coord);
  clearFail(addr);
  notifyListeners();
  return coord;
}

/** 坐标 → 地址文字（"用当前位置"时补全；输入必须是 GCJ-02） */
export async function reverseGeocode(lng, lat) {
  const AMap = await loadAmap();
  return new Promise((resolve) => {
    const geo = new AMap.Geocoder({ city: "全国" });
    geo.getAddress([lng, lat], (status, result) => {
      if (status === "complete" && result && result.regeocode) {
        resolve(result.regeocode.formattedAddress || "");
      } else {
        resolve("");
      }
    });
  });
}

/* ---------------- 距离 ---------------- */
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  if (!a || !b || a.lng == null || b.lng == null) return null;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 纯直线距离换算的骑行分钟（15km/h，不含绕路） */
export function bikeMinutes(km) {
  if (km == null || !isFinite(km)) return null;
  return Math.max(1, Math.round((km / 15) * 60));
}

/** 直线距离 × 绕路系数后再估时间：城市道路实际比直线多 20~30% */
const DETOUR = 1.25;
export function walkMinutes(km) {
  if (km == null || !isFinite(km)) return null;
  return Math.max(1, Math.round(((km * DETOUR) / 4.5) * 60));
}
export function rideMinutes(km) {
  if (km == null || !isFinite(km)) return null;
  return Math.max(2, Math.round(((km * DETOUR) / 15) * 60));
}

/** "1.2 km · 约骑车 6 分钟" */
export function distanceText(km) {
  if (km == null || !isFinite(km)) return "";
  const d = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  if (km <= 1.5) return `${d} · 约走路 ${walkMinutes(km)} 分钟`;
  if (km <= 4) return `${d} · 约骑车 ${rideMinutes(km)} 分钟`;
  return `${d} · 骑车约 ${rideMinutes(km)} 分钟`;
}

/* ---------------- 按地址取缓存（同步） ---------------- */
const inflight = new Set();
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let notifyTimer = null;
function notifyListeners() {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (_) {}
    });
  }, 120);
}

export function coordOf(address) {
  const addr = String(address || "").trim();
  if (!addr || !isConfigured()) return null;

  const cached = getCache()[addr];
  if (cached) return cached;

  if (amapBroken()) return null; // Key/网络坏了，别反复试
  if (!recentlyFailed(addr) && !inflight.has(addr)) {
    inflight.add(addr);
    geocode(addr)
      .catch(() => null)
      .finally(() => inflight.delete(addr));
  }
  return null;
}

export function kmFromHome(address) {
  const home = getHome();
  if (!home || home.lng == null || home.lat == null) return null;
  const coord = coordOf(address);
  if (!coord) return null;
  return haversine({ lng: home.lng, lat: home.lat }, coord);
}

/** 预热一批地址（列表页调用） */
export function prefetch(addresses) {
  if (!isConfigured()) return;
  // 家庭地址只存了文字 → 先补坐标（异步，不阻塞渲染）
  ensureHomeCoords().catch(() => {});
  if (!getHome()) return;
  const list = Array.from(new Set((addresses || []).map((a) => String(a || "").trim()).filter(Boolean)));
  list.slice(0, 30).forEach((addr) => coordOf(addr));
}

/** 诊断：某个地址现在是什么状态（给「地址与距离」页用） */
export function geoCheck(address) {
  const addr = String(address || "").trim();
  if (!isConfigured()) return { status: "unconfigured" };
  if (!addr) return { status: "empty" };
  if (amapBroken()) return { status: "amap-error" };
  const coord = getCache()[addr];
  if (coord) {
    const km = kmFromHome(addr);
    return { status: "ok", coord, km };
  }
  if (recentlyFailed(addr)) return { status: "fail" };
  coordOf(addr);
  return { status: "pending" };
}
