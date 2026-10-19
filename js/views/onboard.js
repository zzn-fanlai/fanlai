/* ============================================================
   饭来 · 引导：创建/加入房间 + 认领身份
   ============================================================ */
import { store, select } from "../store.js";
import { sync, sbFetch } from "../sync.js";
import { esc, attr, uid, roomCode, copyText, shareText } from "../lib/util.js";
import { ROLES } from "../lib/catalog.js";
import { toast, notice, confirmAction, rerender } from "../ui/kit.js";

let draft = null;

function reset() {
  draft = {
    step: "welcome", // welcome | create | join | done
    nickname: "",
    role: "diner",
    code: "",
    busy: false,
    error: "",
  };
}

function localOnly() {
  return !store.state.sync.url || !store.state.sync.key;
}

/** 引导流程进行中（此时即使已有房间也不应被路由踢走） */
export function isActive() {
  return !!draft && draft.step !== "welcome";
}

export function render() {
  if (!draft) reset();
  const html = TEMPLATES[draft.step]();
  return {
    hideTop: true,
    hideTab: true,
    title: "饭来",
    html,
    actions: ACTIONS,
    afterRender(root) {
      const nick = root.querySelector("#nick-input");
      if (nick) {
        nick.value = draft.nickname;
        nick.addEventListener("input", () => (draft.nickname = nick.value));
        nick.addEventListener("keydown", (e) => {
          if (e.key === "Enter") e.preventDefault();
        });
      }
      const codeInput = root.querySelector("#code-input");
      if (codeInput) {
        codeInput.value = draft.code;
        codeInput.addEventListener("input", () => {
          draft.code = codeInput.value.replace(/\D/g, "").slice(0, 6);
          codeInput.value = draft.code;
          const btn = root.querySelector('[data-act="submit-join"]');
          if (btn) btn.disabled = draft.code.length !== 6;
        });
      }
    },
  };
}

/* ---------- 片段 ---------- */
function brand(extra = "") {
  return `<div class="center" style="padding:26px 6px 8px">
    <div style="font-size:56px;line-height:1.1">🍚</div>
    <h1 style="font-size:30px;letter-spacing:6px;margin:6px 0 4px">饭来</h1>
    <div class="muted small">两个人的吃饭小本子</div>
    ${extra}
  </div>`;
}

function rolePicker() {
  return `<div class="field">
    <label>你是…</label>
    <div class="role-pick">
      ${Object.values(ROLES)
        .map(
          (r) => `<button type="button" class="role-card ${draft.role === r.key ? "on" : ""}" data-act="pick-role" data-role="${r.key}">
            <div class="rc-emoji">${r.emoji}</div>
            <div class="rc-name">${r.label}</div>
            <div class="rc-desc">${r.desc}</div>
          </button>`
        )
        .join("")}
    </div>
    <div class="hint">选好之后就固定了，以后可以在「我的」里改。</div>
  </div>`;
}

function nickField(placeholder = "比如：小馋虫") {
  return `<div class="field">
    <label>你的昵称</label>
    <input class="input" id="nick-input" maxlength="12" placeholder="${attr(placeholder)}" autocomplete="off" />
    <div class="hint">对方能看到这个称呼，改天也能改。</div>
  </div>`;
}

const TEMPLATES = {
  welcome() {
    return `<div class="ob-wrap" style="padding-top:0">
      ${brand()}
      <div class="card sticker" style="margin-top:16px">
        <div style="line-height:1.9;font-size:14.5px">
          <p>👨‍🍳 <b>做饭区</b>：想吃就说，大厨接单，自动出买菜清单和步骤。</p>
          <p>🍽️ <b>外食区</b>：想去哪家就提，两个人都点头才出门。</p>
          <p>🛵 <b>外卖区</b>：累到不想动的时候用。</p>
        </div>
      </div>
      <div class="btn-row" style="gap:10px;margin-top:16px">
        <button class="btn btn-primary" data-act="to-create" style="flex:1.1">开个房间</button>
        <button class="btn" data-act="to-join" style="flex:1">加入房间</button>
      </div>
      ${localOnly() ? notice("还没配置云端：先自己用也可以，之后在「我的 → 同步设置」里填上就能两人共享。", "") : ""}
      <div class="center muted tiny" style="margin-top:18px">数据存在你自己的 Supabase 里，不上传第三方。</div>
    </div>`;
  },

  create() {
    return `<div class="ob-wrap">
      <div class="page-head" style="margin-top:4px">
        <h2>开个房间</h2>
        <span class="hand">先给自己起个名</span>
      </div>
      ${nickField()}
      ${rolePicker()}
      <button class="btn btn-primary btn-block mt-10" data-act="submit-create">建房间</button>
      <button class="btn btn-ghost btn-block mt-6" data-act="back-welcome">返回</button>
    </div>`;
  },

  join() {
    return `<div class="ob-wrap">
      <div class="page-head" style="margin-top:4px">
        <h2>加入房间</h2>
        <span class="hand">6 位数字</span>
      </div>
      <div class="field">
        <label>房间码</label>
        <input class="input" id="code-input" inputmode="numeric" maxlength="6" placeholder="例如 482910"
               style="font-size:26px;letter-spacing:10px;text-align:center;font-weight:800" autocomplete="off" />
        <div class="hint">问 TA 要，或者翻一下聊天记录。</div>
      </div>
      ${nickField()}
      ${rolePicker()}
      <button class="btn btn-primary btn-block mt-10" data-act="submit-join" disabled>加入</button>
      <button class="btn btn-ghost btn-block mt-6" data-act="back-welcome">返回</button>
    </div>`;
  },

  done() {
    const code = store.state.room?.code || draft.code;
    return `<div class="ob-wrap">
      <div class="center" style="padding-top:26px">
        <div style="font-size:48px">🎉</div>
        <h2 style="margin:8px 0 4px">房间好了</h2>
        <div class="muted small">把这个码发给 TA，TA 在「加入房间」里输入就行</div>
      </div>
      <div class="roomcode">${String(code)
        .split("")
        .map((c) => `<span>${esc(c)}</span>`)
        .join("")}</div>
      <div class="btn-row">
        <button class="btn" data-act="copy-code">复制房间码</button>
        <button class="btn" data-act="share-invite">发微信</button>
      </div>
      <div class="card mt-16" style="background:var(--cream-2);border-style:dashed">
        <div class="small muted" style="line-height:1.8">
          你现在是 <b>${esc(ROLES[draft.role]?.label || "")}</b>。
          等 TA 也进来了，${draft.role === "chef" ? "TA 点的菜会出现在首页红点上" : "你就可以开始点菜了"}。
        </div>
      </div>
      <button class="btn btn-primary btn-block mt-16" data-act="finish">进入饭来</button>
      ${localOnly() ? notice("现在是<b>仅本机模式</b>：TA 进不来。去「我的 → 同步设置」填 Supabase 配置。", "warn") : ""}
    </div>`;
  },
};

