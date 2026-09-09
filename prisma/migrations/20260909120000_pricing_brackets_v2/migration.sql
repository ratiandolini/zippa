-- დამტკიცებული კლიენტის ტარიფები — წონა-კალათების ზღვრები 6/11/16/21/31/41/51 კგ.
-- ზედა ზღვარი ჩათვლითია: weightKg <= maxKg → ამ კალათის ფასი.

UPDATE "PricingRule"
SET "weightBrackets" = '[
  {"maxKg":6,"price":5},
  {"maxKg":11,"price":6},
  {"maxKg":16,"price":7},
  {"maxKg":21,"price":10},
  {"maxKg":31,"price":13},
  {"maxKg":41,"price":16},
  {"maxKg":51,"price":20}
]'::jsonb,
    "driverWeightBrackets" = '[
  {"maxKg":6,"payout":2.5},
  {"maxKg":11,"payout":3},
  {"maxKg":16,"payout":4},
  {"maxKg":21,"payout":5},
  {"maxKg":31,"payout":6.5},
  {"maxKg":41,"payout":8},
  {"maxKg":51,"payout":10}
]'::jsonb
WHERE "zone" = 'TBILISI';

UPDATE "PricingRule"
SET "weightBrackets" = '[
  {"maxKg":6,"price":7},
  {"maxKg":11,"price":10},
  {"maxKg":16,"price":13},
  {"maxKg":21,"price":16},
  {"maxKg":31,"price":19},
  {"maxKg":41,"price":30},
  {"maxKg":51,"price":40}
]'::jsonb
WHERE "zone" = 'REGIONAL_CITY';

UPDATE "PricingRule"
SET "weightBrackets" = '[
  {"maxKg":6,"price":11},
  {"maxKg":11,"price":14},
  {"maxKg":16,"price":17},
  {"maxKg":21,"price":20},
  {"maxKg":31,"price":23},
  {"maxKg":41,"price":35},
  {"maxKg":51,"price":45}
]'::jsonb
WHERE "zone" = 'TOWN_VILLAGE';
