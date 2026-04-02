import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function createPool() {
  const ssl = (process.env.DB_SSL ?? "true").toLowerCase();
  const useSsl = ssl === "1" || ssl === "true" || ssl === "yes";

  return new Pool({
    host: must("DB_HOST"),
    port: Number(must("DB_PORT")),
    user: must("DB_USER"),
    password: must("DB_PASSWORD"),
    database: must("DB_NAME"),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    // Prevent hanging forever on slow/blocked connections
    query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS ?? "12000"),
    // Apply server-side statement timeout for each connection
    options: `-c statement_timeout=${Number(process.env.DB_STMT_TIMEOUT_MS ?? "12000")}`,
    max: Number(process.env.DB_POOL_MAX ?? "10"),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS ?? "30000"),
    connectionTimeoutMillis: Number(process.env.DB_POOL_CONN_TIMEOUT_MS ?? "8000"),
  });
}

