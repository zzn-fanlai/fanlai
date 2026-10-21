/* ============================================================
   饭来 · 地址与距离
   ------------------------------------------------------------
   家庭住址存在本机（localStorage），餐厅地址按需向高德地理编码，
   结果缓存在本机 —— 同一个地址只请求一次。

   高德 Key 有两种填法：
     1. 直接写在下面的 AMAP_KEY / AMAP_SECURITY（一次性）
     2. 「我的 → 地址与距离」里粘贴（不用改代码，优先级更高）
   ============================================================ */

/** 高德「Web端(JS API)」Key —— 写在代码里，两台手机都不用再填
 *  ⚠️ 这是前端 Key，打开源码就能看到；务必在控制台配好域名白名单
 *     （zzn-fanlai.github.io），否则别人也能拿去消耗你的免费额度。
 *  App 里「我的 → 地址与距离」填的值优先级更高，可以临时覆盖。 */
export const AMAP_KEY = "d76e11b369d65e3a277295a8e4262944";
export const AMAP_SECURITY = "77b10cff9c0e1d53f8cf7f88ec1b58dc";

const LS_SETTINGS = "fanlai.geo.settings.v1";
const LS_CACHE = "fanlai.geo.cache.v1";

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
  } catch (_) {
    /* 隐私模式写不进去就算了 */
  }
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
  // 换了 Key，之前缓存的坐标可能来自旧 Key，清掉
  if (key !== undefined) writeJSON(LS_CACHE, {});
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

/* ---------------- 地理编码（地址 → 坐标） ---------------- */
let amapPromise = null;

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
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Geocoder`;
    s.async = true;
    s.onload = () => (window.AMap ? resolve(window.AMap) : reject(new Error("高德脚本加载失败")));
    s.onerror = () => reject(new Error("高德脚本加载失败（网络或 Key 域名白名单）"));
    document.head.appendChild(s);
  }).catch((err) => {
    amapPromise = null;
    throw err;
  });

  return amapPromise;
}

/** 地址 → { lng, lat }，失败返回 null */
export async function geocode(address) {
  const addr = String(address || "").trim();
  if (!addr) return null;
  const cache = readJSON(LS_CACHE, {});
  if (cache[addr]) return cache[addr];

  const AMap = await loadAmap();
  const geocoder = new AMap.Geocoder({ city: "全国" });
  const loc = await new Promise((resolve) => {
    geocoder.getLocation(addr, (status, result) => {
      if (status === "complete" && result && result.geocodes && result.geocodes.length) {
        resolve(result.geocodes[0].location);
      } else {
        resolve(null);
      }
    });
  });
  if (!loc) return null;

  const out = { lng: Number(loc.lng), lat: Number(loc.lat) };
  const fresh = readJSON(LS_CACHE, {});
  fresh[addr] = out;
  writeJSON(LS_CACHE, fresh);
  notifyListeners();
  return out;
}

/** 坐标 → 地址文字（"用当前位置"时补全） */
export async function reverseGeocode(lng, lat) {
  const AMap = await loadAmap();
  const geocoder = new AMap.Geocoder({ city: "全国" });
  const addr = await new Promise((resolve) => {
    geocoder.getAddress([lng, lat], (status, result) => {
      if (status === "complete" && result && result.regeocode) resolve(result.regeocode.formattedAddress || "");
      else resolve("");
    });
  });
  return addr;
}

/* ---------------- 距离 ---------------- */
const R = 6371; // 地球半径 km
const rad = (d) => (d * Math.PI) / 180;

/** 两点球面距离（公里） */
export function haversine(a, b) {
  if (!a || !b) return null;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 按 15km/h 估算骑行时间（分钟） */
export function bikeMinutes(km) {
  if (km == null || !isFinite(km)) return null;
  return Math.max(1, Math.round((km / 15) * 60));
}

/** 距离文案："1.2 km · 骑车 6 分钟" */
export function distanceText(km) {
  if (km == null || !isFinite(km)) return "";
  const d = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  const mins = bikeMinutes(km);
  if (km <= 3) return `${d} · 走路 ${Math.max(1, Math.round((km / 4.5) * 60))} 分钟`;
  return `${d} · 骑车 ${mins} 分钟`;
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

/** 同步拿缓存；没有就后台去取（取到后会通知刷新） */
export function coordOf(address) {
  const addr = String(address || "").trim();
  if (!addr || !isConfigured()) return null;

  const cache = readJSON(LS_CACHE, {});
  if (cache[addr]) return cache[addr];

  if (!inflight.has(addr)) {
    inflight.add(addr);
    geocode(addr)
      .catch(() => null)
      .finally(() => inflight.delete(addr));
  }
  return null;
}

/** 某地址离家的距离（公里）；算不出来返回 null */
export function kmFromHome(address) {
  const home = getHome();
  if (!home || home.lng == null || home.lat == null) return null;
  const coord = coordOf(address);
  if (!coord) return null;
  return haversine({ lng: home.lng, lat: home.lat }, coord);
}

/** 预热一批地址（列表页调用，避免一条条串行请求） */
export function prefetch(addresses) {
  if (!isConfigured() || !getHome()) return;
  const list = Array.from(new Set((addresses || []).map((a) => String(a || "").trim()).filter(Boolean)));
  list.slice(0, 30).forEach((addr) => coordOf(addr));
}
