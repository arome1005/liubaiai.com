import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { createPool } from "./db.js";
import { sendSignupOtpEmail } from "./mail.js";
import { generateSignupOtp, hashOtpCode, normalizeEmail as normalizeEmailOtp, timingSafeEqualHex } from "./otp.js";

const pool = createPool();

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const JWT_SECRET = process.env.AUTH_JWT_SECRET ?? "dev-secret-change-me";
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "lb_session";

function nowMs() {
  return Date.now();
}

function normalizeEmail(email) {
  return normalizeEmailOtp(email);
}

const OTP_TTL_MS = Number(process.env.OTP_TTL_MS ?? String(10 * 60 * 1000));
const OTP_RESEND_MS = Number(process.env.OTP_RESEND_MS ?? String(60 * 1000));
const OTP_MAX_PER_HOUR = Number(process.env.OTP_MAX_PER_HOUR ?? "5");
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? "5");

function setSessionCookie(reply, user) {
  const token = jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 60 * 60 * 24 * 30,
  });
}

function requireAuth(req, reply) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return reply.code(401).send({ error: "UNAUTHENTICATED" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.uid) throw new Error("bad token");
    req.user = { id: payload.uid, email: payload.email ?? null };
  } catch {
    return reply.code(401).send({ error: "UNAUTHENTICATED" });
  }
}

/** 与 POST /api/auth/register/complete 相同（供 /api/auth/register 兼容旧客户端） */
async function handleRegisterComplete(req, reply) {
  const body = req.body ?? {};
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const code = String(body.code ?? "").replace(/\s/g, "");
  if (!email || !email.includes("@")) return reply.code(400).send({ error: "BAD_EMAIL" });
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

  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const ins = await client.query(
      "insert into app_user (email, password_hash, email_verified_at) values ($1, $2, now()) returning id, email",
      [email, passwordHash],
    );
    const u = ins.rows[0];
    await client.query("update email_otp_challenge set consumed_at = now() where id = $1", [row.id]);
    await client.query("commit");
    setSessionCookie(reply, u);
    reply.send({ user: { id: u.id, email: u.email } });
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    const msg = String(e?.message ?? "");
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return reply.code(409).send({ error: "EMAIL_TAKEN" });
    }
    req.log.error(e, "register complete failed");
    reply.code(500).send({ error: "SERVER_ERROR" });
  } finally {
    client.release();
  }
}

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  });
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? "dev-cookie-secret-change-me",
  });

  app.get("/api/health", async () => ({ ok: true }));

  // ===== Auth (phase1: signup via email OTP) =====
  app.post("/api/auth/register/request-code", async (req, reply) => {
    const email = normalizeEmail(req.body?.email);
    if (!email || !email.includes("@")) return reply.code(400).send({ error: "BAD_EMAIL" });

    const taken = await pool.query("select 1 from app_user where email = $1", [email]);
    if (taken.rowCount) return reply.code(409).send({ error: "EMAIL_TAKEN" });

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

  app.post("/api/auth/login", async (req, reply) => {
    const body = req.body ?? {};
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!email || !password) return reply.code(400).send({ error: "BAD_INPUT" });
    const r = await pool.query(
      "select id, email, password_hash, email_verified_at from app_user where email = $1",
      [email],
    );
    const u = r.rows[0];
    if (!u) return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    if (!u.email_verified_at) return reply.code(403).send({ error: "EMAIL_NOT_VERIFIED" });
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    setSessionCookie(reply, { id: u.id, email: u.email });
    reply.send({ user: { id: u.id, email: u.email } });
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" }).send({ ok: true });
  });

  app.get("/api/auth/me", async (req, reply) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return reply.send({ user: null });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const uid = payload?.uid;
      if (!uid) return reply.send({ user: null });
      const r = await pool.query("select id, email from app_user where id = $1", [uid]);
      const u = r.rows[0];
      return reply.send({ user: u ? { id: u.id, email: u.email } : null });
    } catch {
      return reply.send({ user: null });
    }
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

  app.addHook("onClose", async () => {
    await pool.end().catch(() => {});
  });

  return app;
}

// Run as standalone server when executed directly
const isDirectRun = process.argv[1] && process.argv[1].endsWith("/backend/server.js");
if (isDirectRun) {
  const app = await buildServer();
  // Default to localhost to avoid networkInterfaces() issues in some sandboxed environments.
  const host = process.env.API_HOST ?? "127.0.0.1";
  const port = Number(process.env.API_PORT ?? "8787");
  await app.listen({ host, port });
  app.log.info(`API listening on http://${host}:${port}`);
}

