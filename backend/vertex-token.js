import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

let credentials = null;
let credentialsError = null;
let jwtClient = null;
let cached = null;

function parseCredentials() {
  const b64 = (process.env.GOOGLE_VERTEX_SA_JSON_B64 ?? "").trim();
  const raw = (process.env.GOOGLE_VERTEX_SA_JSON ?? "").trim();
  if (!b64 && !raw) {
    return { creds: null, err: "GOOGLE_VERTEX_SA_JSON(_B64) 未设置" };
  }
  let text;
  if (b64) {
    try {
      text = Buffer.from(b64, "base64").toString("utf-8");
    } catch (e) {
      return { creds: null, err: `GOOGLE_VERTEX_SA_JSON_B64 无法 base64 解码: ${e?.message ?? e}` };
    }
  } else {
    text = raw;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { creds: null, err: `Service Account JSON 解析失败: ${e?.message ?? e}` };
  }
  if (!parsed.client_email || !parsed.private_key) {
    return { creds: null, err: "Service Account JSON 缺少 client_email 或 private_key 字段" };
  }
  return { creds: parsed, err: null };
}

function init() {
  if (credentials || credentialsError) return;
  const { creds, err } = parseCredentials();
  if (err) {
    credentialsError = err;
    return;
  }
  credentials = creds;
  jwtClient = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
  });
}

export function vertexConfigStatus() {
  init();
  return {
    configured: !!credentials,
    error: credentialsError,
    project: (process.env.GOOGLE_VERTEX_PROJECT ?? "").trim() || null,
    location: (process.env.GOOGLE_VERTEX_LOCATION ?? "").trim() || null,
    clientEmail: credentials?.client_email ?? null,
  };
}

export function vertexProjectAndLocation() {
  const project = (process.env.GOOGLE_VERTEX_PROJECT ?? "").trim();
  const location = (process.env.GOOGLE_VERTEX_LOCATION ?? "").trim() || "us-central1";
  if (!project) throw new Error("GOOGLE_VERTEX_PROJECT 未配置");
  return { project, location };
}

/** 拿一个有效 access token。命中缓存（剩余 ≥ 60s）则直接返回；否则重新签 JWT 换。 */
export async function getVertexAccessToken() {
  init();
  if (!credentials) {
    throw new Error(credentialsError ?? "Vertex SA 未初始化");
  }
  const now = Date.now();
  if (cached && cached.expiresAt - now > 60_000) {
    return cached.token;
  }
  const r = await jwtClient.authorize();
  if (!r?.access_token) {
    throw new Error("Vertex 取 access_token 失败：响应无 access_token");
  }
  cached = {
    token: r.access_token,
    expiresAt: r.expiry_date ?? now + 50 * 60 * 1000,
  };
  return cached.token;
}
