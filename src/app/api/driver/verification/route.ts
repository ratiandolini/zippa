import { prisma } from "@/lib/db";
import { requireRole, handle, ok, throttle, ApiError } from "@/lib/api";
import { driverVerificationSubmitSchema } from "@/lib/validation";
import { notifyDispatchers } from "@/lib/notify";
import { DRIVER_VERIFICATION_ENABLED } from "@/lib/flags";

function guard() {
  if (!DRIVER_VERIFICATION_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
}

export function GET() {
  return handle(async () => {
    guard();
    const session = await requireRole("DRIVER");
    const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    if (!dp) return ok({ verification: null });

    const v = await prisma.driverVerification.findUnique({
      where: { driverId: dp.id },
      include: { documents: { orderBy: { uploadedAt: "desc" } } },
    });
    if (!v) return ok({ verification: null });

    return ok({
      verification: {
        transportType: v.transportType,
        status: v.status,
        personalIdLast4: v.personalIdLast4,
        rejectionReason: v.rejectionReason,
        changesRequestedMessage: v.changesRequestedMessage,
        submittedAt: v.submittedAt?.toISOString() ?? null,
        documents: v.documents.map((d) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          uploadedAt: d.uploadedAt.toISOString(),
        })),
      },
    });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    guard();
    const session = await requireRole("DRIVER");
    await throttle(req, "driver-verification-submit", 10, 60);
    const data = driverVerificationSubmitSchema.parse(await req.json());

    const dp = await prisma.driverProfile.findUnique({ where: { userId: session.sub } });
    if (!dp) throw new ApiError(404, "კურიერის პროფილი ვერ მოიძებნა");

    const v = await prisma.driverVerification.upsert({
      where: { driverId: dp.id },
      update: {
        transportType: data.transportType,
        personalIdLast4: data.personalIdLast4 ?? undefined,
        status: "PENDING",
        submittedAt: new Date(),
        changesRequestedMessage: null,
      },
      create: {
        driverId: dp.id,
        transportType: data.transportType,
        personalIdLast4: data.personalIdLast4,
        status: "PENDING",
        submittedAt: new Date(),
      },
    });

    await notifyDispatchers({
      title: "კურიერის ვერიფიკაციის განაცხადი",
      body: "ახალი კურიერი ელოდება დოკუმენტების გადამოწმებას",
      url: `/dispatch/drivers/${dp.id}/verification`,
    }).catch((e) => console.error("[driver-verification] notifyDispatchers", e));

    return ok({ verification: { status: v.status } });
  });
}
