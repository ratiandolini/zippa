import { prisma } from "@/lib/db";
import { requireRole, handle, ok, throttle, ApiError } from "@/lib/api";
import { putProofFile } from "@/lib/storage";
import { DRIVER_DOCUMENT_TYPES } from "@/lib/validation";
import { DRIVER_VERIFICATION_ENABLED } from "@/lib/flags";

const MAX_BYTES = 5 * 1024 * 1024;

// MIME + file-signature (magic bytes) — filename/Content-Type header არ ვენდობით ცალკე
const SIGNATURES: { mime: string; ext: string; check: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", check: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  {
    mime: "image/jpeg",
    ext: "jpg",
    check: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/png",
    ext: "png",
    check: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
];

export function POST(req: Request) {
  return handle(async () => {
    if (!DRIVER_VERIFICATION_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    const session = await requireRole("DRIVER");
    await throttle(req, "driver-doc-upload", 20, 60);

    const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    if (!dp) throw new ApiError(404, "კურიერის პროფილი ვერ მოიძებნა");

    const verification = await prisma.driverVerification.upsert({
      where: { driverId: dp.id },
      update: {},
      create: { driverId: dp.id, status: "NOT_SUBMITTED" },
    });

    const form = await req.formData();
    const typeRaw = form.get("type");
    const file = form.get("file");
    if (typeof typeRaw !== "string" || !DRIVER_DOCUMENT_TYPES.includes(typeRaw as never)) {
      throw new ApiError(422, "დოკუმენტის ტიპი არასწორია");
    }
    if (!(file instanceof File)) throw new ApiError(422, "ფაილი არ არის მიმაგრებული");
    if (file.size === 0 || file.size > MAX_BYTES) throw new ApiError(422, "ფაილის ზომა 5MB-ზე მეტია");

    const buf = Buffer.from(await file.arrayBuffer());
    const sig = SIGNATURES.find((s) => s.check(buf));
    if (!sig) throw new ApiError(422, "დაშვებულია მხოლოდ PDF, JPG ან PNG ფაილი");

    // filename-ს არ ენდობით — key სრულად სერვერზე გენერირებულია
    const key = `driver-docs/${dp.id}-${typeRaw}-${Date.now()}.${sig.ext}`;
    let storedUrl: string;
    try {
      ({ url: storedUrl } = await putProofFile(key, buf, sig.mime));
    } catch {
      throw new ApiError(503, "დოკუმენტების საცავი მიუწვდომელია — სცადეთ მოგვიანებით");
    }

    const doc = await prisma.driverDocument.create({
      data: {
        driverVerificationId: verification.id,
        type: typeRaw as never,
        privateStorageKey: storedUrl,
        mimeType: sig.mime,
        size: file.size,
      },
    });

    return ok({ document: { id: doc.id, type: doc.type, status: doc.status } });
  });
}
