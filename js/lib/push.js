/* ============================================================
   饭来 · 后台推送（Web Push）
   ------------------------------------------------------------
   这是唯一能做到「App 关掉了也能收到通知」的方式，原理：
     ① 手机浏览器给一个 push endpoint（订阅）
     ② 订阅存到 Supabase 的 push_subs 表（按房间分组）
     ③ 对方发起邀约 → 数据库写入 → Database Webhook 调 Edge Function
     ④ Edge Function 用 VAPID 私钥把消息推到 endpoint → 手机通知栏

   前提：
     · 安卓：Chrome 即可，不要求装到桌面
     · 苹果：必须「添加到主屏幕」（iOS 16.4+ 才支持 Web Push）
     · 必须已配置 Supabase 同步（订阅要存到云端）
   ============================================================ */
import { sync } from "../sync.js";

/** VAPID 公钥（和 Edge Function 里的私钥是一对；公开是安全的） */
export const VAPID_PUBLIC =
  "BGsQs2daK94c2lfg9VaWwpPrFA5Bfz5utPde7bmLoJr76F4zm0pJsUkJqJ26KXKdpEXuPySSDvxLS7zsjjFL9ZI";

const LS_FLAG = "fanlai.push.on";

function b64ToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** 给测试用：解出 VAPID 公钥字节（长度应为 65，首字节 0x04 表示未压缩点） */
export function vapidKeyBytes() {
  return b64ToBytes(VAPID_PUBLIC);
}

export function pushSupported() {
  try {
    return (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      typeof window !== "undefined" &&
      "PushManager" in window &&
      typeof Notification !== "undefined"
    );
  } catch (_) {
    return false;
  }
}

/** 本机是否已经订阅过（只用来显示状态） */
export function markedOn() {
  try {
    return !!localStorage.getItem(LS_FLAG);
  } catch (_) {
    return false;
  }
}

async function getReg() {
  if (!("serviceWorker" in navigator)) throw new Error("这个浏览器没有 Service Worker");
  return navigator.serviceWorker.ready;
}

/** 检查 Supabase 里 push_subs 表是否存在，失败时给能照着做的提示 */
async function assertTableReady(c) {
  let res;
  try {
    res = await fetch(`${c.url}/rest/v1/push_subs?select=endpoint&limit=1`, {
      headers: { apikey: c.key, Authorization: `Bearer ${c.key}` },
    });
  } catch (err) {
    throw new Error(`连不上 Supabase：${err?.message || err}`);
  }
  if (res.status === 404) {
    throw new Error(
      "云端还没建推送订阅表 —— 先去 Supabase 的 SQL Editor 执行 supabase/push.sql（只要这一步，函数和 Webhook 之后再做也行）"
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("Supabase key 没权限（401/403）—— 检查「我的 → 同步设置」里的 key 是不是 Publishable/anon");
  }
  if (!res.ok) {
    throw new Error(`检查订阅表失败 ${res.status}`);
  }
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await getReg();
    return await reg.pushManager.getSubscription();
  } catch (_) {
    return null;
  }
}

/**
 * 开启推送：申请权限 → 订阅 → 存到 Supabase
 * @returns {Promise<string>} endpoint
 */
export async function enablePush({ roomCode, deviceId, role }) {
  if (!pushSupported()) throw new Error("这台设备不支持后台推送（苹果需要先「添加到主屏幕」）");

  const c = sync.config();
  if (!c.url || !c.key) throw new Error("还没配置云端同步 —— 推送要靠它存订阅，先到「我的 → 同步设置」填好");

  // 先确认表建好了：表不存在时给明确提示，而不是让用户去猜 404
  await assertTableReady(c);

  // 权限（必须在用户点击里调用）
  let perm = Notification.permission;
  if (perm !== "granted") perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("没有通知权限，去浏览器/系统设置里允许");

  const reg = await getReg();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(VAPID_PUBLIC),
      });
    } catch (err) {
      const msg = String(err?.message || err);
      // 安卓 Chrome 的推送通道是 Google FCM，国内/无 GMS 机型连不上就是这句
      if (/push service error|Registration failed|AbortError/i.test(msg)) {
        throw new Error(
          "这台手机连不上推送通道（安卓走 Google FCM，国内多数机型被拦）。安卓用站内红点+横幅就够了；iPhone 装到桌面后可以开真推送。"
        );
      }
      throw new Error(`订阅失败：${msg}`);
    }
  }

  const json = sub.toJSON ? sub.toJSON() : sub;
  const row = {
    endpoint: json.endpoint,
    room_code: String(roomCode || ""),
    device_id: String(deviceId || ""),
    role: String(role || ""),
    p256dh: (json.keys && json.keys.p256dh) || "",
    auth: (json.keys && json.keys.auth) || "",
    created_at: Date.now(),
  };

  const res = await fetch(`${c.url}/rest/v1/push_subs?on_conflict=endpoint`, {
    method: "POST",
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`保存订阅失败 ${res.status}：${text.slice(0, 120)}`);
  }

  try {
    localStorage.setItem(LS_FLAG, json.endpoint);
  } catch (_) {}
  return json.endpoint;
}

/** 关闭推送：退订并从 Supabase 删除 */
export async function disablePush() {
  const c = sync.config();
  let endpoint = "";
  try {
    const sub = await currentSubscription();
    if (sub) {
      endpoint = sub.endpoint;
      await sub.unsubscribe();
    }
  } catch (_) {}
  if (c.url && c.key && endpoint) {
    try {
      await fetch(`${c.url}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: "DELETE",
        headers: { apikey: c.key, Authorization: `Bearer ${c.key}` },
      });
    } catch (_) {}
  }
  try {
    localStorage.removeItem(LS_FLAG);
  } catch (_) {}
  return true;
}
