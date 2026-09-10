"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * მობილურის sticky CTA — ჩნდება მხოლოდ მას შემდეგ, რაც Hero-ს CTA
 * (id="hero-cta") scroll-ის შედეგად viewport-ს გასცდა. საწყის ეკრანზე
 * ორმაგი „ამანათის გაგზავნა“ არ ჩანს. Desktop-ზე საერთოდ არ ჩანს (sm:hidden).
 */
export function MobileStickyCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    if (!hero) {
      // fallback — თუ Hero CTA ვერ მოიძებნა, scroll-ის მიხედვით
      const onScroll = () => setShow(window.scrollY > 320);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
    const io = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* footer-ის უკან რომ არ დაიმალოს, როცა CTA ჩანს */}
      <div className="h-16 sm:hidden" aria-hidden />
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-opacity duration-200 sm:hidden ${
          show ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!show}
      >
        <Link
          href="/register?role=CUSTOMER"
          tabIndex={show ? 0 : -1}
          className={buttonVariants({ size: "lg", className: "w-full" })}
        >
          ამანათის გაგზავნა <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </>
  );
}
