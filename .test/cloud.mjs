// src/core/logger.ts
var MAX_ENTRIES = 1e3;
var MIN_LEVEL = "debug";
var LEVEL_WEIGHT = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
var seq = 0;
var buffer = [];
var snapshot = buffer;
var listeners = /* @__PURE__ */ new Set();
function emit() {
  snapshot = buffer.slice();
  for (const fn of listeners) fn();
}
function fmtData(data) {
  if (data === void 0) return "";
  if (data instanceof Error) return `${data.name}: ${data.message}`;
  return data;
}
function log(level, scope, msg, data) {
  const entry = { id: seq += 1, ts: Date.now(), level, scope, msg, data };
  if (LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[MIN_LEVEL]) {
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(buffer.length - MAX_ENTRIES);
    emit();
  }
  const tag = `%c[vocab:${scope}]`;
  const style = level === "error" ? "color:#ff453a;font-weight:600" : level === "warn" ? "color:#ff9f0a;font-weight:600" : level === "debug" ? "color:#8e8e93" : "color:#0a84ff;font-weight:600";
  const payload = fmtData(data);
  if (level === "error") console.error(tag, style, msg, payload);
  else if (level === "warn") console.warn(tag, style, msg, payload);
  else if (level === "debug") console.debug(tag, style, msg, payload);
  else console.log(tag, style, msg, payload);
}
var logger = {
  debug: (scope, msg, data) => log("debug", scope, msg, data),
  info: (scope, msg, data) => log("info", scope, msg, data),
  warn: (scope, msg, data) => log("warn", scope, msg, data),
  error: (scope, msg, data) => log("error", scope, msg, data)
};

// src/core/cloud.ts
var RAW_URL = "https://demo.supabase.co".trim();
var RAW_KEY = "demo-key".trim();
var BASE_URL = RAW_URL.replace(/\/+$/, "");
var ANON_KEY = RAW_KEY;
var cloudConfigured = Boolean(BASE_URL && ANON_KEY);
var TABLE = "user_kv";
var SESSION_KEY = "shici:cloud:session";
var EMAIL_DOMAIN = "shici.app";
function toEmail(name) {
  const raw = name.trim().toLowerCase();
  if (raw.includes("@")) return raw;
  const safe = [...raw].map((c) => /[a-z0-9._-]/.test(c) ? c : `x${c.codePointAt(0).toString(16)}`).join("");
  return `${safe || "user"}@${EMAIL_DOMAIN}`;
}
var CloudError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "CloudError";
  }
  status;
};
function humanize(raw, status) {
  const text = raw || "";
  const table = [
    [/invalid login credentials/i, "\u7528\u6237\u540D\u6216\u5BC6\u7801\u4E0D\u6B63\u786E"],
    [/user already registered|already been registered/i, "\u8FD9\u4E2A\u7528\u6237\u540D\u5DF2\u7ECF\u88AB\u6CE8\u518C\u4E86"],
    [/email not confirmed/i, "\u8D26\u53F7\u8FD8\u672A\u9A8C\u8BC1\uFF0C\u8BF7\u5728 Supabase \u540E\u53F0\u5173\u95ED\u300CConfirm email\u300D"],
    [/password should be at least/i, "\u5BC6\u7801\u81F3\u5C11 6 \u4F4D"],
    [/invalid email/i, "\u7528\u6237\u540D\u683C\u5F0F\u4E0D\u88AB\u63A5\u53D7\uFF0C\u6362\u4E00\u4E2A\u8BD5\u8BD5"],
    [/rate limit|too many requests/i, "\u64CD\u4F5C\u592A\u9891\u7E41\uFF0C\u7A0D\u540E\u518D\u8BD5"],
    [/jwt expired/i, "\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55"]
  ];
  for (const [re, msg] of table) if (re.test(text)) return msg;
  if (status === 0 || /failed to fetch|networkerror|load failed/i.test(text)) {
    return "\u8FDE\u4E0D\u4E0A\u4E91\u670D\u52A1\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\uFF08\u6570\u636E\u5DF2\u4FDD\u5B58\u5728\u672C\u673A\uFF09";
  }
  return text || `\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${status ?? "\u672A\u77E5"}\uFF09`;
}
async function apiFetch(path, init = {}, token) {
  const headers = {
    apikey: ANON_KEY,
    "Content-Type": "application/json",
    ...init.headers ?? {}
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    logger.warn("cloud", "\u8BF7\u6C42\u672A\u9001\u8FBE", { path, err });
    throw new CloudError(humanize(String(err), 0), 0);
  }
  if (!res.ok) {
    const text2 = await res.text().catch(() => "");
    let detail = text2;
    try {
      const parsed = JSON.parse(text2);
      detail = String(
        parsed.msg ?? parsed.message ?? parsed.error_description ?? parsed.error ?? text2
      );
    } catch {
    }
    throw new CloudError(humanize(detail, res.status), res.status);
  }
  if (res.status === 204) return void 0;
  const text = await res.text();
  if (!text) return void 0;
  return JSON.parse(text);
}
function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.accessToken || !s?.refreshToken) return null;
    return s;
  } catch {
    return null;
  }
}
function writeSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
  }
}
function fromGoTrue(data, fallbackName) {
  const s = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1e3,
    userId: data.user.id,
    username: data.user.user_metadata?.username ?? fallbackName,
    email: data.user.email ?? toEmail(fallbackName),
    createdAt: data.user.created_at ? Date.parse(data.user.created_at) : Date.now()
  };
  writeSession(s);
  return s;
}
var refreshing = null;
async function currentSession() {
  const s = readSession();
  if (!s) return null;
  if (s.expiresAt - Date.now() > 6e4) return s;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const data = await apiFetch(
          "/auth/v1/token?grant_type=refresh_token",
          { method: "POST", body: JSON.stringify({ refresh_token: s.refreshToken }) }
        );
        logger.debug("cloud", "\u767B\u5F55\u51ED\u8BC1\u5DF2\u5237\u65B0");
        return fromGoTrue(data, s.username);
      } catch (err) {
        logger.warn("cloud", "\u767B\u5F55\u72B6\u6001\u5DF2\u5931\u6548\uFF0C\u9700\u8981\u91CD\u65B0\u767B\u5F55", err);
        writeSession(null);
        return null;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}
