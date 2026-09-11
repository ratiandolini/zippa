import {
  Home,
  Package,
  Plus,
  MapPin,
  LayoutGrid,
  Inbox,
  Wallet,
  Users,
  Map,
  Tag,
  BarChart3,
  UserCog,
  Banknote,
  Building2,
  ShieldCheck,
} from "lucide-react";
import type { Role } from "@prisma/client";
import type { NavItem } from "@/components/app-shell";
import { ROLE_LABEL } from "@/lib/domain";
import { PARTNER_ONBOARDING_ENABLED, DRIVER_VERIFICATION_ENABLED } from "@/lib/flags";

const c = "h-4 w-4";

export const ROLE_NAV: Record<Role, NavItem[]> = {
  CUSTOMER: [
    { href: "/app", label: "მთავარი", icon: <Home className={c} /> },
    { href: "/app/new", label: "ახალი შეკვეთა", icon: <Plus className={c} /> },
    { href: "/app/orders", label: "ჩემი შეკვეთები", icon: <Package className={c} /> },
    { href: "/app/track", label: "რუკაზე ნახვა", icon: <MapPin className={c} /> },
  ],
  DRIVER: [
    { href: "/driver", label: "დღეს", icon: <LayoutGrid className={c} /> },
    { href: "/driver/offers", label: "შემოთავაზებები", icon: <Inbox className={c} /> },
    { href: "/driver/orders", label: "ჩემი შეკვეთები", icon: <Package className={c} /> },
    { href: "/driver/earnings", label: "ფინანსები", icon: <Wallet className={c} /> },
    ...(DRIVER_VERIFICATION_ENABLED
      ? [{ href: "/driver/verification", label: "ვერიფიკაცია", icon: <ShieldCheck className={c} /> }]
      : []),
  ],
  DISPATCHER: [
    { href: "/dispatch", label: "მიმოხილვა", icon: <LayoutGrid className={c} /> },
    { href: "/dispatch/orders", label: "შეკვეთები", icon: <Package className={c} /> },
    { href: "/dispatch/drivers", label: "კურიერები", icon: <Users className={c} /> },
    { href: "/dispatch/payroll", label: "ანგარიშსწორება", icon: <Banknote className={c} /> },
    { href: "/dispatch/map", label: "რუკა", icon: <Map className={c} /> },
    { href: "/dispatch/pricing", label: "ტარიფები", icon: <Tag className={c} /> },
    { href: "/dispatch/analytics", label: "ანალიტიკა", icon: <BarChart3 className={c} /> },
    { href: "/dispatch/team", label: "გუნდი", icon: <UserCog className={c} /> },
    ...(PARTNER_ONBOARDING_ENABLED
      ? [{ href: "/dispatch/partners", label: "პარტნიორები", icon: <Building2 className={c} /> }]
      : []),
  ],
};

export { ROLE_LABEL };
