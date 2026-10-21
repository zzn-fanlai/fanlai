/* ============================================================
   饭来 · 消息提醒
   ------------------------------------------------------------
   三层，按能力自动降级：
     ① 站内横幅  —— 页面开着时一定看得到（不依赖任何权限）
     ② 系统通知  —— 页面在后台（含切到别的 App）时弹通知栏
     ③ 振动      —— 手机上配合横幅，轻震一下
   完全关掉 App 后收不到 —— 那需要真正的 Web Push 后端，这次不做。
   ============================================================ */

export function supported() {
  return typeof Notification !== "undefined";
}

export function permission() {
  if (!supported()) return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}

export function canSystem() {
  return supported() && Notification.permission === "granted";
}

/** 询问授权（必须在用户点击里调用） */
export async function ask() {
  if (!supported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch (_) {
    return "denied";
  }
}

/**
 * 弹系统通知（页面不可见时才弹，可见时交给站内横幅，避免双份）
 * @returns {boolean} 是否真的弹了
 */
export function systemNotify({ title, body, tag = "fanlai", href = "", force = false }) {
  if (!canSystem()) return false;
  if (!document.hidden && !force) return false;
  try {
    const n = new Notification(title, {
      body,
      tag,
      renotify: true,
      icon: "./assets/icons/icon-192.png",
      badge: "./assets/icons/icon-192.png",
    });
    n.onclick = () => {
      try {
        window.focus();
        if (href) location.hash = href;
      } catch (_) {}
      n.close();
    };
    setTimeout(() => {
      try {
        n.close();
      } catch (_) {}
    }, 12000);
    return true;
  } catch (_) {
    return false;
  }
}

/** 手机轻震一下（不支持的设备静默忽略） */
export function vibrate(pattern = [80, 40, 80]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) {}
}

/** 给界面看的权限文案 */
export function permissionLabel() {
  const p = permission();
  if (p === "granted") return { text: "已开启：App 在后台时也能收到通知", kind: "ok" };
  if (p === "denied")
    return { text: "通知被系统拒绝了，需要去浏览器/系统设置里重新允许", kind: "warn" };
  if (p === "unsupported") return { text: "这个浏览器不支持系统通知，只用站内横幅", kind: "" };
  return { text: "还没开启，点下面的按钮允许一次", kind: "" };
}
