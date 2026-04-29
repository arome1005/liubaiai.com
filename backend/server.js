import "./load-env.js";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { createPool } from "./db.js";
import { getSupabaseAdmin } from "./supabase-admin.js";
import { sendSignupOtpEmail } from "./mail.js";
import {
  generateSignupOtp,
  hashOtpCode,
  normalizeEmail as normalizeEmailOtp,
  timingSafeEqualHex,
} from "./otp.js";
import {
  getVertexAccessToken,
  vertexConfigStatus,
  vertexProjectAndLocation,
} from "./vertex-token.js";

const pool = createPool();

function nowMs() {
  return Date.now();
}

function normalizeEmail(email) {
  return normalizeEmailOtp(email);
}

/** 宽松校验：含 @ 即可（国际化邮箱由 SMTP / Supabase 侧再约束） */
function emailLooksValid(email) {
  const e = normalizeEmail(email);
  return e.length >= 3 && e.includes("@");
}

const OTP_TTL_MS = Number(process.env.OTP_TTL_MS ?? String(10 * 60 * 1000));
const OTP_RESEND_MS = Number(process.env.OTP_RESEND_MS ?? String(60 * 1000));
const OTP_MAX_PER_HOUR = Number(process.env.OTP_MAX_PER_HOUR ?? "5");
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? "5");

/** 带 credentials 的跨域必须回显具体 Origin，不能依赖模糊的 true。可加 CORS_ORIGINS=逗号分隔 */
function loadCorsAllowedOrigins() {
  const set = new Set([
    "https://www.liubaiai.com",
    "https://liubaiai.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
  ]);
  const extra = String(process.env.CORS_ORIGINS ?? "");
  for (const part of extra.split(/[\s,]+/)) {
    const o = part.trim().replace(/\/$/, "");
    if (o) set.add(o);
  }
  return set;
}

const corsAllowedOrigins = loadCorsAllowedOrigins();

