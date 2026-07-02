// ====== 小本本 · 跨设备同步 (Supabase) ======
// 使用 Supabase 免费版作为云数据库后端
// 手机和电脑使用同一个 token 加入同一个"房间"

(function() {
  "use strict";

  var CONFIG_KEY = "xbbs_sync_config_v2";

  // ---- 内部状态 ----
  var config = { url: "", anonKey: "", token: "" };
  var pollTimer = null;
  var onDataCallback = null;
  var lastUpdatedAt = null;
  var isPushing = false;
  var statusChangeHandler = function() {};
  var currentStatus = "disconnected"; // disconnected | connecting | connected

  // ---- 本地配置读写 ----
  function loadConfig() {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.url) config.url = parsed.url;
        if (parsed.anonKey) config.anonKey = parsed.anonKey;
        if (parsed.token) config.token = parsed.token;
      }
    } catch(e) {}
  }

  function saveConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  // ---- 触发状态变化 ----
  function setStatus(s) {
    if (currentStatus !== s) {
      currentStatus = s;
      statusChangeHandler();
    }
  }

  // ---- 轮询：检查远端是否有新数据 ----
  async function poll() {
    if (!pollTimer || !onDataCallback) return;
    try {
      var res = await fetch(config.url + "/rest/v1/sync_rooms?token=eq." + encodeURIComponent(config.token) + "&select=data,updated_at&order=updated_at.desc&limit=1", {
        headers: {
          "apikey": config.anonKey,
          "Authorization": "Bearer " + config.anonKey
        }
      });
      if (!res.ok) return;
      var records = await res.json();
      if (records.length === 0) return;

      var record = records[0];
      var newTime = record.updated_at;
      if (newTime !== lastUpdatedAt && !isPushing && record.data) {
        lastUpdatedAt = newTime;
        onDataCallback(record.data);
      }
    } catch(e) { /* silent */ }
  }

  // ---- 公开 API ----
  window.Sync = {
    getConfig: function() {
      return { url: config.url, anonKey: config.anonKey, token: config.token };
    },

    saveConfig: function(url, anonKey, token) {
      config.url = url.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
      config.anonKey = anonKey.trim();
      config.token = token.trim();
      saveConfig();
    },

    getStatus: function() {
      return currentStatus;
    },

    connect: async function() {
      if (!config.url || !config.anonKey || !config.token) {
        throw new Error("请先填写 Supabase URL、Anon Key 和同步令牌");
      }

      // 先断开
      this.disconnect();
      setStatus("connecting");

      try {
        // 尝试拉取已有数据
        var res = await fetch(config.url + "/rest/v1/sync_rooms?token=eq." + encodeURIComponent(config.token) + "&select=data,updated_at&order=updated_at.desc&limit=1", {
          headers: {
            "apikey": config.anonKey,
            "Authorization": "Bearer " + config.anonKey
          }
        });

        if (!res.ok) {
          var errText = await res.text().catch(function(){ return ""; });
          setStatus("disconnected");
          throw new Error("连接失败 (HTTP " + res.status + "): " + (errText || "请检查 URL 和 Key 是否正确"));
        }

        var records = await res.json();
        if (records.length > 0 && records[0].data && onDataCallback) {
          lastUpdatedAt = records[0].updated_at;
          onDataCallback(records[0].data);
        } else if (records.length === 0) {
          // 房间不存在，尝试初始化
          try {
            await fetch(config.url + "/rest/v1/sync_rooms", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": config.anonKey,
                "Authorization": "Bearer " + config.anonKey,
                "Prefer": "resolution=merge-duplicates"
              },
              body: JSON.stringify({
                token: config.token,
                data: {},
                updated_at: new Date().toISOString()
              })
            });
          } catch(e) { /* ignore */ }
        }

        // 开始轮询（每 3 秒检查）
        pollTimer = setInterval(poll, 3000);
        setStatus("connected");
        return true;
      } catch(e) {
        setStatus("disconnected");
        throw e;
      }
    },

    disconnect: function() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      lastUpdatedAt = null;
      setStatus("disconnected");
    },

    push: async function(data) {
      if (!pollTimer) return;
      isPushing = true;

      try {
        var now = new Date().toISOString();
        var res = await fetch(config.url + "/rest/v1/sync_rooms?on_conflict=token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": config.anonKey,
            "Authorization": "Bearer " + config.anonKey,
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            token: config.token,
            data: data,
            updated_at: now
          })
        });

        if (res.ok) {
          lastUpdatedAt = now;
        }
      } catch(e) {
        console.warn("同步推送失败:", e);
      }

      isPushing = false;
    },

    onData: function(callback) {
      onDataCallback = callback;
    },

    onStatusChange: function(fn) {
      statusChangeHandler = fn;
    },

    clearConfig: function() {
      config = { url: "", anonKey: "", token: "" };
      localStorage.removeItem(CONFIG_KEY);
      this.disconnect();
    }
  };

  // 启动时加载已保存的配置
  loadConfig();
})();
