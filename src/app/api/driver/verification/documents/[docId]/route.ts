import { prisma } from "@/lib/db";
import { requireUser, handle, fail, ApiError } from "@/lib/api";
import { getProofFile } from "@/lib/storage";
import { DRIVER_VERIFICATION_ENABLED } from "@/lib/flags";

// დაცული დოკუმენტ-view: auth + (მფლობელი DRIVER ან DISPATCHER) + private blob proxy.
// raw storage URL არასდროს ბრუნდება client-ს.
export function GET(_req: Request, { params }: { params: { docId: string } }) {
  return handle(async () => {
    if (!DRIVER_VERIFICATION_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    const session = await requireUser();

    const doc = await prisma.driverDocument.findUnique({
      where: { id: params.docId },
      include: { driverVerification: { include: { driver: { select: { userId: true } } } } },
    });
    if (!doc) return fail(404, "დოკუმენტი ვერ მოიძებნა");

    const isOwner = session.role === "DRIVER" && doc.driverVerification.driver.userId === session.sub;
    const isDispatcher = session.role === "DISPATCHER";
    if (!isOwner && !isDispatcher) return fail(403, "წვდომა აკრძალულია");

    const file = await getProofFile(doc.privateStorageKey);
    if (!file) return fail(404, "ფაილი ვერ მოიძებნა");

    return new Response(file.body as BodyInit, {
      headers: {
        // doc.mimeType — signature-ით ვერიფიცირებული, ატვირთვისას შენახული ტიპი (არა storage-ის ვარაუდი)
        "content-type": doc.mimeType,
        "cache-control": "private, no-store",
      },
    });
  });
}
