import JSZip from "jszip";
import type { InspirationCollection, InspirationFragment } from "../db/types";
import { SCHEMA_VERSION } from "../db/types";

const MANIFEST = "manifest.json";
const DATA = "inspiration.json";

export type InspirationBackupPayload = {
  app: "liubai-writing";
  kind: "inspiration-export";
  schemaVersion: number;
  exportedAt: string;
  inspirationCollections: InspirationCollection[];
  inspirationFragments: InspirationFragment[];
};

export async function buildInspirationBackupZip(input: {
  inspirationCollections: InspirationCollection[];
  inspirationFragments: InspirationFragment[];
}): Promise<Blob> {
  const payload: InspirationBackupPayload = {
    app: "liubai-writing",
    kind: "inspiration-export",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    inspirationCollections: input.inspirationCollections,
    inspirationFragments: input.inspirationFragments,
  };
  const zip = new JSZip();
  zip.file(
    MANIFEST,
    JSON.stringify(
      {
        app: payload.app,
        kind: payload.kind,
        schemaVersion: payload.schemaVersion,
        exportedAt: payload.exportedAt,
      },
      null,
      2,
    ),
  );
  zip.file(DATA, JSON.stringify(payload, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export async function parseInspirationBackupFile(file: File): Promise<InspirationBackupPayload> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(file);
    const dataFile = zip.file(DATA);
    if (!dataFile) throw new Error("备份 zip 中缺少 inspiration.json");
    const text = await dataFile.async("string");
    const parsed = JSON.parse(text) as InspirationBackupPayload;
    if (parsed?.app !== "liubai-writing" || parsed?.kind !== "inspiration-export") {
      throw new Error("不是留白写作的流光导出文件");
    }
    return parsed;
  }
  const text = await file.text();
  const parsed = JSON.parse(text) as InspirationBackupPayload;
  if (parsed?.app !== "liubai-writing" || parsed?.kind !== "inspiration-export") {
    // 兼容：纯 data.json 片段（用户手动裁剪）
    if (Array.isArray((parsed as unknown as { inspirationFragments?: unknown }).inspirationFragments)) return parsed;
    throw new Error("不是留白写作的流光导出文件");
  }
  return parsed;
}

