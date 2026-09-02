import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/driver/", "/dispatch/", "/settings/", "/api/"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
