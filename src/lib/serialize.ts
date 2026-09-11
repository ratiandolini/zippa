import type { Prisma, Role } from "@prisma/client";
import { ACTIVE_ORDER_STATUSES, type FinanceStatus } from "@/lib/domain";

const num = (v: Prisma.Decimal | number | null | undefined) =>
  v == null ? 0 : Number(v);

// კურიერის მდებარეობა ვაჩვენოთ მხოლოდ ამ ხნის განმავლობაში ბოლო განახლების შემდეგ
const LOCATION_FRESH_MS = 10 * 60_000;

export const orderInclude = {
  driver: {
    include: { user: { select: { name: true, phone: true } } },
  },
  customer: {
    select: {
      name: true,
      phone: true,
      email: true,
      accountType: true,
      companyName: true,
      taxId: true,
    },
  },
  events: { orderBy: { createdAt: "asc" } },
  review: { select: { rating: true, comment: true } },
  earnings: { select: { kind: true, driverAmount: true, companyAmount: true, isSettled: true } },
  // მრავალამანათიანი შეკვეთა (Phase 1, read-only) — ლეგასი (isMultiParcel=false)
  // შეკვეთაზე ეს ცხრილი ცარიელია, ქვემოთ `parcels: []`-ს აბრუნებს.
  parcels: { orderBy: { sequenceNo: "asc" } },
} satisfies Prisma.OrderInclude;

type OrderWith = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** ვინ ხედავს შეკვეთას — განსაზღვრავს რა ველები დაიფარება.
 *  DISPATCHER — სრული. CUSTOMER — თავისი ფასი, კურიერის ანაზღაურება/მარჟა დამალული.
 *  DRIVER — თავისი ანაზღაურება ჩანს, კომპანიის მარჟა/კლიენტის PII/PIN დამალული. */
export type OrderViewer = Extract<Role, "DISPATCHER" | "CUSTOMER" | "DRIVER">;

