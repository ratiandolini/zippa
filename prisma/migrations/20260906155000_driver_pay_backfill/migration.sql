-- კურიერის ანაზღაურება: ფიქსირებული → „ბაზისი + კმ".
-- ბაზისი ≈ ძველი ფიქსირებულის დონე, პლუს 0.5 ₾/კმ 5 კმ-ის შემდეგ.
-- მოქმედებს მხოლოდ იმ წესებზე, სადაც ახალი მოდელი ჯერ არ დაყენებულა (driverBaseFee = 0).
UPDATE "PricingRule" SET "driverBaseFee" = 2.50, "driverPerKm" = 0.50, "driverFreeKm" = 5
  WHERE "zone" = 'TBILISI' AND "driverBaseFee" = 0;
UPDATE "PricingRule" SET "driverBaseFee" = 4.00, "driverPerKm" = 0.50, "driverFreeKm" = 5
  WHERE "zone" = 'REGIONAL_CITY' AND "driverBaseFee" = 0;
UPDATE "PricingRule" SET "driverBaseFee" = 6.00, "driverPerKm" = 0.50, "driverFreeKm" = 5
  WHERE "zone" = 'TOWN_VILLAGE' AND "driverBaseFee" = 0;
