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

/** 清理 OCR 常见噪声：全角数字、标点两侧空格、水印行
 *  注意：不能把中文字之间的空格全删掉 —— Tesseract 用空格分隔食材条目
 *  （"排骨 螺丝椒"），删了就会粘成一个词。每字一空格的极端情况交给解析器容忍。
 */
export function cleanOcrText(raw) {
  let t = String(raw || "");
  // 全角数字/字母 → 半角
  t = t.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // 标点两侧的空格
  t = t.replace(/[ \t]*([，。；：！？、,.!?;:])[ \t]*/g, "$1");
  // 行首行尾空白
  t = t
    .split("\n")
    .map((l) => l.replace(/^\s+|\s+$/g, ""))
    .filter((l) => {
      if (!l) return false;
      // 纯装饰/水印行
      if (/^[·•—\-_=*~.]{2,}$/.test(l)) return false;
      if (/^(小红书|抖音|关注|点赞|收藏|分享|评论|展开|全文|广告)/.test(l) && l.length <= 12) return false;
      // 纯符号/表情行
      if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(l)) return false;
      // 输入框占位、评论区
      if (/说点什么|写评论|条评论/.test(l)) return false;
      // 中英混杂的界面文字（作者签名、"Niceto eat U" 之类）
      if (/[A-Za-z]{4,}/.test(l) && /[\u4e00-\u9fa5]/.test(l)) return false;
      return true;
    })
    .join("\n");
  // 压缩空行
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/**
 * 版面还原：把 Tesseract 的输出收拾成"每行一个语义块"
 * ------------------------------------------------------------
 * 真实截图 OCR 有三个顽疾：
 *   1. 每个汉字之间插空格（"超 级 下 饭 的"）
 *   2. 一行被截断，后半行跑到下一行（"鸡" + "精、是 油"）
 *   3. 步骤编号被认成一两个乱码字（"吕:" "品" "司|"）
 * 这里：去逐字空格 → 按"新块标记"判断哪些行是续行并拼接
 */
export function reflowOcrText(raw) {
  let t = String(raw || "");

  // 1) 去掉汉字之间的空格（保留换行！不能用 \s）
  t = t.replace(/([\u4e00-\u9fa5])[ \t]*(?=[\u4e00-\u9fa5])/g, "$1");
  // 2) 去掉标点/分隔符两侧空格
  t = t.replace(/[ \t]*([，。；：！？、,.!?;:|｜])[ \t]*/g, "$1");

  const lines = t
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      // 这些行整条丢弃：话题标签、日期地点、评论数、占位文案
      if (/^(#\s*[^\s#]+\s*)+$/.test(s.replace(/[ \t]/g, ""))) return false;
      if (/^\d{1,2}\s*月\s*\d{1,2}\s*日/.test(s)) return false;
      if (/^共\s*\d+\s*条评论/.test(s)) return false;
      if (/说点什么|写评论|条评论/.test(s)) return false;
      if (/^[\d\s%+.,:：()）)…·]+$/.test(s)) return false;
      return true;
    });

  /** 这一行是否开启一个新语义块 */
  const isNewBlock = (s) =>
    /^(食材|调料|用料|配料|主料|辅料|原料|腌料|调味料|调味|佐料)/.test(s) ||
    /^(做法|步骤|制作方法|制作步骤|小贴士|注意事项|提示)/.test(s) ||
    /^[\u4e00-\u9fa5]{1,3}\s*[：:|｜]/.test(s) || // "吕:" "司 |"
    /^[\u4e00-\u9fa5]{1,6}\s*[：:]\s*.{4,}/.test(s); // "品制作烧椒:…"

  const out = [];
  let insideBlock = false;
  for (const line of lines) {
    if (isNewBlock(line)) {
      out.push(line);
      insideBlock = true;
      continue;
    }
    // 还没进入任何分区（标题 / 引子）：每行独立
    if (!insideBlock || !out.length) {
      out.push(line);
      continue;
    }
    // 分区内的续行：拼到上一行
    const prev = out[out.length - 1];
    const needSpace = /[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(line);
    out[out.length - 1] = prev + (needSpace ? " " : "") + line;
  }
  return out.join("\n");
}
export function assessOcrQuality(text, parsed) {
  const hints = [];
  let score = 100;
  const t = String(text || "");
  const cjk = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (cjk < 20) {
    score -= 40;
    hints.push("认出来的汉字太少，截图可能太糊或字太小");
  }
  if (!parsed) return { ok: false, score: 0, hints: ["没有解析出内容"] };

  const ing = parsed.ingredients || [];
  const steps = parsed.steps || [];
  if (!ing.length) {
    score -= 25;
    hints.push("没认出食材");
  }
  if (!steps.length) {
    score -= 30;
    hints.push("没认出做法步骤");
  }
  // 食材名里混进句子
  const dirty = ing.filter((i) => /炒|煮|放入|加入|盛出|捞出|翻炒|备用|锅热|小火|大火/.test(i.name));
  if (dirty.length) {
    score -= 25;
    hints.push(`有 ${dirty.length} 条食材其实是做法句子`);
  }
  // 单字食材过多（"菠""六""酷" 这类乱码）
  const short = ing.filter((i) => String(i.name).length === 1);
  if (short.length >= 2) {
    score -= 20;
    hints.push(`有 ${short.length} 个单字食材，可能是识别错误`);
  }
  if (!parsed.title) {
    score -= 10;
    hints.push("没认出菜名");
  }
  return { ok: score >= 60, score: Math.max(0, score), hints };
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
      return reflowOcrText(cleanOcrText(data.text || ""));
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
