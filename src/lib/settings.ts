import { prisma } from "@/lib/db";

// გლობალური კონფიგი Setting ცხრილში (key → JSON value)

const DEFAULTS = {
  cod_commission_percent: 2, // Zippa-ს საკომისიო COD-ზე, %
} as const;

export type SettingKey = keyof typeof DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const v = row?.value;
  return typeof v === "number" ? v : DEFAULTS[key];
}

export async function setSetting(key: SettingKey, value: number) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function allSettings() {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingKey, number>;
  for (const k of Object.keys(DEFAULTS) as SettingKey[]) {
    const v = map.get(k);
    out[k] = typeof v === "number" ? v : DEFAULTS[k];
  }
  return out;
}
