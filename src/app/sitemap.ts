import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const now = new Date();
  const routes = ["", "/faq", "/terms", "/privacy", "/login", "/register"];
  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
