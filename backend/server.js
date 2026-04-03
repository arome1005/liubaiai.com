import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import { createPool } from "./db.js";
import { getSupabaseAdmin } from "./supabase-admin.js";
import { sendSignupOtpEmail } from "./mail.js";
import {
  generateSignupOtp,
  hashOtpCode,
  normalizeEmail as normalizeEmailOtp,
  timingSafeEqualHex,
} from "./otp.js";

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
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  });

  app.get("/api/health", async () => ({ ok: true }));

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

