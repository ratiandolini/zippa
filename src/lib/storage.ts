// ფაილ-საცავი — Vercel Blob (პროდაქშენი) ან ლოკალური public/uploads (dev).
// გამოიყენება მიტანის ფოტო-დადასტურებისთვის.
import { promises as fs } from "node:fs";
import path from "node:path";

const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

export interface StoredFile {
  url: string;
}

/**
 * ინახავს ფაილს და აბრუნებს საჯარო URL-ს.
 * @param key უნიკალური გასაღები, მაგ. "proofs/<orderId>-<ts>.jpg"
 */
export async function putFile(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<StoredFile> {
  if (hasBlob) {
    const { put } = await import("@vercel/blob");
    const res = await put(key, data, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return { url: res.url };
  }

  // ლოკალური dev — public/uploads/
  const dir = path.join(process.cwd(), "public", "uploads", path.dirname(key));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(process.cwd(), "public", "uploads", key), data);
  return { url: `/uploads/${key}` };
}
