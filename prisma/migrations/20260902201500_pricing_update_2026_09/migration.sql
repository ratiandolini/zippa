-- ტარიფების განახლება (Rati-ს დამტკიცებული, 2026-09-02) — წონა-კალათები + კურიერის ბაზა თბილისში.
-- data-only მიგრაცია: არსებულ PricingRule-ებს ვანახლებთ ერთხელ.

UPDATE "PricingRule"
SET "weightBrackets" = '[{"maxKg":6,"price":5},{"maxKg":10,"price":6},{"maxKg":15,"price":8},{"maxKg":20,"price":10},{"maxKg":30,"price":13},{"maxKg":40,"price":16},{"maxKg":50,"price":20}]'::jsonb,
    "driverFlatFee" = 3.00
WHERE "zone" = 'TBILISI';

UPDATE "PricingRule"
SET "weightBrackets" = '[{"maxKg":6,"price":7},{"maxKg":10,"price":9},{"maxKg":15,"price":12},{"maxKg":20,"price":15},{"maxKg":30,"price":19},{"maxKg":40,"price":28},{"maxKg":50,"price":38}]'::jsonb
WHERE "zone" = 'REGIONAL_CITY';

UPDATE "PricingRule"
SET "weightBrackets" = '[{"maxKg":6,"price":11},{"maxKg":10,"price":13},{"maxKg":15,"price":16},{"maxKg":20,"price":19},{"maxKg":30,"price":23},{"maxKg":40,"price":33},{"maxKg":50,"price":43}]'::jsonb
WHERE "zone" = 'TOWN_VILLAGE';