/** 与 Supabase 同一 Postgres 时查询 auth.users；无权限或非 Supabase 库则返回 false */
async function authUserExistsInSupabase(email) {
  const e = normalizeEmail(email);
  try {
    const r = await pool.query("select id from auth.users where email = $1 limit 1", [e]);
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

/** test_content 等表若 FK 到 public.app_user，需在插入前保证存在一行（与 auth.users 同步） */
async function ensureAppUserRow(userId, email) {
  if (!userId) return;
  try {
    await pool.query(
      `insert into public.app_user (id, email) values ($1, $2)
       on conflict (id) do nothing`,
      [userId, email ?? ""],
    );
  } catch (e) {
    if (e?.code === "42P01") return;
    throw e;
  }
}

async function requireAuth(req, reply) {
  const h = req.headers.authorization ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return reply.code(401).send({ error: "UNAUTHENTICATED" });
  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return reply.code(401).send({ error: "UNAUTHENTICATED" });
    req.user = { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return reply.code(401).send({ error: "UNAUTHENTICATED" });
  }
}

/** 验证码通过后由 Supabase Admin 建号；前端再 signInWithPassword */
async function handleRegisterComplete(req, reply) {
  const body = req.body ?? {};
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const code = String(body.code ?? "").replace(/\s/g, "");
  if (!emailLooksValid(email)) return reply.code(400).send({ error: "BAD_EMAIL" });
  if (password.length < 8) return reply.code(400).send({ error: "WEAK_PASSWORD" });
  if (!/^\d{6}$/.test(code)) return reply.code(400).send({ error: "BAD_CODE" });

  const r = await pool.query(
    `select id, code_hash, expires_at, consumed_at, attempt_count from email_otp_challenge
     where email = $1 and purpose = 'signup' and consumed_at is null
     order by created_at desc limit 1`,
    [email],
  );
  const row = r.rows[0];
  if (!row) return reply.code(400).send({ error: "OTP_EXPIRED" });
  if (new Date(row.expires_at) < new Date()) {
    await pool.query("update email_otp_challenge set consumed_at = now() where id = $1", [row.id]);
    return reply.code(400).send({ error: "OTP_EXPIRED" });
  }

  const expectedHash = row.code_hash;
  const actualHash = hashOtpCode(email, "signup", code);
  if (!timingSafeEqualHex(expectedHash, actualHash)) {
    const next = Number(row.attempt_count) + 1;
    await pool.query("update email_otp_challenge set attempt_count = $1 where id = $2", [next, row.id]);
    if (next >= OTP_MAX_ATTEMPTS) {
      await pool.query("update email_otp_challenge set consumed_at = now() where id = $1", [row.id]);
    }
    return reply.code(400).send({ error: "BAD_CODE" });
  }

  let created;
  try {
    const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    created = data.user;
  } catch (e) {
    const code = e?.code ?? e?.status;
    const msg = String(e?.message ?? e ?? "").toLowerCase();
    if (
      code === 422 ||
      msg.includes("already") ||
      msg.includes("registered") ||
      msg.includes("duplicate") ||
      msg.includes("exists")
    ) {
      return reply.code(409).send({ error: "EMAIL_TAKEN" });
    }
    req.log.error(e, "supabase createUser failed");
    return reply.code(500).send({ error: "REGISTER_FAILED" });
  }

  await ensureAppUserRow(created.id, created.email ?? email);

  await pool.query("update email_otp_challenge set consumed_at = now() where id = $1", [row.id]);
  reply.send({ user: { id: created.id, email: created.email ?? email } });
}

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    credentials: true,
    origin(origin, cb) {
      if (!origin) {
        return cb(null, true);
      }
      const norm = origin.replace(/\/$/, "");
      if (corsAllowedOrigins.has(norm)) {
        return cb(null, origin);
      }
      cb(null, false);
    },
  });

  app.get("/api/health", async () => ({ ok: true }));

  // ===== 豆包 / 火山 Ark 转发：浏览器无法直连（无 CORS）时，经本站 fetch 再回传；与前端 /api/proxy/doubao-ark 对应 =====
  const DOUBAO_VOLC_ARK = "https://ark.cn-beijing.volces.com";
  async function proxyDoubaoArkToVolc(req, reply) {
    const u = new URL(req.raw.url, "http://127.0.0.1");
    const sub = u.pathname.replace(/^\/api\/proxy\/doubao-ark/, "") || "/";
    if (!sub.startsWith("/api/")) {
      return reply.code(400).send({ error: "BAD_PROXY_PATH" });
    }
    const target = `${DOUBAO_VOLC_ARK}${sub}${u.search}`;
    const method = req.method;
    const headers = {
      authorization: req.headers.authorization ?? "",
    };
    const ct = req.headers["content-type"];
    if (ct) headers["content-type"] = ct;
    const init = { method, headers };
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      init.body = JSON.stringify(req.body ?? {});
    }
    let r;
    try {
      r = await fetch(target, init);
    } catch (e) {
      req.log.error(e, "doubao ark proxy fetch failed");
      return reply.code(502).send({ error: "UPSTREAM_FETCH_FAILED", message: String(e?.message ?? e) });
    }
    reply.status(r.status);
    const outCt = r.headers.get("content-type");
    if (outCt) reply.header("content-type", outCt);
    const cc = r.headers.get("cache-control");
    if (cc) reply.header("cache-control", cc);
    if (!r.body) return reply.send();
    try {
      return reply.send(Readable.fromWeb(r.body));
    } catch (e) {
      req.log.warn(e, "doubao ark proxy fromWeb; buffering");
      const buf = await r.arrayBuffer();
      return reply.send(Buffer.from(buf));
    }
  }
  // 通配：覆盖 chat / embeddings 及火山后续路径，避免漏配子路径导致 404
  app.get("/api/proxy/doubao-ark/health", async () => ({
    ok: true,
    doubaoArkProxy: true,
  }));
  app.post(
    "/api/proxy/doubao-ark/*",
    { bodyLimit: 32 * 1024 * 1024 },
    proxyDoubaoArkToVolc,
  );

  // ===== Vertex AI 代理：SA JSON 留在 VPS，浏览器只调本路由 =====
  // 鉴权：复用 requireAuth（Supabase JWT），避免 Vertex 代理被公网爬走赠金
  // 协议：与 Gemini 原生 generateContent / streamGenerateContent 等价的请求/响应体
  function vertexBuildUrl(model, stream) {
    const safeModel = encodeURIComponent(String(model ?? "").trim());
    if (!safeModel) throw new Error("缺少 model 查询参数");
    const { project, location } = vertexProjectAndLocation();
    const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${safeModel}:${action}`;
  }

  // 健康检查：不走 requireAuth，返回是否配好；不返回 SA 内容
  app.get("/api/ai/vertex/health", async () => ({
    ok: true,
    vertex: vertexConfigStatus(),
  }));

  app.post(
    "/api/ai/vertex/generate",
    { preHandler: requireAuth, bodyLimit: 4 * 1024 * 1024 },
    async (req, reply) => {
      const model = String(req.query?.model ?? "").trim();
      let url, token;
      try {
        url = vertexBuildUrl(model, false);
        token = await getVertexAccessToken();
      } catch (e) {
        req.log.error(e, "vertex generate prep failed");
        return reply.code(503).send({ error: "VERTEX_NOT_CONFIGURED", message: String(e?.message ?? e) });
      }
      let r;
      try {
        r = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(req.body ?? {}),
        });
      } catch (e) {
        req.log.error(e, "vertex generate upstream fetch failed");
        return reply.code(502).send({ error: "UPSTREAM_FETCH_FAILED", message: String(e?.message ?? e) });
      }
      reply.status(r.status);
      const ct = r.headers.get("content-type");
      if (ct) reply.header("content-type", ct);
      const buf = await r.arrayBuffer();
      return reply.send(Buffer.from(buf));
    },
  );

  app.post(
    "/api/ai/vertex/stream",
    { preHandler: requireAuth, bodyLimit: 4 * 1024 * 1024 },
    async (req, reply) => {
      const model = String(req.query?.model ?? "").trim();
      let url, token;
      try {
        url = vertexBuildUrl(model, true);
        token = await getVertexAccessToken();
      } catch (e) {
        req.log.error(e, "vertex stream prep failed");
        return reply.code(503).send({ error: "VERTEX_NOT_CONFIGURED", message: String(e?.message ?? e) });
      }
      let r;
      try {
        r = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            accept: "text/event-stream",
          },
          body: JSON.stringify(req.body ?? {}),
        });
      } catch (e) {
        req.log.error(e, "vertex stream upstream fetch failed");
        return reply.code(502).send({ error: "UPSTREAM_FETCH_FAILED", message: String(e?.message ?? e) });
      }
      reply.status(r.status);
      const ct = r.headers.get("content-type");
      if (ct) reply.header("content-type", ct);
      // 上游错误：直接缓冲返回 JSON，避免把错误信息当 SSE 流喂前端
      if (!r.ok || !r.body) {
        const buf = await r.arrayBuffer();
        return reply.send(Buffer.from(buf));
      }
      try {
        return reply.send(Readable.fromWeb(r.body));
      } catch (e) {
        req.log.warn(e, "vertex stream fromWeb fallback to buffer");
        const buf = await r.arrayBuffer();
        return reply.send(Buffer.from(buf));
      }
    },
  );

  // ===== URL 预览（流光书签）=====
  // 目标：不依赖浏览器 CORS，后端抓取 meta 信息；带简易缓存与超时，避免被滥用
  const urlPreviewCache = new Map(); // key: url, val: { at, data }
  const URL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  function cacheGet(url) {
    const hit = urlPreviewCache.get(url);
    if (!hit) return null;
    if (Date.now() - hit.at > URL_CACHE_TTL_MS) {
      urlPreviewCache.delete(url);
      return null;
    }
    return hit.data;
  }
  function cacheSet(url, data) {
    urlPreviewCache.set(url, { at: Date.now(), data });
    // 简单上限，避免无限增长
    if (urlPreviewCache.size > 400) {
      const first = urlPreviewCache.keys().next().value;
      if (first) urlPreviewCache.delete(first);
    }
  }
  function pickMeta(html, key) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const m = html.match(re);
    return m ? m[1] : null;
  }
  function pickTitle(html) {
    const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
    return m ? m[1] : null;
  }
  app.get("/api/url-preview", async (req, reply) => {
    const raw = String(req.query?.url ?? "").trim();
    if (!raw) return reply.code(400).send({ error: "BAD_URL" });
    let u;
    try {
      u = new URL(raw);
    } catch {
      return reply.code(400).send({ error: "BAD_URL" });
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return reply.code(400).send({ error: "BAD_URL" });
    }
    const cached = cacheGet(u.toString());
    if (cached) return cached;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch(u.toString(), {
        signal: ac.signal,
        redirect: "follow",
        headers: {
          "user-agent": "liubai-writing-url-preview/1.0",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) return reply.code(502).send({ error: "FETCH_FAILED" });
      const html = await res.text();
      const title = pickMeta(html, "og:title") ?? pickTitle(html);
      const site = pickMeta(html, "og:site_name") ?? u.hostname;
      const description = pickMeta(html, "og:description") ?? pickMeta(html, "description");
      const out = { title, site, description };
      cacheSet(u.toString(), out);
      return out;
    } catch (e) {
      req.log.warn({ err: String(e) }, "url preview fetch failed");
      return reply.code(502).send({ error: "FETCH_FAILED" });
    } finally {
      clearTimeout(t);
    }
  });

  /** 联调：将当前用户 ID 与测试文本写入 test_content */
  app.post("/api/test-save", { preHandler: requireAuth }, async (req, reply) => {
    const text = String(req.body?.text ?? "").trim() || "sync test";
    await ensureAppUserRow(req.user.id, req.user.email);
    const r = await pool.query(
      "insert into test_content (user_id, content) values ($1, $2) returning id, created_at as \"createdAt\"",
      [req.user.id, text],
    );
    reply.send({ ok: true, userId: req.user.id, row: r.rows[0] });
  });

  // ===== 注册验证码（建号走 Supabase Admin；登录/会话/重置密码走前端 Supabase Auth） =====
  app.post("/api/auth/register/request-code", async (req, reply) => {
    const email = normalizeEmail(req.body?.email);
    if (!emailLooksValid(email)) return reply.code(400).send({ error: "BAD_EMAIL" });

    if (await authUserExistsInSupabase(email)) return reply.code(409).send({ error: "EMAIL_TAKEN" });

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const cnt = await pool.query(
      "select count(*)::int as n from email_otp_challenge where email = $1 and purpose = 'signup' and created_at >= $2",
      [email, since],
    );
    if ((cnt.rows[0]?.n ?? 0) >= OTP_MAX_PER_HOUR) {
      return reply.code(429).send({ error: "RATE_LIMIT" });
    }

    const last = await pool.query(
      "select extract(epoch from (now() - max(created_at))) * 1000 as gap_ms from email_otp_challenge where email = $1 and purpose = 'signup'",
      [email],
    );
    const gap = last.rows[0]?.gap_ms;
    if (gap != null && Number(gap) < OTP_RESEND_MS) {
      return reply.code(429).send({ error: "TOO_SOON" });
    }

    const code = generateSignupOtp();
    const codeHash = hashOtpCode(email, "signup", code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await pool.query(
      "insert into email_otp_challenge (email, purpose, code_hash, expires_at) values ($1, 'signup', $2, $3)",
      [email, codeHash, expiresAt],
    );

    try {
      await sendSignupOtpEmail(email, code);
    } catch (e) {
      req.log.error(e, "sendSignupOtpEmail failed");
      return reply.code(500).send({ error: "MAIL_FAILED" });
    }

    const payload = { ok: true };
    if (process.env.MAIL_DEV_RETURN_CODE === "1") {
      payload.dev = { code };
    }
    reply.send(payload);
  });

  app.post("/api/auth/register/complete", handleRegisterComplete);

  /** 兼容旧路径：仅 email+password 会提示走验证码流程；带 6 位 code 则与 register/complete 相同 */
  app.post("/api/auth/register", async (req, reply) => {
    const code = String(req.body?.code ?? "").replace(/\s/g, "");
    if (/^\d{6}$/.test(code)) {
      return handleRegisterComplete(req, reply);
    }
    return reply.code(400).send({
      error: "USE_OTP_FLOW",
      hint: "请先 POST /api/auth/register/request-code 获取验证码，再提交 email、password、code 到本接口或 /api/auth/register/complete。",
    });
  });

  // ===== Works =====
  app.get("/api/works", { preHandler: requireAuth }, async (req) => {
    const r = await pool.query(
      "select id, title, created_at as \"createdAt\", updated_at as \"updatedAt\", progress_cursor as \"progressCursor\" from work where user_id = $1 order by updated_at desc",
      [req.user.id],
    );
    return { works: r.rows };
  });

  app.post("/api/works", { preHandler: requireAuth }, async (req, reply) => {
    const title = String(req.body?.title ?? "").trim() || "新作品";
    const t = nowMs();
    req.log.info({ title }, "create work: begin");
    const client = await pool.connect();
    try {
      await client.query("begin");
      req.log.info("create work: insert work");
      const r = await client.query(
        "insert into work (user_id, title, created_at, updated_at, progress_cursor) values ($1, $2, $3, $4, null) returning id, title, created_at as \"createdAt\", updated_at as \"updatedAt\", progress_cursor as \"progressCursor\"",
        [req.user.id, title, t, t],
      );
      const w = r.rows[0];
      req.log.info({ workId: w.id }, "create work: insert default volume");
      await client.query(
        "insert into volume (work_id, title, \"order\", created_at) values ($1, $2, 0, $3)",
        [w.id, "正文", t],
      );
      await client.query("commit");
      req.log.info({ workId: w.id }, "create work: done");
      reply.send({ work: w });
    } catch (e) {
      try {
        await client.query("rollback");
      } catch {
        /* ignore */
      }
      req.log.error(e, "create work failed");
      reply.code(500).send({ error: "SERVER_ERROR" });
    } finally {
      client.release();
    }
  });

  app.patch("/api/works/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = req.params.id;
    const patch = req.body ?? {};
    const fields = [];
    const args = [];
    let i = 1;
    if (patch.title !== undefined) {
      fields.push(`title = $${i++}`);
      args.push(String(patch.title));
    }
    if (patch.progressCursor !== undefined) {
      fields.push(`progress_cursor = $${i++}`);
      args.push(patch.progressCursor ? String(patch.progressCursor) : null);
    }
    fields.push(`updated_at = $${i++}`);
    args.push(nowMs());
    args.push(req.user.id);
    args.push(id);
    if (!fields.length) return reply.send({ ok: true });
    await pool.query(
      `update work set ${fields.join(", ")} where user_id = $${i++} and id = $${i}`,
      args,
    );
    reply.send({ ok: true });
  });

  app.delete("/api/works/:id", { preHandler: requireAuth }, async (req, reply) => {
    await pool.query("delete from work where user_id = $1 and id = $2", [req.user.id, req.params.id]);
    reply.send({ ok: true });
  });

  // ===== Volumes / Chapters =====
  app.get("/api/works/:workId/volumes", { preHandler: requireAuth }, async (req) => {
    const { workId } = req.params;
    const ok = await pool.query("select 1 from work where user_id=$1 and id=$2", [req.user.id, workId]);
    if (!ok.rowCount) return { volumes: [] };
    const r = await pool.query(
      "select id, work_id as \"workId\", title, \"order\", created_at as \"createdAt\" from volume where work_id = $1 order by \"order\" asc",
      [workId],
    );
    return { volumes: r.rows };
  });

  app.get("/api/works/:workId/chapters", { preHandler: requireAuth }, async (req) => {
    const { workId } = req.params;
    const ok = await pool.query("select 1 from work where user_id=$1 and id=$2", [req.user.id, workId]);
    if (!ok.rowCount) return { chapters: [] };
    const r = await pool.query(
      "select id, work_id as \"workId\", volume_id as \"volumeId\", title, content, summary, \"order\", updated_at as \"updatedAt\", word_count_cache as \"wordCountCache\" from chapter where work_id = $1 order by \"order\" asc",
      [workId],
    );
    return { chapters: r.rows };
  });

  app.post("/api/works/:workId/chapters", { preHandler: requireAuth }, async (req, reply) => {
    const { workId } = req.params;
    const ok = await pool.query("select 1 from work where user_id=$1 and id=$2", [req.user.id, workId]);
    if (!ok.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const t = nowMs();
    const title = String(req.body?.title ?? "").trim() || "新章";
    let volumeId = req.body?.volumeId ? String(req.body.volumeId) : null;
    if (!volumeId) {
      const v = await pool.query("select id from volume where work_id=$1 order by \"order\" asc limit 1", [workId]);
      volumeId = v.rows[0]?.id ?? null;
      if (!volumeId) {
        const vv = await pool.query(
          "insert into volume (work_id, title, \"order\", created_at) values ($1, $2, 0, $3) returning id",
          [workId, "正文", t],
        );
        volumeId = vv.rows[0].id;
      }
    }
    const ord = await pool.query("select coalesce(max(\"order\"), -1) + 1 as next from chapter where work_id=$1", [workId]);
    const nextOrder = Number(ord.rows[0].next ?? 0);
    const r = await pool.query(
      "insert into chapter (work_id, volume_id, title, content, summary, \"order\", updated_at, word_count_cache) values ($1,$2,$3,$4,null,$5,$6,null) returning id, work_id as \"workId\", volume_id as \"volumeId\", title, content, summary, \"order\", updated_at as \"updatedAt\", word_count_cache as \"wordCountCache\"",
      [workId, volumeId, title, "", nextOrder, t],
    );
    reply.send({ chapter: r.rows[0] });
  });

  app.patch("/api/chapters/:id", { preHandler: requireAuth }, async (req, reply) => {
    const id = req.params.id;
    const patch = req.body ?? {};
    const r0 = await pool.query(
      "select c.work_id from chapter c join work w on w.id=c.work_id where c.id=$1 and w.user_id=$2",
      [id, req.user.id],
    );
    if (!r0.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const fields = [];
    const args = [];
    let i = 1;
    for (const [k, col] of [
      ["title", "title"],
      ["content", "content"],
      ["summary", "summary"],
      ["volumeId", "volume_id"],
    ]) {
      if (patch[k] !== undefined) {
        fields.push(`${col} = $${i++}`);
        args.push(patch[k] === null ? null : String(patch[k]));
      }
    }
    fields.push(`updated_at = $${i++}`);
    args.push(nowMs());
    args.push(id);
    if (fields.length) {
      await pool.query(`update chapter set ${fields.join(", ")} where id = $${i}`, args);
    }
    reply.send({ ok: true });
  });

  app.post("/api/works/:workId/chapters/reorder", { preHandler: requireAuth }, async (req, reply) => {
    const { workId } = req.params;
    const ids = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
    if (!ids.length) return reply.send({ ok: true });
    const ok = await pool.query("select 1 from work where user_id=$1 and id=$2", [req.user.id, workId]);
    if (!ok.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const values = ids.map((id, idx) => `('${id}'::uuid, ${idx})`).join(",");
    await pool.query(
      `update chapter c set "order" = v.ord
       from (values ${values}) as v(id, ord)
       where c.id = v.id and c.work_id = $1`,
      [workId],
    );
    reply.send({ ok: true });
  });

  // ─────────────────────────────────────────────────────────────────
  // P0-02 · 锦囊 Bible API
  // ─────────────────────────────────────────────────────────────────

  /** 公共：校验 work 归属当前用户 */
  async function assertWorkOwner(userId, workId) {
    const r = await pool.query("select 1 from work where id=$1 and user_id=$2", [workId, userId]);
    if (!r.rowCount) throw { statusCode: 404, message: "NOT_FOUND" };
  }

  // ── bible_character ──
  app.get("/api/works/:workId/bible/characters", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const rows = await pool.query(
      "select * from bible_character where work_id=$1 order by sort_order asc, created_at asc",
      [req.params.workId],
    );
    reply.send(rows.rows);
  });

  app.post("/api/works/:workId/bible/characters", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const b = req.body ?? {};
    const now = nowMs();
    const r = await pool.query(
      `insert into bible_character(work_id, name, motivation, relationships, voice_notes, taboos, sort_order, created_at, updated_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$8) returning *`,
      [req.params.workId, String(b.name ?? ""), String(b.motivation ?? ""), String(b.relationships ?? ""),
       String(b.voice_notes ?? ""), String(b.taboos ?? ""), Number(b.sort_order ?? 0), now],
    );
    reply.code(201).send(r.rows[0]);
  });

  app.patch("/api/bible/characters/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const own = await pool.query(
      "select bc.id from bible_character bc join work w on w.id=bc.work_id where bc.id=$1 and w.user_id=$2",
      [id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const b = req.body ?? {};
    const now = nowMs();
    const fields = ["name", "motivation", "relationships", "voice_notes", "taboos", "sort_order"];
    const sets = []; const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f}=$${idx++}`); vals.push(f === "sort_order" ? Number(b[f]) : String(b[f])); }
    }
    sets.push(`updated_at=$${idx++}`); vals.push(now);
    vals.push(id);
    const r = await pool.query(`update bible_character set ${sets.join(",")} where id=$${idx} returning *`, vals);
    reply.send(r.rows[0]);
  });

  app.delete("/api/bible/characters/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select bc.id from bible_character bc join work w on w.id=bc.work_id where bc.id=$1 and w.user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    await pool.query("delete from bible_character where id=$1", [req.params.id]);
    reply.send({ ok: true });
  });

  // ── bible_world_entry ──
  app.get("/api/works/:workId/bible/world-entries", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const rows = await pool.query(
      "select * from bible_world_entry where work_id=$1 order by sort_order asc, created_at asc",
      [req.params.workId],
    );
    reply.send(rows.rows);
  });

  app.post("/api/works/:workId/bible/world-entries", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const b = req.body ?? {};
    const now = nowMs();
    const r = await pool.query(
      `insert into bible_world_entry(work_id, entry_kind, title, body, sort_order, created_at, updated_at)
       values($1,$2,$3,$4,$5,$6,$6) returning *`,
      [req.params.workId, String(b.entry_kind ?? "other"), String(b.title ?? ""), String(b.body ?? ""), Number(b.sort_order ?? 0), now],
    );
    reply.code(201).send(r.rows[0]);
  });

  app.patch("/api/bible/world-entries/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select bw.id from bible_world_entry bw join work w on w.id=bw.work_id where bw.id=$1 and w.user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const b = req.body ?? {};
    const now = nowMs();
    const fields = ["entry_kind", "title", "body", "sort_order"];
    const sets = []; const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f}=$${idx++}`); vals.push(f === "sort_order" ? Number(b[f]) : String(b[f])); }
    }
    sets.push(`updated_at=$${idx++}`); vals.push(now);
    vals.push(req.params.id);
    const r = await pool.query(`update bible_world_entry set ${sets.join(",")} where id=$${idx} returning *`, vals);
    reply.send(r.rows[0]);
  });

  app.delete("/api/bible/world-entries/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select bw.id from bible_world_entry bw join work w on w.id=bw.work_id where bw.id=$1 and w.user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    await pool.query("delete from bible_world_entry where id=$1", [req.params.id]);
    reply.send({ ok: true });
  });

  // ── bible_foreshadow ──
  app.get("/api/works/:workId/bible/foreshadows", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const rows = await pool.query(
      "select * from bible_foreshadow where work_id=$1 order by sort_order asc, created_at asc",
      [req.params.workId],
    );
    reply.send(rows.rows);
  });

  app.post("/api/works/:workId/bible/foreshadows", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const b = req.body ?? {};
    const now = nowMs();
    const r = await pool.query(
      `insert into bible_foreshadow(work_id, title, planted_where, planned_resolve, status, note, chapter_id, sort_order, created_at, updated_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning *`,
      [req.params.workId, String(b.title ?? ""), String(b.planted_where ?? ""), String(b.planned_resolve ?? ""),
       String(b.status ?? "pending"), String(b.note ?? ""), b.chapter_id ?? null, Number(b.sort_order ?? 0), now],
    );
    reply.code(201).send(r.rows[0]);
  });

  app.patch("/api/bible/foreshadows/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select bf.id from bible_foreshadow bf join work w on w.id=bf.work_id where bf.id=$1 and w.user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const b = req.body ?? {};
    const now = nowMs();
    const fields = ["title", "planted_where", "planned_resolve", "status", "note", "chapter_id", "sort_order"];
    const sets = []; const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f}=$${idx++}`); vals.push(f === "sort_order" ? Number(b[f]) : b[f] === null ? null : String(b[f])); }
    }
    sets.push(`updated_at=$${idx++}`); vals.push(now);
    vals.push(req.params.id);
    const r = await pool.query(`update bible_foreshadow set ${sets.join(",")} where id=$${idx} returning *`, vals);
    reply.send(r.rows[0]);
  });

  app.delete("/api/bible/foreshadows/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select bf.id from bible_foreshadow bf join work w on w.id=bf.work_id where bf.id=$1 and w.user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    await pool.query("delete from bible_foreshadow where id=$1", [req.params.id]);
    reply.send({ ok: true });
  });

  // ── bible_timeline_event ──
  app.get("/api/works/:workId/bible/timeline-events", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const rows = await pool.query(
      "select * from bible_timeline_event where work_id=$1 order by sort_order asc, created_at asc",
      [req.params.workId],
    );
    reply.send(rows.rows);
  });

  app.post("/api/works/:workId/bible/timeline-events", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const b = req.body ?? {};
    const now = nowMs();
    const r = await pool.query(
      `insert into bible_timeline_event(work_id, label, sort_order, note, chapter_id, created_at, updated_at)
       values($1,$2,$3,$4,$5,$6,$6) returning *`,
      [req.params.workId, String(b.label ?? ""), Number(b.sort_order ?? 0), String(b.note ?? ""), b.chapter_id ?? null, now],
    );
    reply.code(201).send(r.rows[0]);
  });

  app.patch("/api/bible/timeline-events/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select bt.id from bible_timeline_event bt join work w on w.id=bt.work_id where bt.id=$1 and w.user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const b = req.body ?? {};
    const now = nowMs();
    const fields = ["label", "sort_order", "note", "chapter_id"];
    const sets = []; const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f}=$${idx++}`); vals.push(f === "sort_order" ? Number(b[f]) : b[f] === null ? null : String(b[f])); }
    }
    sets.push(`updated_at=$${idx++}`); vals.push(now);
    vals.push(req.params.id);
    const r = await pool.query(`update bible_timeline_event set ${sets.join(",")} where id=$${idx} returning *`, vals);
    reply.send(r.rows[0]);
  });

  app.delete("/api/bible/timeline-events/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select bt.id from bible_timeline_event bt join work w on w.id=bt.work_id where bt.id=$1 and w.user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    await pool.query("delete from bible_timeline_event where id=$1", [req.params.id]);
    reply.send({ ok: true });
  });

  // ── bible_glossary_term ──
  app.get("/api/works/:workId/bible/glossary-terms", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const rows = await pool.query(
      "select * from bible_glossary_term where work_id=$1 order by term asc",
      [req.params.workId],
    );
    reply.send(rows.rows);
  });

  app.post("/api/works/:workId/bible/glossary-terms", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const b = req.body ?? {};
    const now = nowMs();
    const r = await pool.query(
      `insert into bible_glossary_term(work_id, term, category, note, created_at, updated_at)
       values($1,$2,$3,$4,$5,$5) returning *`,
      [req.params.workId, String(b.term ?? ""), String(b.category ?? ""), String(b.note ?? ""), now],
    );
    reply.code(201).send(r.rows[0]);
  });

  app.patch("/api/bible/glossary-terms/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select bg.id from bible_glossary_term bg join work w on w.id=bg.work_id where bg.id=$1 and w.user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const b = req.body ?? {};
    const now = nowMs();
    const fields = ["term", "category", "note"];
    const sets = []; const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f}=$${idx++}`); vals.push(String(b[f])); }
    }
    sets.push(`updated_at=$${idx++}`); vals.push(now);
    vals.push(req.params.id);
    const r = await pool.query(`update bible_glossary_term set ${sets.join(",")} where id=$${idx} returning *`, vals);
    reply.send(r.rows[0]);
  });

  app.delete("/api/bible/glossary-terms/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select bg.id from bible_glossary_term bg join work w on w.id=bg.work_id where bg.id=$1 and w.user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    await pool.query("delete from bible_glossary_term where id=$1", [req.params.id]);
    reply.send({ ok: true });
  });

  // ─────────────────────────────────────────────────────────────────
  // P0-02 · 风格卡 Style Card API
  // ─────────────────────────────────────────────────────────────────

  app.get("/api/works/:workId/style-card", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const r = await pool.query("select * from work_style_card where work_id=$1", [req.params.workId]);
    reply.send(r.rows[0] ?? null);
  });

  app.patch("/api/works/:workId/style-card", { preHandler: requireAuth }, async (req, reply) => {
    await assertWorkOwner(req.user.id, req.params.workId).catch((e) => reply.code(e.statusCode ?? 404).send({ error: e.message }));
    if (reply.sent) return;
    const b = req.body ?? {};
    const now = nowMs();
    const r = await pool.query(
      `insert into work_style_card(work_id, pov, tone, banned_phrases, style_anchor, extra_rules, updated_at)
       values($1,$2,$3,$4,$5,$6,$7)
       on conflict(work_id) do update set
         pov=excluded.pov, tone=excluded.tone, banned_phrases=excluded.banned_phrases,
         style_anchor=excluded.style_anchor, extra_rules=excluded.extra_rules, updated_at=excluded.updated_at
       returning *`,
      [req.params.workId, String(b.pov ?? ""), String(b.tone ?? ""), String(b.banned_phrases ?? ""),
       String(b.style_anchor ?? ""), String(b.extra_rules ?? ""), now],
    );
    reply.send(r.rows[0]);
  });

  // ─────────────────────────────────────────────────────────────────
  // P0-03 · 问策会话 Wence Sessions API
  // ─────────────────────────────────────────────────────────────────

  app.get("/api/wence-sessions", { preHandler: requireAuth }, async (req) => {
    const workId = req.query?.workId ?? null;
    if (workId) {
      const r = await pool.query(
        "select * from wence_chat_session where user_id=$1 and work_id=$2 order by updated_at desc limit 200",
        [req.user.id, workId],
      );
      return r.rows;
    }
    const r = await pool.query(
      "select * from wence_chat_session where user_id=$1 order by updated_at desc limit 200",
      [req.user.id],
    );
    return r.rows;
  });

  app.post("/api/wence-sessions", { preHandler: requireAuth }, async (req, reply) => {
    const b = req.body ?? {};
    const now = nowMs();
    const r = await pool.query(
      `insert into wence_chat_session(user_id, work_id, title, include_setting_index, messages, updated_at)
       values($1,$2,$3,$4,$5,$6) returning *`,
      [req.user.id, b.work_id ?? null, String(b.title ?? ""), !!b.include_setting_index,
       JSON.stringify(Array.isArray(b.messages) ? b.messages : []), now],
    );
    reply.code(201).send(r.rows[0]);
  });

  app.patch("/api/wence-sessions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select id from wence_chat_session where id=$1 and user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const b = req.body ?? {};
    const now = nowMs();
    const fields = ["title", "work_id", "include_setting_index", "messages"];
    const sets = []; const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (b[f] !== undefined) {
        sets.push(`${f}=$${idx++}`);
        if (f === "messages") vals.push(JSON.stringify(Array.isArray(b[f]) ? b[f] : []));
        else if (f === "include_setting_index") vals.push(!!b[f]);
        else vals.push(b[f] === null ? null : String(b[f]));
      }
    }
    sets.push(`updated_at=$${idx++}`); vals.push(now);
    vals.push(req.params.id);
    const r = await pool.query(`update wence_chat_session set ${sets.join(",")} where id=$${idx} returning *`, vals);
    reply.send(r.rows[0]);
  });

  app.delete("/api/wence-sessions/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select id from wence_chat_session where id=$1 and user_id=$2",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    await pool.query("delete from wence_chat_session where id=$1", [req.params.id]);
    reply.send({ ok: true });
  });

  // ===== 步骤6：work_concept（推演构思层）=====

  // GET /api/works/:workId/concept — 取构思，不存在返回空对象
  app.get("/api/works/:workId/concept", { preHandler: requireAuth }, async (req, reply) => {
    const r = await pool.query(
      "select * from work_concept where work_id=$1 and user_id=$2",
      [req.params.workId, req.user.id],
    );
    reply.send(r.rows[0] ?? {});
  });

  // PUT /api/works/:workId/concept — upsert；finalized 后不可再修改
  app.put("/api/works/:workId/concept", { preHandler: requireAuth }, async (req, reply) => {
    const existing = await pool.query(
      "select id, stage from work_concept where work_id=$1 and user_id=$2",
      [req.params.workId, req.user.id],
    );
    if (existing.rows[0]?.stage === "finalized") {
      return reply.code(409).send({ error: "CONCEPT_FINALIZED" });
    }
    const b = req.body ?? {};
    const now = nowMs();
    const genre = Array.isArray(b.genre) ? b.genre : [];
    const importedCardIds = Array.isArray(b.imported_card_ids) ? b.imported_card_ids : [];
    if (existing.rows[0]) {
      const r = await pool.query(
        `update work_concept set
           genre=$1, core_conflict=$2, world_rules=$3,
           protagonist_motivation=$4, raw_text=$5,
           imported_card_ids=$6, updated_at=$7
         where work_id=$8 and user_id=$9 returning *`,
        [
          genre, String(b.core_conflict ?? ""), String(b.world_rules ?? ""),
          String(b.protagonist_motivation ?? ""), String(b.raw_text ?? ""),
          importedCardIds, now,
          req.params.workId, req.user.id,
        ],
      );
      return reply.send(r.rows[0]);
    }
    const r = await pool.query(
      `insert into work_concept
         (work_id, user_id, genre, core_conflict, world_rules,
          protagonist_motivation, raw_text, imported_card_ids, stage, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$9) returning *`,
      [
        req.params.workId, req.user.id,
        genre, String(b.core_conflict ?? ""), String(b.world_rules ?? ""),
        String(b.protagonist_motivation ?? ""), String(b.raw_text ?? ""),
        importedCardIds, now,
      ],
    );
    reply.code(201).send(r.rows[0]);
  });

  // POST /api/works/:workId/concept/finalize — 锁定构思，进入卷纲阶段
  app.post("/api/works/:workId/concept/finalize", { preHandler: requireAuth }, async (req, reply) => {
    const r = await pool.query(
      "update work_concept set stage='finalized', updated_at=$1 where work_id=$2 and user_id=$3 returning *",
      [nowMs(), req.params.workId, req.user.id],
    );
    if (!r.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    reply.send(r.rows[0]);
  });

  // ===== 步骤7：tuiyan_prompt_template（推演专用提示词） =====

  // GET /api/tuiyan/prompts?stage= — 返回该用户的模板 + 系统默认模板
  app.get("/api/tuiyan/prompts", { preHandler: requireAuth }, async (req, reply) => {
    const stage = String(req.query?.stage ?? "").trim();
    const allowed = ["concept", "volume", "chapter", "detail_outline"];
    if (stage && !allowed.includes(stage)) {
      return reply.code(400).send({ error: "BAD_STAGE" });
    }
    const stageFilter = stage ? "and stage=$3" : "";
    const vals = stage
      ? [req.user.id, true, stage]
      : [req.user.id, true];
    const r = await pool.query(
      `select * from tuiyan_prompt_template
       where (user_id=$1 or is_default=$2) ${stageFilter}
       order by is_default desc, sort_order asc, created_at asc`,
      vals,
    );
    reply.send(r.rows);
  });

  // POST /api/tuiyan/prompts — 新建用户自定义模板
  app.post("/api/tuiyan/prompts", { preHandler: requireAuth }, async (req, reply) => {
    const b = req.body ?? {};
    const allowed = ["concept", "volume", "chapter", "detail_outline"];
    const stage = String(b.stage ?? "");
    if (!allowed.includes(stage)) return reply.code(400).send({ error: "BAD_STAGE" });
    const now = nowMs();
    const r = await pool.query(
      `insert into tuiyan_prompt_template
         (user_id, stage, title, body, is_default, sort_order, created_at, updated_at)
       values ($1,$2,$3,$4,false,$5,$6,$6) returning *`,
      [
        req.user.id, stage,
        String(b.title ?? ""), String(b.body ?? ""),
        Number(b.sort_order ?? 0), now,
      ],
    );
    reply.code(201).send(r.rows[0]);
  });

  // PUT /api/tuiyan/prompts/:id — 更新（仅限本人）
  app.put("/api/tuiyan/prompts/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select id from tuiyan_prompt_template where id=$1 and user_id=$2 and is_default=false",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    const b = req.body ?? {};
    const now = nowMs();
    const r = await pool.query(
      `update tuiyan_prompt_template
       set title=$1, body=$2, sort_order=$3, updated_at=$4
       where id=$5 returning *`,
      [
        String(b.title ?? ""), String(b.body ?? ""),
        Number(b.sort_order ?? 0), now,
        req.params.id,
      ],
    );
    reply.send(r.rows[0]);
  });

  // DELETE /api/tuiyan/prompts/:id — 删除（仅限本人，不允许删系统默认）
  app.delete("/api/tuiyan/prompts/:id", { preHandler: requireAuth }, async (req, reply) => {
    const own = await pool.query(
      "select id from tuiyan_prompt_template where id=$1 and user_id=$2 and is_default=false",
      [req.params.id, req.user.id],
    );
    if (!own.rowCount) return reply.code(404).send({ error: "NOT_FOUND" });
    await pool.query("delete from tuiyan_prompt_template where id=$1", [req.params.id]);
    reply.send({ ok: true });
  });

  // ===== 步骤8：push-outline（推演细纲 → 写作页章节） =====

  // POST /api/tuiyan/push-outline
  // body: { chapterId, outlineDraft, outlineNodeId }
  // 产品规则：推送后 chapter.outline_draft 只读；再次推送同一章节返回 409。
  app.post("/api/tuiyan/push-outline", { preHandler: requireAuth }, async (req, reply) => {
    const b = req.body ?? {};
    const chapterId = String(b.chapterId ?? "").trim();
    const outlineDraft = String(b.outlineDraft ?? "").trim();
    const outlineNodeId = String(b.outlineNodeId ?? "").trim();

    if (!chapterId) return reply.code(400).send({ error: "MISSING_CHAPTER_ID" });
    if (!outlineDraft) return reply.code(400).send({ error: "MISSING_OUTLINE_DRAFT" });

    // 校验章节归属
    const chapterRow = await pool.query(
      `select c.id, c.outline_pushed_at
       from chapter c
       join work w on w.id = c.work_id
       where c.id=$1 and w.user_id=$2`,
      [chapterId, req.user.id],
    );
    if (!chapterRow.rowCount) return reply.code(404).send({ error: "CHAPTER_NOT_FOUND" });

    // 已推送过则拒绝（以编辑页章节为真，推演快照只读）
    if (chapterRow.rows[0].outline_pushed_at !== null) {
      return reply.code(409).send({ error: "ALREADY_PUSHED" });
    }

    const r = await pool.query(
      `update chapter
       set outline_draft=$1, outline_node_id=$2, outline_pushed_at=$3
       where id=$4 returning id, title, outline_draft, outline_node_id, outline_pushed_at`,
      [outlineDraft, outlineNodeId || null, nowMs(), chapterId],
    );
    reply.send(r.rows[0]);
  });

  app.addHook("onClose", async () => {
    await pool.end().catch(() => {});
  });

  return app;
}

// Run as standalone server when executed directly (compare resolved paths so PM2 / relative argv[1] still works).
// PM2 sets pm_id: if isDirectRun were false, we would skip listen(); pg Pool may hold no handles until first query,
// so Node exits immediately → PM2 restart loop with only dotenv lines in logs.
const __filename = fileURLToPath(import.meta.url);
const entryScript = process.argv[1] ? path.resolve(process.argv[1]) : "";
const pathMatchesEntry = Boolean(entryScript && path.resolve(__filename) === entryScript);
const isPm2Managed = process.env.pm_id !== undefined && String(process.env.pm_id).length > 0;
const isDirectRun = pathMatchesEntry || isPm2Managed;
if (isDirectRun) {
  const app = await buildServer();
  // Default to localhost to avoid networkInterfaces() issues in some sandboxed environments.
  const host = process.env.API_HOST ?? "127.0.0.1";
  const port = Number(process.env.API_PORT ?? "8787");
  await app.listen({ host, port });
  app.log.info(`API listening on http://${host}:${port}`);
}