async function accessToken() {
  const s = await currentSession();
  return s?.accessToken ?? null;
}
var CloudAuthProvider = class {
  kind = "cloud";
  async current() {
    const s = await currentSession();
    if (!s) return null;
    return { id: s.userId, username: s.username, createdAt: s.createdAt };
  }
  async register(username, password) {
    const name = username.trim();
    if (name.length < 2) throw new Error("\u7528\u6237\u540D\u81F3\u5C11 2 \u4E2A\u5B57\u7B26");
    if (name.length > 20) throw new Error("\u7528\u6237\u540D\u6700\u591A 20 \u4E2A\u5B57\u7B26");
    if (password.length < 6) throw new Error("\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
    const data = await apiFetch("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({
        email: toEmail(name),
        password,
        data: { username: name }
      })
    });
    if (!data.access_token || !data.refresh_token || !data.user) {
      throw new Error(
        "\u8D26\u53F7\u5DF2\u521B\u5EFA\uFF0C\u4F46\u9700\u8981\u90AE\u7BB1\u9A8C\u8BC1\u624D\u80FD\u767B\u5F55\u3002\u8BF7\u5728 Supabase \u540E\u53F0 Authentication \u2192 Sign In / Providers \u91CC\u5173\u95ED\u300CConfirm email\u300D\uFF0C\u7136\u540E\u91CD\u65B0\u6CE8\u518C\u3002"
      );
    }
    const s = fromGoTrue(data, name);
    logger.info("cloud", "\u4E91\u7AEF\u8D26\u53F7\u6CE8\u518C\u6210\u529F", { userId: s.userId });
    return { id: s.userId, username: s.username, createdAt: s.createdAt };
  }
  async login(username, password) {
    const data = await apiFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: toEmail(username), password })
    });
    const s = fromGoTrue(data, username.trim());
    logger.info("cloud", "\u4E91\u7AEF\u8D26\u53F7\u767B\u5F55\u6210\u529F", { userId: s.userId });
    return { id: s.userId, username: s.username, createdAt: s.createdAt };
  }
  async logout() {
    const s = readSession();
    writeSession(null);
    if (!s) return;
    try {
      await apiFetch("/auth/v1/logout", { method: "POST" }, s.accessToken);
    } catch {
    }
    logger.info("cloud", "\u5DF2\u9000\u51FA\u4E91\u7AEF\u8D26\u53F7");
  }
  async changePassword(_userId, oldPassword, newPassword) {
    if (newPassword.length < 6) throw new Error("\u65B0\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
    const s = readSession();
    if (!s) throw new Error("\u8BF7\u5148\u767B\u5F55");
    await apiFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: s.email, password: oldPassword })
    });
    const token = await accessToken();
    if (!token) throw new Error("\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55");
    await apiFetch("/auth/v1/user", {
      method: "PUT",
      body: JSON.stringify({ password: newPassword })
    }, token);
    logger.info("cloud", "\u4E91\u7AEF\u5BC6\u7801\u5DF2\u4FEE\u6539");
  }
};
var PUSH_DELAY = 800;
var MAX_RETRY_DELAY = 6e4;
var SyncDriver = class {
  constructor(local) {
    this.local = local;
  }
  local;
  scope = null;
  queue = /* @__PURE__ */ new Map();
  tombstones = /* @__PURE__ */ new Set();
  clearPrefixes = [];
  timer = null;
  flushing = false;
  retryDelay = 1e3;
  status = { lastSyncAt: null, pending: 0, error: null };
  getStatus() {
    return { ...this.status };
  }
  /** 设定同步范围（形如 u:<userId>:），null 表示暂停同步 */
  setScope(prefix) {
    if (this.scope === prefix) return;
    this.scope = prefix;
    this.queue.clear();
    this.tombstones.clear();
    this.clearPrefixes = [];
    this.status = { ...this.status, pending: 0 };
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info("cloud", prefix ? "\u540C\u6B65\u8303\u56F4\u5DF2\u5C31\u7EEA" : "\u672A\u767B\u5F55\uFF0C\u540C\u6B65\u6682\u505C", { prefix });
  }
  /* ------------------------------------------------------- StorageDriver */
  async get(key) {
    return this.local.get(key);
  }
  async entries(prefix) {
    return this.local.entries(prefix);
  }
  async set(key, value) {
    await this.local.set(key, value);
    this.enqueue(key, value);
  }
  async setMany(entries) {
    await this.local.setMany(entries);
    for (const [k, v] of entries) this.enqueue(k, v);
  }
  async remove(key) {
    await this.local.remove(key);
    if (!this.inScope(key)) return;
    this.queue.delete(key);
    this.tombstones.add(key);
    this.touch();
  }
  async clear(prefix) {
    await this.local.clear(prefix);
    for (const k of [...this.queue.keys()]) {
      if (k.startsWith(prefix)) this.queue.delete(k);
    }
    for (const k of [...this.tombstones]) {
      if (k.startsWith(prefix)) this.tombstones.delete(k);
    }
    if (this.scope && prefix.startsWith(this.scope)) {
      this.clearPrefixes.push(prefix);
      this.touch();
    }
  }
  /* ------------------------------------------------------------ 内部 */
  inScope(key) {
    return Boolean(this.scope && key.startsWith(this.scope));
  }
  enqueue(key, value) {
    if (!this.inScope(key)) return;
    this.tombstones.delete(key);
    this.queue.set(key, value);
    this.touch();
  }
  touch() {
    this.status.pending = this.queue.size + this.tombstones.size + this.clearPrefixes.length;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, PUSH_DELAY);
  }
  /** 把排队的变更推到云端；失败则原样放回队列并退避重试 */
  async flush() {
    if (this.flushing) return;
    const scope = this.scope;
    if (!scope || !cloudConfigured) return;
    if (!this.queue.size && !this.tombstones.size && !this.clearPrefixes.length) return;
    const rows = [...this.queue.entries()];
    const keys = [...this.tombstones];
    const prefixes = [...this.clearPrefixes];
    this.queue.clear();
    this.tombstones.clear();
    this.clearPrefixes = [];
    this.flushing = true;
    try {
      const token = await accessToken();
      if (!token) throw new CloudError("\u672A\u767B\u5F55");
      for (const prefix of prefixes) {
        await apiFetch(
          `/rest/v1/${TABLE}?key=like.${encodeURIComponent(prefix)}*`,
          { method: "DELETE" },
          token
        );
      }
      for (const key of keys) {
        await apiFetch(
          `/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}`,
          { method: "DELETE" },
          token
        );
      }
      if (rows.length) {
        await apiFetch(`/rest/v1/${TABLE}?on_conflict=user_id,key`, {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(
            rows.map(([key, value]) => ({
              key,
              value,
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            }))
          )
        }, token);
      }
      this.retryDelay = 1e3;
      this.status = { lastSyncAt: Date.now(), pending: 0, error: null };
      logger.info("cloud", "\u53D8\u66F4\u5DF2\u540C\u6B65\u5230\u4E91\u7AEF", {
        \u4E0A\u4F20: rows.length,
        \u5220\u9664: keys.length,
        \u6E05\u7A7A: prefixes.length
      });
    } catch (err) {
      for (const [k, v] of rows) if (!this.queue.has(k)) this.queue.set(k, v);
      for (const k of keys) this.tombstones.add(k);
      for (const p of prefixes) if (!this.clearPrefixes.includes(p)) this.clearPrefixes.push(p);
      const message = err instanceof Error ? err.message : String(err);
      this.status = {
        ...this.status,
        pending: this.queue.size + this.tombstones.size + this.clearPrefixes.length,
        error: message
      };
      logger.warn("cloud", "\u540C\u6B65\u5931\u8D25\uFF0C\u7A0D\u540E\u81EA\u52A8\u91CD\u8BD5", {
        \u539F\u56E0: message,
        \u5F85\u63A8\u9001: this.status.pending
      });
      const wait = this.retryDelay;
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, wait);
    } finally {
      this.flushing = false;
    }
  }
  /**
   * 把云端数据合并回本地。
   *
   * 规则：云端有而本地没有 → 采用云端；两边都有且内容不同 → 以云端为准；
   * 本地有而云端没有 → 保留本地并补推上去。这样换设备登录不会丢数据，
   * 冲突时也不会出现「两边各一半」的错乱状态。
   */
  async pull() {
    const scope = this.scope;
    if (!scope || !cloudConfigured) return 0;
    try {
      const token = await accessToken();
      if (!token) return 0;
      const rows = await apiFetch(
        `/rest/v1/${TABLE}?select=key,value&key=like.${encodeURIComponent(scope)}*`,
        {},
        token
      );
      const local = await this.local.entries(scope);
      const writes = [];
      const remoteKeys = /* @__PURE__ */ new Set();
      for (const row of rows) {
        remoteKeys.add(row.key);
        const cur = local[row.key];
        if (cur === void 0 || JSON.stringify(cur) !== JSON.stringify(row.value)) {
          writes.push([row.key, row.value]);
        }
      }
      if (writes.length) await this.local.setMany(writes);
      let pendingPush = 0;
      for (const [k, v] of Object.entries(local)) {
        if (!remoteKeys.has(k)) {
          this.queue.set(k, v);
          pendingPush += 1;
        }
      }
      if (pendingPush) this.touch();
      this.status = { ...this.status, lastSyncAt: Date.now(), error: null };
      logger.info("cloud", "\u5DF2\u62C9\u53D6\u4E91\u7AEF\u6570\u636E", {
        \u4E91\u7AEF\u884C\u6570: rows.length,
        \u8986\u76D6\u672C\u5730: writes.length,
        \u5F85\u8865\u63A8: pendingPush
      });
      return writes.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status = { ...this.status, error: message };
      logger.warn("cloud", "\u62C9\u53D6\u4E91\u7AEF\u6570\u636E\u5931\u8D25\uFF0C\u7EE7\u7EED\u4F7F\u7528\u672C\u5730\u6570\u636E", message);
      return 0;
    }
  }
};
export {
  CloudAuthProvider,
  CloudError,
  SyncDriver,
  cloudConfigured
};
