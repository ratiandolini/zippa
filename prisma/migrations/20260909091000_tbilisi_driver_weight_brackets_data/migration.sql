-- თბილისის ტარიფი: კურიერის ანაზღაურება წონა-კალათებით, კმ-კომპონენტი გამორთული.
-- ცვლილება მხოლოდ იმ შემთხვევაში, თუ დისპეჩერს ჯერ არ დაუყენებია საკუთარი ცხრილი.
UPDATE "PricingRule"
SET "driverWeightBrackets" = '[
  {"maxKg":6,"payout":2.5},
  {"maxKg":10,"payout":3},
  {"maxKg":15,"payout":4},
  {"maxKg":20,"payout":5},
  {"maxKg":30,"payout":6.5},
  {"maxKg":40,"payout":8},
  {"maxKg":50,"payout":10}
]'::jsonb,
    "driverBaseFee" = 2.50,
    "driverPerKm" = 0,
    "driverFreeKm" = 0
WHERE "zone" = 'TBILISI' AND "driverWeightBrackets" IS NULL;
