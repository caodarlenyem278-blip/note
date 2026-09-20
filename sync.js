// ====== 小本本 · 跨设备同步 (GitHub Gist) v20 ======
// 实现：使用 GitHub Gist 作为云端存储后端
//  - 一个 Private Gist 中的单文件 xiaobenben.json 存储全部数据
//  - 3 秒轮询 fetch，对比 updated_at；推送使用 PATCH（自带 sha 乐观锁）
//  - 文件 sha + 字符串对比避免无意义写入；时间戳格式由 GitHub 稳定返回
//  - 替代之前 Supabase 实现，原因是 Supabase 的 updated_at 在毫秒 vs 微秒精度下会让前端永远匹配不上，导致 8/16 后同步静默失效

(function() {
  "use strict";

  var CONFIG_KEY = "xbbs_sync_gist_config_v1";
  var GIST_FILENAME = "xiaobenben.json";
  var API_BASE = "https://api.github.com";
  var DEFAULT_DATA = '{"journals":[],"todos":[],"dones":[],"dietTarget":2000,"dietLogs":{}}';

  // ---- 内部状态 ----
  var config = { token: "", gistId: "" };
  var pollTimer = null;
  var onDataCallback = null;
  var isPushing = false;
  var lastUpdatedAt = null;
  var lastFileSha = null;
  var statusChangeHandler = function() {};
  var currentStatus = "disconnected";

  // ---- localStorage 读写 ----
  function loadConfig() {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.token) config.token = parsed.token;
        if (parsed.gistId) config.gistId = parsed.gistId;
      }
    } catch(e) {}
  }

  function saveConfig() {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch(e) {}
  }

  function setStatus(s) {
    if (currentStatus === s) return;
    currentStatus = s;
    try { statusChangeHandler(); } catch(e) {}
  }

  // ---- 网络工具 ----
  function ghHeaders(extra) {
    var h = {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + config.token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function explainStatus(res) {
    if (res.status === 401) return "Token 无效或已过期（HTTP 401）。请到 https://github.com/settings/tokens 检查";
    if (res.status === 403) return "权限不足或速率受限（HTTP 403）。Token 需要勾选 gist 权限";
    if (res.status === 404) return "找不到该 Gist（HTTP 404）。请检查 Gist ID 是否正确";
    return "HTTP " + res.status;
  }

  // ---- Gist 操作 ----
  async function fetchGist() {
    var res = await fetch(API_BASE + "/gists/" + encodeURIComponent(config.gistId), {
      headers: ghHeaders()
    });
    if (!res.ok) throw new Error("拉取 Gist 失败：" + explainStatus(res));
    return res.json();
  }

  async function patchGistContent(jsonStr) {
    // 先 GET 拿最新 sha
    var cur = await fetchGist();
    var filesObj = {};
    filesObj[GIST_FILENAME] = { content: jsonStr };
    var patchRes = await fetch(API_BASE + "/gists/" + encodeURIComponent(config.gistId), {
      method: "PATCH",
      headers: ghHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ files: filesObj })
    });
    if (!patchRes.ok) throw new Error("推送 Gist 失败：" + explainStatus(patchRes));
    return patchRes.json();
  }

  async function createNewGist(token) {
    var tmpToken = config.token;
    config.token = (token || "").trim();
    var filesObj = {};
    filesObj[GIST_FILENAME] = { content: DEFAULT_DATA };
    var res = await fetch(API_BASE + "/gists", {
      method: "POST",
      headers: ghHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        description: "小本本 · 我的日常 (xiaobenben) 同步数据（请勿手动删除）",
        public: false,
        files: filesObj
      })
    });
    if (!res.ok) {
      config.token = tmpToken;
      throw new Error("创建 Gist 失败：" + explainStatus(res));
    }
    var gist = await res.json();
    config.gistId = gist.id;
    saveConfig();
    return gist;
  }

  // ---- 轮询 ----
  async function poll() {
    if (!pollTimer) return;
    if (isPushing) return;
    if (!config.token || !config.gistId) return;
    try {
      var cur = await fetchGist();
      var file = cur.files ? cur.files[GIST_FILENAME] : null;
      if (!file) return;
      var newTime = cur.updated_at;
      if (newTime !== lastUpdatedAt && file.content) {
        var parsed = null;
        try { parsed = JSON.parse(file.content); } catch(e) { return; }
        lastUpdatedAt = newTime;
        lastFileSha = file.sha;
        if (onDataCallback) onDataCallback(parsed);
      } else {
        // 即使没有变化，也更新时间戳，避免失同步
        lastUpdatedAt = newTime;
        lastFileSha = file.sha;
      }
    } catch(e) {
      console.warn("[sync] 轮询失败:", e.message);
    }
  }

  // ---- 公开 API ----
  window.Sync = {
    /** 当前配置（脱敏后仅返回 gistId 和 token 是否存在） */
    getConfig: function() {
      return {
        token: config.token,
        gistId: config.gistId,
        hasToken: !!config.token,
        hasGistId: !!config.gistId
      };
    },

    saveConfig: function(token, gistId) {
      config.token = (token || "").trim();
      config.gistId = (gistId || "").trim();
      saveConfig();
    },

    getStatus: function() { return currentStatus; },

    /** 用一个 PAT 自动创建一个 private Gist，作为同步空间 */
    createGist: async function(token) {
      return await createNewGist(token);
    },

    /**
     * 连接同步。如果 gist 已有数据会立即下发到本地。
     * @param {object} data 当前可选传入本地数据，若提供则连接成功后立即推送一次（首次迁移用）
     */
    connect: async function(data) {
      if (!config.token) throw new Error("请先填写 GitHub Personal Access Token");
      if (!config.gistId) throw new Error("请先填写 Gist ID，或点击「📝 自动创建新 Gist」生成");

      this.disconnect();
      setStatus("connecting");

      try {
        // 拉取 Gist
        var cur = await fetchGist();
        var file = cur.files ? cur.files[GIST_FILENAME] : null;

        // 如果 Gist 中没有数据文件，初始化
        if (!file) {
          var filesObj = {};
          filesObj[GIST_FILENAME] = { content: DEFAULT_DATA };
          var initRes = await fetch(API_BASE + "/gists/" + encodeURIComponent(config.gistId), {
            method: "PATCH",
            headers: ghHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ files: filesObj })
          });
          if (!initRes.ok) throw new Error("初始化 Gist 文件失败：" + explainStatus(initRes));
          cur = await initRes.json();
          file = cur.files[GIST_FILENAME];
        }

        lastUpdatedAt = cur.updated_at;
        lastFileSha = file.sha;

        // 判断 gist 是不是空的默认数据
        var parsed = null;
        try { parsed = JSON.parse(file.content); } catch(e) {}
        var isGistEmpty = !parsed ||
          (Array.isArray(parsed.journals) && parsed.journals.length === 0 &&
           Array.isArray(parsed.todos) && parsed.todos.length === 0 &&
           Array.isArray(parsed.dones) && parsed.dones.length === 0 &&
           (!parsed.dietLogs || Object.keys(parsed.dietLogs).length === 0));

        // 1) 如果传入了本地数据且 gist 为空 → 立即把本地数据推上去（首次迁移）
        if (data && isGistEmpty) {
          await this.push(data);
        }

        // 2) 如果 gist 有内容，下发到本地
        if (!isGistEmpty && onDataCallback) {
          onDataCallback(parsed);
        }

        // 启动 3 秒轮询
        pollTimer = setInterval(poll, 3000);
        setStatus("connected");
        return true;
      } catch(e) {
        setStatus("disconnected");
        throw e;
      }
    },

    disconnect: function() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      lastUpdatedAt = null;
      lastFileSha = null;
      setStatus("disconnected");
    },

    push: async function(data) {
      if (!config.token || !config.gistId) return;
      if (!data) return;
      isPushing = true;
      try {
        var json = JSON.stringify(data, null, 2);
        var patched = await patchGistContent(json);
        lastUpdatedAt = patched.updated_at;
        if (patched.files && patched.files[GIST_FILENAME]) {
          lastFileSha = patched.files[GIST_FILENAME].sha;
        }
      } catch(e) {
        console.warn("[sync] 推送失败:", e.message);
      }
      isPushing = false;
    },

    onData: function(cb) { onDataCallback = cb; },

    onStatusChange: function(fn) { statusChangeHandler = fn; },

    clearConfig: function() {
      config = { token: "", gistId: "" };
      try { localStorage.removeItem(CONFIG_KEY); } catch(e) {}
      this.disconnect();
    }
  };

  loadConfig();
})();
