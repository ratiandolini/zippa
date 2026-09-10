import { describe, it, expect, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { putProofFile } from "@/lib/storage";

// I2 — მიტანის ფოტო მხოლოდ private store-ში. public Blob-ზე fallback აკრძალული.

const proofsDir = path.join(process.cwd(), "public", "uploads", "proofs");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("putProofFile", () => {
  it("production + PROOF_BLOB_READ_WRITE_TOKEN არ არის → შეცდომა, ფაილი არ იწერება", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PROOF_BLOB_READ_WRITE_TOKEN", "");

    const key = `proofs/prodtest-${Date.now()}.jpg`;
    await expect(putProofFile(key, Buffer.from([1, 2, 3]), "image/jpeg")).rejects.toThrow(
      /PROOF_BLOB_READ_WRITE_TOKEN/,
    );

    // public/uploads-ში public fallback არ მომხდარა
    const exists = await fs
      .access(path.join(process.cwd(), "public", "uploads", key))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("dev (non-production) + token არ არის → ლოკალურ public/uploads/-ში იწერება", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PROOF_BLOB_READ_WRITE_TOKEN", "");

    const key = `proofs/devtest-${Date.now()}.jpg`;
    const { url } = await putProofFile(key, Buffer.from([1, 2, 3]), "image/jpeg");
    expect(url).toBe(`/uploads/${key}`);

    const file = path.join(process.cwd(), "public", "uploads", key);
    expect(await fs.access(file).then(() => true).catch(() => false)).toBe(true);
    await fs.rm(file, { force: true });
  });

});

afterEach(async () => {
  // devtest artifact-ების გაწმენდა
  try {
    const files = await fs.readdir(proofsDir);
    await Promise.all(
      files
        .filter((f) => f.startsWith("devtest-") || f.startsWith("prodtest-"))
        .map((f) => fs.rm(path.join(proofsDir, f), { force: true })),
    );
  } catch {
    /* dir may not exist */
  }
});
