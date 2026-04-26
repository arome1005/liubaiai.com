export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function safeFilename(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 80) || "export";
}
