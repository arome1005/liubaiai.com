import { createPool } from "./db.js";

const pool = createPool();

async function main() {
  try {
    const r = await pool.query(
      "select current_database() as db, current_user as usr, inet_server_addr() as server_ip, now() as now",
    );
    console.log("OK:", r.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("CONNECT_FAILED:", e?.message ?? e);
  process.exit(1);
});

