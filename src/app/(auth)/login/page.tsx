"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ROLE_HOME } from "@/lib/domain";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailOrPhone: form.get("emailOrPhone"),
          password: form.get("password"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შესვლა ვერ მოხერხდა");
      const next = params.get("next") || ROLE_HOME[data.user.role as keyof typeof ROLE_HOME];
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">შესვლა</CardTitle>
        <p className="text-sm text-muted-foreground">შეიყვანე მონაცემები ანგარიშზე შესასვლელად</p>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="emailOrPhone">ელფოსტა ან ტელეფონი</Label>
            <Input id="emailOrPhone" name="emailOrPhone" type="text" placeholder="you@example.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">პაროლი</Label>
            {/* პაროლის აღდგენა კოდით SMS-ს საჭიროებს — ჩაირთვება SMS-პროვაიდერის კონფიგურაციისას */}
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "მუშავდება…" : "შესვლა"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          არ გაქვს ანგარიში?{" "}
          <Link href="/register" className="font-medium text-accent hover:underline">
            რეგისტრაცია
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
