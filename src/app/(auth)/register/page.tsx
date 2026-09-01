"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROLE_HOME } from "@/lib/domain";

const roles = [
  { key: "CUSTOMER", label: "მომხმარებელი", hint: "ამანათების გაგზავნა" },
  { key: "DRIVER", label: "კურიერი", hint: "შეკვეთების მიტანა" },
];

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState(params.get("role") === "DRIVER" ? "DRIVER" : "CUSTOMER");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!agreed) {
      setError("გასაგრძელებლად დაეთანხმეთ წესებსა და კონფიდენციალურობის პოლიტიკას");
      return;
    }
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          phone: form.get("phone"),
          email: form.get("email"),
          password: form.get("password"),
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || data.issues?.formErrors?.[0] || "რეგისტრაცია ვერ მოხერხდა",
        );
      }
      router.push(ROLE_HOME[data.user.role as keyof typeof ROLE_HOME]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">რეგისტრაცია</CardTitle>
        <p className="text-sm text-muted-foreground">შექმენი ანგარიში 1 წუთში</p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {roles.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                role === r.key ? "border-accent bg-accent/10" : "border-border hover:bg-muted",
              )}
            >
              <div className="font-medium">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.hint}</div>
            </button>
          ))}
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="name">სახელი და გვარი</Label>
            <Input id="name" name="name" placeholder="გიორგი მაისურაძე" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">ტელეფონი</Label>
            <Input id="phone" name="phone" type="tel" placeholder="+995 5XX XX XX XX" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">ელფოსტა</Label>
            <Input id="email" name="email" type="email" placeholder="you@example.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">პაროლი</Label>
            <Input id="password" name="password" type="password" placeholder="მინიმუმ 8 სიმბოლო" required />
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              ვეთანხმები{" "}
              <Link href="/terms" target="_blank" className="text-accent hover:underline">წესებსა და პირობებს</Link>{" "}
              და{" "}
              <Link href="/privacy" target="_blank" className="text-accent hover:underline">კონფიდენციალურობის პოლიტიკას</Link>
            </span>
          </label>
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          <Button className="w-full" type="submit" disabled={loading || !agreed}>
            {loading ? "მუშავდება…" : "ანგარიშის შექმნა"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          უკვე გაქვს ანგარიში?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            შესვლა
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
