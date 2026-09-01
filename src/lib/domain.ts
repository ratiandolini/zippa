import type {
  OrderStatus,
  Role,
  PaymentMethod,
  PaymentStatus,
  DriverStatus,
  VehicleType,
  DeliveryKind,
} from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: "მომხმარებელი",
  DRIVER: "კურიერი",
  DISPATCHER: "დისპეჩერი",
};

export const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: "/app",
  DRIVER: "/driver",
  DISPATCHER: "/dispatch",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "მონახაზი",
  PENDING: "მოლოდინში",
  ASSIGNED: "მინიჭებული",
  ACCEPTED: "მიღებული",
  PICKED_UP: "აღებული",
  IN_TRANSIT: "გზაშია",
  DELIVERED: "ჩაბარებული",
  CANCELLED: "გაუქმებული",
  FAILED: "ჩაიშალა",
};

/** კურიერის მიერ ნებადართული შემდეგი სტატუსები */
export const DRIVER_NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  ASSIGNED: ["ACCEPTED"],
  ACCEPTED: ["PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED", "FAILED"],
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "ნაღდი (ხელზე)",
  CARD: "ონლაინ ბარათით",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "გადაუხდელი",
  PENDING: "მუშავდება",
  PAID: "გადახდილი",
  REFUNDED: "დაბრუნებული",
  FAILED: "ვერ შესრულდა",
};

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  OFFLINE: "ოფლაინ",
  AVAILABLE: "თავისუფალი",
  BUSY: "დაკავებული",
};

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  BIKE: "ველოსიპედი",
  MOTORCYCLE: "მოტოციკლი",
  CAR: "მანქანა",
  VAN: "ფურგონი",
};

export const DELIVERY_KIND_LABEL: Record<DeliveryKind, string> = {
  INTRA_CITY: "ქალაქში",
  INTER_CITY: "ქალაქებს შორის",
};

/** დეტერმინისტული ფორმატირება (SSR-ის და ბრაუზერის იდენტური შედეგი) */
export function GEL(n: number | string): string {
  const num = Number(n) || 0;
  const [int, frac] = Math.abs(num).toFixed(2).split(".");
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${num < 0 ? "−" : ""}${withSep},${frac} ₾`;
}

const KA_MONTHS = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];

/** დეტერმინისტული ქართული თარიღი — "1 სექ" */
export function fmtDate(iso: string | Date): string {
  const d = new Date(iso);
  return `${d.getDate()} ${KA_MONTHS[d.getMonth()]}`;
}

/** "1 სექ, 20:12" */
export function fmtDateTime(iso: string | Date): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDate(d)}, ${hh}:${mm}`;
}

const CITY_WORDS = ["თბილისი", "ბათუმი", "ქუთაისი", "რუსთავი", "საქართველო", "georgia"];

/** მისამართიდან ქუჩის მოკლე ვერსია (ქალაქის/ქვეყნის პრეფიქსის გარეშე) */
export function streetOf(address: string): string {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !CITY_WORDS.some((c) => p.toLowerCase().includes(c)));
  const s = (parts[0] || address.split(",")[0] || address).trim();
  return s.length > 28 ? s.slice(0, 27) + "…" : s;
}