export function serializeOrder(o: OrderWith, viewer: OrderViewer = "DISPATCHER") {
  // ── ფინანსური სტატუსი ──
  // კლიენტის ვალდებულება Zippa-სთან (გაუქმება/დაბრუნება), ჯერ არ მიღებული
  const chargeTotal = Math.round((num(o.cancelFee) + num(o.returnFee)) * 100) / 100;
  const chargeReceived = o.chargeSettledAt != null;
  const customerOwed = chargeTotal > 0 && !chargeReceived ? chargeTotal : 0;
  // ამ შეკვეთაზე კურიერისთვის გადასახდელი (დარიცხული, ჯერ არ ჩართული payout-ში)
  const driverPayable =
    Math.round(
      o.earnings.filter((e) => !e.isSettled).reduce((s, e) => s + Number(e.driverAmount), 0) * 100,
    ) / 100;
  // ფინანსური სტატუსი მხოლოდ გაუქმება/დაბრუნების საფასურის მქონე შეკვეთებზე
  const financeStatus: FinanceStatus | null =
    chargeTotal <= 0
      ? null
      : customerOwed > 0
        ? "OWED"
        : driverPayable > 0
          ? "DRIVER_PAYABLE"
          : "RECEIVED";

  const isCustomer = viewer === "CUSTOMER";
  const isDriver = viewer === "DRIVER";
  const isDispatcher = viewer === "DISPATCHER";

  return {
    id: o.id,
    trackingNumber: o.trackingNumber,
    status: o.status,
    kind: o.kind,
    zone: o.zone,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    assignedAt: o.assignedAt?.toISOString() ?? null,
    estimatedDeliveryAt: o.estimatedDeliveryAt?.toISOString() ?? null,

    customerId: o.customerId,
    customerName: isDriver ? "" : o.customer.name,
    customer: {
      name: isDriver ? "" : o.customer.name,
      phone: isDriver ? "" : o.customer.phone,
      email: isDriver ? "" : o.customer.email,
      accountType: o.customer.accountType,
      companyName: isDriver ? null : o.customer.companyName,
      taxId: isDriver ? null : o.customer.taxId,
    },

    driverId: o.driverId,
    driverName: o.driver?.user.name ?? null,
    // კურიერის ტელეფონი — მხოლოდ დისპეჩერს და შეკვეთის კლიენტს (კურიერთან დასაკავშირებლად)
    driverPhone: isDriver ? null : (o.driver?.user.phone ?? null),
    // მდებარეობა მხოლოდ მიმდინარე მიტანაზე და მხოლოდ ახალი (≤10 წთ) — თორემ „გაყინული" ჩვენება
    driverLocation:
      o.driver?.currentLat != null &&
      o.driver?.currentLng != null &&
      ACTIVE_ORDER_STATUSES.includes(o.status) &&
      o.driver.locationUpdatedAt != null &&
      Date.now() - o.driver.locationUpdatedAt.getTime() < LOCATION_FRESH_MS
        ? { lat: o.driver.currentLat, lng: o.driver.currentLng }
        : null,

    sender: { name: o.senderName, phone: o.senderPhone },
    recipient: { name: o.recipientName, phone: o.recipientPhone },

    pickup: { address: o.pickupAddress, lat: o.pickupLat, lng: o.pickupLng, note: o.pickupNote },
    delivery: {
      address: o.deliveryAddress,
      lat: o.deliveryLat,
      lng: o.deliveryLng,
      note: o.deliveryNote,
    },

    weightKg: num(o.weightKg),
    description: o.description,
    parcelValue: o.parcelValue == null ? null : num(o.parcelValue),
    collectAmount: num(o.collectAmount),
    codCommission: isDispatcher || isCustomer ? num(o.codCommission) : 0,
    codRemitted: o.codRemittanceId != null,

    // მიტანის დადასტურება
    deliveryProof: o.deliveryProof,
    // PIN — მხოლოდ დისპეჩერს და კლიენტს (კლიენტი მიმღებს გადასცემს; კურიერმა არ უნდა იცოდეს)
    deliveryPin: isDriver ? null : o.deliveryPin,

    distanceKm: num(o.distanceKm),
    price: {
      delivery: num(o.deliveryPrice),
      codFee: num(o.codFee),
      total: num(o.totalPrice),
      // კურიერს ერიცხება — ხედავს კურიერი (თავისი) და დისპეჩერი; კლიენტი — არა
      driverFee: isCustomer ? 0 : num(o.driverFee),
      // პარტნიორის ხარჯი და Zippa-ს მარჟა — მხოლოდ დისპეჩერს
      partnerCost: isDispatcher ? num(o.partnerCost) : 0,
      companyMargin: isDispatcher ? num(o.companyMargin) : 0,
    },
    pricingSource: o.pricingSource,
    priceAdjustmentReason: isDriver ? null : o.priceAdjustmentReason,
    priceAdjustedAt: o.priceAdjustedAt?.toISOString() ?? null,
    needsManualReview: o.needsManualReview,

    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    payerSide: o.payerSide,
    codAmount: num(o.codAmount),
    // კლიენტის დავალიანება (გაუქმება/დაბრუნება) — კურიერს არ ეხება
    cancelFee: isDriver ? 0 : num(o.cancelFee),
    returnFee: isDriver ? 0 : num(o.returnFee),
    chargeSettledAt: isDriver ? null : (o.chargeSettledAt?.toISOString() ?? null),
    finance: isDispatcher
      ? {
          status: financeStatus,
          customerOwed,
          chargeReceived,
          driverPayable,
        }
      : isCustomer
        ? {
            status: (customerOwed > 0 ? "OWED" : null) as FinanceStatus | null,
            customerOwed,
            chargeReceived,
            driverPayable: 0,
          }
        : { status: null as FinanceStatus | null, customerOwed: 0, chargeReceived: false, driverPayable: 0 },
    failureReason: o.failureReason,
    returnRequestedAt: o.returnRequestedAt?.toISOString() ?? null,
    returnReason: o.returnReason,
    returnResolvedAt: o.returnResolvedAt?.toISOString() ?? null,

    // მიტანის ფოტო — არასდროს ვაბრუნებთ ნედლ (public) blob URL-ს.
    // მხოლოდ ავტ. endpoint-ის მისამართს, რომელიც წვდომას ამოწმებს.
    proofPhotoUrl: o.proofPhotoUrl ? `/api/orders/${o.id}/photo` : null,

    review: o.review ? { rating: o.review.rating, comment: o.review.comment } : null,

    events: o.events.map((e) => ({
      status: e.status,
      note: e.note,
      lat: e.lat,
      lng: e.lng,
      createdAt: e.createdAt.toISOString(),
    })),

    // მრავალამანათიანი შეკვეთა (Phase 1, read-only) — ლეგასი შეკვეთაზე ყოველთვის [].
    isMultiParcel: o.isMultiParcel,
    parcelCount: o.parcelCount,
    parcels: o.parcels.map((p) => ({
      id: p.id,
      sequenceNo: p.sequenceNo,
      label: p.label,
      weightKg: num(p.weightKg),
      description: p.description,
      declaredValue: p.declaredValue == null ? null : num(p.declaredValue),
      status: p.status,
      pickupAttempts: p.pickupAttempts,
      codAmount: num(p.codAmount),
      failureReason: p.failureReason,
      failureNote: p.failureNote,
      pickedUpAt: p.pickedUpAt?.toISOString() ?? null,
      deliveredAt: p.deliveredAt?.toISOString() ?? null,
      returnRequestedAt: p.returnRequestedAt?.toISOString() ?? null,
      returnedAt: p.returnedAt?.toISOString() ?? null,
      cancelledAt: p.cancelledAt?.toISOString() ?? null,
      // ნედლი blob URL — Phase 2+-ის დაცული proxy endpoint-ის გარეშე არასდროს არ გაცემა
      proofPhotoUrl: null as string | null,
    })),
  };
}

export type OrderDTO = ReturnType<typeof serializeOrder>;
