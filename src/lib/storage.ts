// მიტანის ფოტო-დადასტურების საცავი.
// პროდაქშენი: Vercel Blob **private** store (`access: "private"`), ცალკე
// `PROOF_BLOB_READ_WRITE_TOKEN`-ით. ფაილი public-ად არასდროს იწერება.
// dev: ლოკალური public/uploads/ (მხოლოდ NODE_ENV !== "production").
import { promises as fs } from "node:fs";
import path from "node:path";

export interface StoredFile {
  /** შიდა მითითება — ან private blob-ის URL, ან ლოკალური `/uploads/...` (dev). */
  url: string;
}

/** call-time — რომ ტესტმა env-ის გადაფარვა შეძლოს. */
function proofBlobToken() {
  return process.env.PROOF_BLOB_READ_WRITE_TOKEN || "";
}
function isProd() {
  return process.env.NODE_ENV === "production";
}

/**
 * ინახავს მიტანის ფოტოს და აბრუნებს შიდა მითითებას.
 * @param key მაგ. "proofs/<orderId>-<ts>.jpg" (რეალურ გასაღებს ემატება random suffix)
 */
export async function putProofFile(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<StoredFile> {
  const token = proofBlobToken();

  if (token) {
    const { put } = await import("@vercel/blob");
    const res = await put(key, data, {
      access: "private",
      token,
      contentType,
      addRandomSuffix: true,
    });
    return { url: res.url };
  }

  // Token არ არის — public Blob-ზე fallback **აკრძალულია**.
  if (isProd()) {
    throw new Error(
      "PROOF_BLOB_READ_WRITE_TOKEN არ არის კონფიგურირებული — მიტანის ფოტოს ატვირთვა შეჩერებულია",
    );
  }

  // ლოკალური dev — public/uploads/
  const dir = path.join(process.cwd(), "public", "uploads", path.dirname(key));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(process.cwd(), "public", "uploads", key), data);
  return { url: `/uploads/${key}` };
}

export interface ProofBytes {
  body: ReadableStream<Uint8Array> | Uint8Array;
  contentType: string;
}

/** კითხულობს ფოტოს შიდა მითითებით (auth-ს იძახებელი ცალკე ამოწმებს). */
export async function getProofFile(ref: string): Promise<ProofBytes | null> {
  // ლოკალური dev ფაილი
  if (ref.startsWith("/")) {
    const safe = path
      .normalize(ref)
      .replace(/^(\.\.[/\\])+/, "")
      .replace(/^[/\\]+/, "");
    const root = path.join(process.cwd(), "public");
    const file = path.join(root, safe);
    if (!file.startsWith(root)) return null;
    try {
      const buf = await fs.readFile(file);
      return { body: new Uint8Array(buf), contentType: "image/jpeg" };
    } catch {
      return null;
    }
  }

  // private Blob — token-ით
  const token = proofBlobToken();
  if (!token) return null;
  const { get } = await import("@vercel/blob");
  const res = await get(ref, { access: "private", token });
  if (!res || !res.stream) return null;
  return {
    body: res.stream as ReadableStream<Uint8Array>,
    contentType: res.blob.contentType ?? "image/jpeg",
  };
}
