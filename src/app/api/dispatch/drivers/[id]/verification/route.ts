import { prisma } from "@/lib/db";
import { requireRole, handle, ok, fail, throttle, ApiError } from "@/lib/api";
import { driverVerificationReviewSchema } from "@/lib/validation";
import { notifyDriver } from "@/lib/notify";
import { sendEmail } from "@/lib/email";
import { DRIVER_VERIFICATION_ENABLED } from "@/lib/flags";

// [id] = DriverProfile.id (არსებული /dispatch/drivers/[id] გვერდის იდენტიფიკატორის იგივეა)
const REQUIRED_DOC_TYPES: Record<string, string[]> = {
  FOOT: ["ID_FRONT", "ID_BACK"],
  BICYCLE: ["ID_FRONT", "ID_BACK"],
  MOTORCYCLE: ["ID_FRONT", "ID_BACK", "DRIVER_LICENSE_FRONT", "DRIVER_LICENSE_BACK"],
  CAR: ["ID_FRONT", "ID_BACK", "DRIVER_LICENSE_FRONT", "DRIVER_LICENSE_BACK"],
  VAN: ["ID_FRONT", "ID_BACK", "DRIVER_LICENSE_FRONT", "DRIVER_LICENSE_BACK"],
};

export function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!DRIVER_VERIFICATION_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    await requireRole("DISPATCHER");

    const v = await prisma.driverVerification.findUnique({
      where: { driverId: params.id },
      include: { documents: { orderBy: { uploadedAt: "desc" } }, driver: { include: { user: true } } },
    });
    if (!v) return ok({ verification: null });

    const submittedTypes = new Set(v.documents.map((d) => d.type));
    const required = REQUIRED_DOC_TYPES[v.transportType] ?? [];
    const missingTypes = required.filter((t) => !submittedTypes.has(t as never));

    return ok({
      verification: {
        transportType: v.transportType,
        status: v.status,
        personalIdLast4: v.personalIdLast4,
        rejectionReason: v.rejectionReason,
        changesRequestedMessage: v.changesRequestedMessage,
        submittedAt: v.submittedAt?.toISOString() ?? null,
        reviewedAt: v.reviewedAt?.toISOString() ?? null,
        missingTypes,
        documents: v.documents.map((d) => ({
          id: d.id,
          type: d.type,
          mimeType: d.mimeType,
          size: d.size,
          uploadedAt: d.uploadedAt.toISOString(),
          viewUrl: `/api/driver/verification/documents/${d.id}`,
        })),
        driver: { name: v.driver.user.name, email: v.driver.user.email, phone: v.driver.user.phone },
      },
    });
  });
}

export function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    if (!DRIVER_VERIFICATION_ENABLED) throw new ApiError(404, "ეს ფუნქცია ჯერ არ არის ხელმისაწვდომი");
    const session = await requireRole("DISPATCHER");
    await throttle(req, "driver-verification-review", 30, 60);
    const body = driverVerificationReviewSchema.parse(await req.json());

    const v = await prisma.driverVerification.findUnique({
      where: { driverId: params.id },
      include: { documents: true, driver: { select: { userId: true } } },
    });
    if (!v) return fail(404, "ვერიფიკაციის განაცხადი ვერ მოიძებნა");

    const TERMINAL_MATCH: Record<string, string> = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      SUSPEND: "SUSPENDED",
    };
    if (TERMINAL_MATCH[body.action] === v.status) {
      return fail(409, `ვერიფიკაცია უკვე ${TERMINAL_MATCH[body.action]}-ია`);
    }

    if (body.action === "APPROVE") {
      const submittedTypes = new Set(v.documents.map((d) => d.type));
      const required = REQUIRED_DOC_TYPES[v.transportType] ?? [];
      const missing = required.filter((t) => !submittedTypes.has(t as never));
      if (missing.length) {
        return fail(422, `დამტკიცება შეუძლებელია — აკლია დოკუმენტები: ${missing.join(", ")}`);
      }
      if (!["PENDING", "CHANGES_REQUESTED"].includes(v.status)) {
        return fail(422, `სტატუსი (${v.status}) არ არის განხილვისთვის მზადყოფნაში`);
      }
    }

    const [updated] = await prisma.$transaction([
      prisma.driverVerification.update({
        where: { driverId: params.id },
        data: {
          status:
            body.action === "APPROVE"
              ? "APPROVED"
              : body.action === "CHANGES_REQUESTED"
                ? "CHANGES_REQUESTED"
                : body.action === "REJECT"
                  ? "REJECTED"
                  : "SUSPENDED",
          rejectionReason: body.action === "REJECT" || body.action === "SUSPEND" ? (body.message ?? "") : null,
          changesRequestedMessage: body.action === "CHANGES_REQUESTED" ? (body.message ?? "საჭიროა შესწორება") : null,
          reviewedAt: new Date(),
          reviewedById: session.sub,
        },
      }),
      // ჭეშმარიტი offer/assign-გატი — DriverProfile.isApproved (არსებული ლოგიკა, უცვლელი)
      prisma.driverProfile.update({
        where: { id: params.id },
        data: { isApproved: body.action === "APPROVE" },
      }),
    ]);

    const STATUS_LABEL: Record<string, string> = {
      APPROVED: "დამტკიცებულია — შეკვეთების მიღება შესაძლებელია",
      CHANGES_REQUESTED: `საჭიროა შესწორება: ${updated.changesRequestedMessage}`,
      REJECTED: `უარყოფილია: ${updated.rejectionReason}`,
      SUSPENDED: `შეჩერებულია: ${updated.rejectionReason}`,
    };
    await notifyDriver(params.id, {
      title: "ვერიფიკაციის შედეგი",
      body: STATUS_LABEL[updated.status] ?? "სტატუსი განახლდა",
    }).catch((e) => console.error("[driver-verification-review] notify", e));
    const user = await prisma.user.findUnique({ where: { id: v.driver.userId }, select: { email: true } });
    if (user) {
      await sendEmail(
        user.email,
        "Zippa — კურიერის ვერიფიკაცია",
        STATUS_LABEL[updated.status] ?? "სტატუსი განახლდა",
      ).catch((e) => console.error("[driver-verification-review] sendEmail", e));
    }

    return ok({ verification: { status: updated.status } });
  });
}