/* ---------- 动作 ---------- */
function ensureProfile() {
  const nickname = (draft.nickname || "").trim() || ROLES[draft.role].defaultNick;
  if (store.state.profile) {
    store.setProfile({ role: draft.role, nickname });
    return store.state.profile;
  }
  return store.initProfile({ deviceId: uid("dev"), role: draft.role, nickname });
}

function upsertMyMember(code, profile) {
  const id = `${code}_${profile.deviceId}`;
  const existing = store.get("members", id);
  const row = {
    id,
    room_code: code,
    device_id: profile.deviceId,
    role: profile.role,
    nickname: profile.nickname,
    joined_at: existing?.joined_at || Date.now(),
  };
  if (existing) store.update("members", id, row);
  else store.create("members", row);
}

async function cloudRoomExists(code) {
  const c = sync.config();
  if (!c.url || !c.key) return { checked: false, exists: true };
  try {
    const res = await sbFetch(`${c.url}/rest/v1/rooms?select=code&code=eq.${encodeURIComponent(code)}`, c.key);
    if (!res.ok) return { checked: false, exists: true, error: `云端查询失败 ${res.status}` };
    const rows = await res.json();
    return { checked: true, exists: rows.length > 0 };
  } catch (err) {
    return { checked: false, exists: true, error: String(err?.message || err) };
  }
}

const ACTIONS = {
  "to-create"() {
    draft.step = "create";
    draft.nickname = "";
    draft.role = "diner";
    renderCurrent();
  },
  "to-join"() {
    draft.step = "join";
    draft.nickname = "";
    draft.role = "chef";
    renderCurrent();
  },
  "back-welcome"() {
    draft.step = "welcome";
    renderCurrent();
  },
  "pick-role"(el) {
    draft.role = el.dataset.role;
    renderCurrent();
  },

  async "submit-create"() {
    if (draft.busy) return;
    const nickname = (draft.nickname || "").trim();
    if (!nickname) {
      toast("先起个昵称吧");
      return;
    }
    draft.busy = true;
    const code = roomCode();
    const profile = ensureProfile();
    store.setRoom({ code, createdAt: Date.now() });
    upsertMyMember(code, profile);
    store.setLocal({ onboardSeen: true });
    draft.code = code;
    draft.step = "done";
    draft.busy = false;
    renderCurrent();
    sync.run({ force: true });
  },

  async "submit-join"() {
    if (draft.busy) return;
    if (draft.code.length !== 6) {
      toast("房间码是 6 位数字");
      return;
    }
    const nickname = (draft.nickname || "").trim();
    if (!nickname) {
      toast("先起个昵称吧");
      return;
    }
    draft.busy = true;
    const check = await cloudRoomExists(draft.code);
    draft.busy = false;
    if (check.checked && !check.exists) {
      draft.error = "这个房间码不存在";
      toast("这个房间码不存在，再核对一下？", "err");
      return;
    }
    if (!check.checked && check.error) {
      const ok = await confirmAction({
        title: "暂时连不上云端",
        desc: `${check.error}\n要先用这个房间码在本机继续吗？联网后会自动对上。`,
        ok: "继续",
      });
      if (!ok) return;
    }
    const profile = ensureProfile();
    store.setRoom({ code: draft.code, createdAt: Date.now() });
    upsertMyMember(draft.code, profile);
    store.setLocal({ onboardSeen: true });
    draft.step = "done";
    renderCurrent();
    sync.run({ force: true });
  },

  async "copy-code"() {
    const code = store.state.room?.code || draft.code;
    const ok = await copyText(code);
    toast(ok ? "房间码已复制" : "复制失败，手输一下吧", ok ? "ok" : "err");
  },

  async "share-invite"() {
    const code = store.state.room?.code || draft.code;
    const text = `来「饭来」一起记吃饭吧～ 房间码：${code}\n打开饭来 → 加入房间 → 输入这 6 位数字。`;
    const r = await shareText("饭来 · 一起吃饭", text);
    if (r === "copied") toast("邀请文案已复制，粘贴给 TA", "ok");
    if (r === "failed") toast("分享失败，手动抄一下房间码吧", "err");
  },

  finish() {
    draft = null;
    location.replace("#/cook");
  },
};

function renderCurrent() {
  if (location.hash !== "#/onboard") location.hash = "#/onboard";
  rerender();
}
