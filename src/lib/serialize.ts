import type { Prisma } from "@prisma/client";
import { ACTIVE_ORDER_STATUSES } from "@/lib/domain";

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
} satisfies Prisma.OrderInclude;

type OrderWith = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function serializeOrder(o: OrderWith) {
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
    customerName: o.customer.name,
    customer: {
      name: o.customer.name,
      phone: o.customer.phone,
      email: o.customer.email,
      accountType: o.customer.accountType,
      companyName: o.customer.companyName,
      taxId: o.customer.taxId,
    },

    driverId: o.driverId,
    driverName: o.driver?.user.name ?? null,
    driverPhone: o.driver?.user.phone ?? null,
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
    codCommission: num(o.codCommission),
    codRemitted: o.codRemittanceId != null,

    distanceKm: num(o.distanceKm),
    price: {
      delivery: num(o.deliveryPrice),
      codFee: num(o.codFee),
      total: num(o.totalPrice),
      driverFee: num(o.driverFee),
    },

    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    payerSide: o.payerSide,
    codAmount: num(o.codAmount),
    cancelFee: num(o.cancelFee),
    returnFee: num(o.returnFee),
    failureReason: o.failureReason,
    returnRequestedAt: o.returnRequestedAt?.toISOString() ?? null,
    returnReason: o.returnReason,
    returnResolvedAt: o.returnResolvedAt?.toISOString() ?? null,

    proofPhotoUrl: o.proofPhotoUrl,

    review: o.review ? { rating: o.review.rating, comment: o.review.comment } : null,

    events: o.events.map((e) => ({
      status: e.status,
      note: e.note,
      lat: e.lat,
      lng: e.lng,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export type OrderDTO = ReturnType<typeof serializeOrder>;
