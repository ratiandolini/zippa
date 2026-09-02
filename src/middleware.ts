import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/jwt";

const ROLE_HOME: Record<string, string> = {
  CUSTOMER: "/app",
  DRIVER: "/driver",
  DISPATCHER: "/dispatch",
};

const PROTECTED = [
  { prefix: "/app", roles: ["CUSTOMER"] },
  { prefix: "/driver", roles: ["DRIVER"] },
  { prefix: "/dispatch", roles: ["DISPATCHER"] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // დროებითი: ვიზუალის გადახედვის რეჟიმი (ავტორიზაციის ჩართვამდე)
  if (process.env.NEXT_PUBLIC_DEV_PREVIEW === "1") return NextResponse.next();

  const cookieName = process.env.AUTH_COOKIE_NAME || "skr_session";
  const token = req.cookies.get(cookieName)?.value;
  const session = token ? await verifySession(token) : null;

  // ავტორიზაცია საჭიროა ნებისმიერი როლისთვის
  if (pathname.startsWith("/settings") && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const rule = PROTECTED.find((r) => pathname.startsWith(r.prefix));

  if (rule) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (!rule.roles.includes(session.role)) {
      const url = req.nextUrl.clone();
      url.pathname = ROLE_HOME[session.role] ?? "/";
      return NextResponse.redirect(url);
    }
  }

  // უკვე ავტორიზებული — login/register-იდან გადავიყვანოთ პანელში
  if ((pathname === "/login" || pathname === "/register") && session) {
    const url = req.nextUrl.clone();
    url.pathname = ROLE_HOME[session.role] ?? "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/app/:path*",
    "/driver/:path*",
    "/dispatch/:path*",
    "/settings/:path*",
    "/login",
    "/register",
  ],
};
