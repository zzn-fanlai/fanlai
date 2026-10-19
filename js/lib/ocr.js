/* ============================================================
   饭来 · 截图文字识别（浏览器本地 OCR，零后端）
   ------------------------------------------------------------
   用 Tesseract.js（WASM）在手机上跑识别：
   - 首次使用需要下载 ~10MB 语言包（之后走浏览器缓存）
   - 只在用户主动点「识别」时才加载，不影响 App 启动
   - CDN 有多个备选，全部失败时给出明确提示（改走"复制文字"）
   识别结果一律交给「确认页」人工校对，不做自动入库。
   ============================================================ */

const SCRIPT_CDNS = [
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js",
  "https://cdn.bootcdn.net/ajax/libs/tesseract.js/5.1.1/tesseract.min.js",
  "https://cdn.staticfile.org/tesseract.js/5.1.1/tesseract.min.js",
];

const LANG_PATHS = [
  "https://tessdata.projectnaptha.com/4.0.0",
  "https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_sim/4.0.0_best_int",
  "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0",
  "https://unpkg.com/@tesseract.js-data/chi_sim/4.0.0_best_int",
];

let scriptPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("加载失败：" + src));
    document.head.appendChild(s);
  });
}

async function ensureTesseract() {
  if (typeof window !== "undefined" && window.Tesseract) return window.Tesseract;
  if (scriptPromise) return scriptPromise;
  scriptPromise = (async () => {
    let lastErr = null;
    for (const src of SCRIPT_CDNS) {
      try {
        await loadScript(src);
        if (window.Tesseract) return window.Tesseract;
      } catch (err) {
        lastErr = err;
      }
    }
    scriptPromise = null;
    throw new Error(
      "识别引擎加载失败（网络受限）。可以改用：截图后在相册长按复制文字 → 粘进来。" +
        (lastErr ? "（" + lastErr.message + "）" : "")
    );
  })();
  return scriptPromise;
}

/** 清理 OCR 常见噪声：中文之间多余空格、全角数字、水印行 */
export function cleanOcrText(raw) {
  let t = String(raw || "");
  // 全角数字/字母 → 半角
  t = t.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // 中文之间的空格（OCR 很爱插）
  t = t.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, "$1");
  // 行首行尾空白
  t = t
    .split("\n")
    .map((l) => l.replace(/^\s+|\s+$/g, ""))
    .filter((l) => {
      if (!l) return false;
      // 纯装饰/水印行
      if (/^[·•—\-_=*~.]{2,}$/.test(l)) return false;
      if (/^(小红书|抖音|关注|点赞|收藏|分享|评论|展开|全文|广告)/.test(l) && l.length <= 12) return false;
      return true;
    })
    .join("\n");
  // 压缩空行
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * 识别图片中的文字
 * @param {File|Blob} file
 * @param {{onProgress?: (p:number)=>void, onStage?: (s:string)=>void}} opts
 * @returns {Promise<string>} 清理后的文本
 */
export async function recognizeImage(file, { onProgress, onStage } = {}) {
  const Tesseract = await ensureTesseract();
  onStage && onStage("引擎已就绪，正在加载中文语言包…");

  let lastErr = null;
  for (const langPath of LANG_PATHS) {
    let worker = null;
    try {
      worker = await Tesseract.createWorker("chi_sim", 1, {
        langPath,
        logger: (m) => {
          if (m.status === "recognizing text" && onProgress) onProgress(m.progress || 0);
          else if (m.status && onStage) onStage(m.status);
        },
        errorHandler: () => {},
      });
      onStage && onStage("正在识别…");
      const { data } = await worker.recognize(file);
      await worker.terminate();
      return cleanOcrText(data.text || "");
    } catch (err) {
      lastErr = err;
      try {
        if (worker) await worker.terminate();
      } catch (_) {
        /* ignore */
      }
    }
  }
  throw new Error(
    "语言包加载失败（网络受限）。可以改用：截图后在相册长按复制文字 → 粘进来。" +
      (lastErr ? "（" + (lastErr.message || lastErr) + "）" : "")
  );
}

/** 环境是否支持（有 canvas 即可，实际能否联网由运行时决定） */
export function ocrSupported() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}
