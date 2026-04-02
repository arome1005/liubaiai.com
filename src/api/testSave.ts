const JSON_HEADERS = { "Content-Type": "application/json" };

export type TestSaveResponse = {
  ok: true;
  userId: string;
  row: { id: string; createdAt: string };
};

export async function postTestSave(text: string): Promise<TestSaveResponse> {
  const r = await fetch("/api/test-save", {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify({ text }),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string } & Partial<TestSaveResponse>;
  if (!r.ok) throw new Error(data.error ?? "TEST_SAVE_FAILED");
  if (!data.ok || !data.row) throw new Error("TEST_SAVE_FAILED");
  return data as TestSaveResponse;
}
