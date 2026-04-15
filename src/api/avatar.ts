import { getSupabase } from "../lib/supabase";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIM = 512;

async function resizeImageToJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法绘制图片");
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88),
    );
    if (!blob) throw new Error("图片压缩失败");
    return blob;
  } finally {
    bmp.close();
  }
}

async function supabaseWithSession() {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return sb;
  return null;
}

/**
 * 上传头像到 Storage `avatars` 桶，并写入 auth.user.user_metadata.avatar_url
 * 需先在 Supabase 执行 supabase/avatars-storage.sql
 */
export async function uploadUserAvatar(file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("请上传 JPG、PNG、WebP 或 GIF 图片");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("图片请小于 5MB");
  }
  const sb = await supabaseWithSession();
  if (!sb) throw new Error("请先登录");
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) throw new Error("请先登录");
  const uid = userData.user.id;
  const blob = await resizeImageToJpeg(file);
  const path = `${uid}/avatar.jpg`;
  const { error: upErr } = await sb.storage.from("avatars").upload(path, blob, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (upErr) {
    const msg = upErr.message ?? "";
    if (/bucket|not found|404/i.test(msg)) {
      throw new Error(
        "未配置头像存储：请在 Supabase 执行仓库内 supabase/avatars-storage.sql，并确认 Storage 中有公开桶 avatars。",
      );
    }
    throw new Error("上传失败：" + msg);
  }
  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
  const publicUrl = pub.publicUrl;
  const { error: metaErr } = await sb.auth.updateUser({ data: { avatar_url: publicUrl } });
  if (metaErr) throw new Error(metaErr.message);
  return publicUrl;
}
