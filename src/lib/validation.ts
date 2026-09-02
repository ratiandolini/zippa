import { z } from "zod";

// ქართული ტელეფონი: +995 5XX XXX XXX ან 5XX XXX XXX (9 ციფრი)
const phoneRegex = /^(\+995)?\s?5\d{2}\s?\d{2}\s?\d{2}\s?\d{2}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(phoneRegex, "ტელეფონის ფორმატი არასწორია (მაგ. +995 555 12 34 56)")
  .transform((v) => {
    const digits = v.replace(/\D/g, "");
    const local = digits.slice(-9); // ბოლო 9 ციფრი
    return `+995${local}`;
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "სახელი ძალიან მოკლეა").max(80),
    email: z.string().trim().toLowerCase().email("ელფოსტა არასწორია"),
    phone: phoneSchema,
    password: z.string().min(8, "პაროლი მინიმუმ 8 სიმბოლო"),
    role: z.enum(["CUSTOMER", "DRIVER"]).default("CUSTOMER"),
    accountType: z.enum(["INDIVIDUAL", "COMPANY"]).default("INDIVIDUAL"),
    companyName: z.string().trim().max(160).optional(),
    taxId: z.string().trim().max(20).optional(),
    agreed: z.literal(true, {
      errorMap: () => ({ message: "დაეთანხმეთ წესებსა და კონფიდენციალურობის პოლიტიკას" }),
    }),
  })
  .refine((d) => d.role !== "CUSTOMER" || d.accountType !== "COMPANY" || !!d.companyName?.trim(), {
    message: "მიუთითეთ კომპანიის დასახელება",
    path: ["companyName"],
  })
  .refine((d) => d.role !== "CUSTOMER" || d.accountType !== "COMPANY" || /^\d{9,11}$/.test(d.taxId ?? ""), {
    message: "საიდენტიფიკაციო კოდი 9–11 ციფრია",
    path: ["taxId"],
  });

export const loginSchema = z.object({
  emailOrPhone: z.string().trim().min(3, "შეავსე ველი"),
  password: z.string().min(1, "შეავსე პაროლი"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// ─── შეკვეთა ───

const point = z.object({
  address: z.string().trim().min(3, "მიუთითე მისამართი"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const createOrderSchema = z.object({
  sender: z.object({
    name: z.string().trim().min(2, "ამგზავნის სახელი"),
    phone: phoneSchema,
  }),
  recipient: z.object({
    name: z.string().trim().min(2, "მიმღების სახელი"),
    phone: phoneSchema,
  }),
  pickup: point.extend({ note: z.string().trim().max(200).optional() }),
  delivery: point.extend({ note: z.string().trim().max(200).optional() }),
  weightKg: z.number().positive("წონა 0-ზე მეტი").max(500),
  description: z.string().trim().max(400).optional(),
  parcelValue: z.number().nonnegative().max(100000).optional(),
  paymentMethod: z.enum(["CASH", "CARD"]).default("CASH"),
  payerSide: z.enum(["SENDER", "RECIPIENT"]).default("SENDER"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const assignDriverSchema = z.object({ driverId: z.string().cuid() });

// ─── ტარიფის წესი ───

const money = z.number().nonnegative().max(100000);

export const pricingRuleSchema = z.object({
  zone: z.enum(["TBILISI", "REGIONAL_CITY", "TOWN_VILLAGE"]),
  isActive: z.boolean().default(true),
  weightBrackets: z
    .array(z.object({ maxKg: z.number().positive().max(1000), price: money }))
    .min(1, "მინიმუმ ერთი წონა-კალათა"),
  codFee: money,
  driverFlatFee: money,
  driverPayoutPercent: z.number().int().min(0).max(100).nullable().optional(),
  sameDayCutoffHour: z.number().int().min(0).max(23).nullable().optional(),
  deliveryDays: z.number().int().min(0).max(14).default(1),
});

export type PricingRuleInput = z.infer<typeof pricingRuleSchema>;

// ─── პროფილი / შეფასება / payout ───

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: phoneSchema.optional(),
  accountType: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
  companyName: z.string().trim().max(160).nullable().optional(),
  taxId: z.string().trim().max(20).nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "შეავსე მიმდინარე პაროლი"),
  newPassword: z.string().min(8, "ახალი პაროლი მინიმუმ 8 სიმბოლო"),
});

export const forgotSchema = z.object({
  emailOrPhone: z.string().trim().min(3, "შეავსე ველი"),
});

export const resetSchema = z.object({
  emailOrPhone: z.string().trim().min(3),
  code: z.string().trim().regex(/^\d{6}$/, "კოდი 6 ციფრია"),
  newPassword: z.string().min(8, "პაროლი მინიმუმ 8 სიმბოლო"),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export const payoutSchema = z.object({
  amount: z.number().positive().max(1000000),
  note: z.string().trim().max(200).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum([
    "ACCEPTED",
    "PICKED_UP",
    "IN_TRANSIT",
    "DELIVERED",
    "FAILED",
    "CANCELLED",
  ]),
  note: z.string().trim().max(300).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
