import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const CONFIG_DIR = join(homedir(), ".liubai-sidecar");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export type SidecarConfig = {
  token: string;
  port: number;
  allowedOrigins: string[];
};

const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  // 作者请把生产域名加这里，例如："https://liubai.example.com"
];

export function loadOrInitConfig(): SidecarConfig {
  mkdirSync(CONFIG_DIR, { recursive: true });
  if (existsSync(CONFIG_PATH)) {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<SidecarConfig>;
    return {
      token: raw.token ?? randomBytes(24).toString("hex"),
      port: raw.port ?? 7788,
      allowedOrigins: raw.allowedOrigins && raw.allowedOrigins.length > 0
        ? raw.allowedOrigins
        : DEFAULT_ORIGINS,
    };
  }
  const cfg: SidecarConfig = {
    token: randomBytes(24).toString("hex"),
    port: 7788,
    allowedOrigins: [...DEFAULT_ORIGINS],
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

export function configPath(): string {
  return CONFIG_PATH;
}
