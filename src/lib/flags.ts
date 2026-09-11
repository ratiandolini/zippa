// Feature flags — ახალი ფუნქციები. Default false ყველგან (production-ში ჩართვა
// მხოლოდ Rati-ს ცალკე დადასტურების შემდეგ, ხელით Vercel env-ში).
// NEXT_PUBLIC_-ით — რომ client-კომპონენტებმაც (ნავიგაცია/ღილაკები) დამალვა/გამოჩენა შეძლონ;
// რეალური enforcement მაინც სერვერზეა (ეს არ არის მხოლოდ UI-ის დამალვა).
export const PARTNER_ONBOARDING_ENABLED = process.env.NEXT_PUBLIC_PARTNER_ONBOARDING_ENABLED === "true";
export const DRIVER_VERIFICATION_ENABLED = process.env.NEXT_PUBLIC_DRIVER_VERIFICATION_ENABLED === "true";

// Retail markup — მხოლოდ სერვერზე გამოსათვლელი, client-ს არასდროს ეხება პირდაპირ
// (არა NEXT_PUBLIC_ — ფასის ლოგიკა client bundle-ში საერთოდ არ ხვდება).
// false => ჩვეულებრივი CUSTOMER-ის ფასი ზუსტად ისეთივეა, როგორიც ამ ცვლილებამდე იყო.
export const RETAIL_PRICE_MARKUP_ENABLED = process.env.RETAIL_PRICE_MARKUP_ENABLED === "true";
export const RETAIL_PRICE_MARKUP_GEL = process.env.RETAIL_PRICE_MARKUP_GEL || "2";

// მრავალამანათიანი შეკვეთა — Phase 1: schema + read-only UI. false-ზე არც შექმნის,
// არც სტატუსის ლოგიკა არსად არსებობს — ეს flag მხოლოდ დამატებულ read-only
// parcel-სიის ჩვენებას იმართავს (ცარიელი მასივია ყოველთვის, სანამ Phase 2 არ დაიწყება).
export const MULTI_PARCEL_ORDERS_ENABLED = process.env.NEXT_PUBLIC_MULTI_PARCEL_ORDERS_ENABLED === "true";
