import { prisma } from "@/lib/db";

/** მომხმარებლის პოვნა ელფოსტით ან ტელეფონით (ლოგინის/აღდგენის ერთიანი ლოგიკა) */
export function findUserByEmailOrPhone(raw: string) {
  const v = raw.trim();
  if (v.includes("@")) return prisma.user.findUnique({ where: { email: v.toLowerCase() } });
  const phone = `+995${v.replace(/\D/g, "").slice(-9)}`;
  return prisma.user.findUnique({ where: { phone } });
}
