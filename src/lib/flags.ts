// Feature flags — ახალი ფუნქციები. Default false ყველგან (production-ში ჩართვა
// მხოლოდ Rati-ს ცალკე დადასტურების შემდეგ, ხელით Vercel env-ში).
// NEXT_PUBLIC_-ით — რომ client-კომპონენტებმაც (ნავიგაცია/ღილაკები) დამალვა/გამოჩენა შეძლონ;
// რეალური enforcement მაინც სერვერზეა (ეს არ არის მხოლოდ UI-ის დამალვა).
export const PARTNER_ONBOARDING_ENABLED = process.env.NEXT_PUBLIC_PARTNER_ONBOARDING_ENABLED === "true";
export const DRIVER_VERIFICATION_ENABLED = process.env.NEXT_PUBLIC_DRIVER_VERIFICATION_ENABLED === "true";
