"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";

export default function ForgotPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/forgot", "POST", { emailOrPhone: id });
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/reset", "POST", { emailOrPhone: id, code, newPassword: pw });
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">პაროლის აღდგენა</CardTitle>
        <p className="text-sm text-muted-foreground">
          {step === 1
            ? "მიუთითე ტელეფონი ან ელფოსტა — გამოგიგზავნით კოდს SMS-ით"
            : "შეიყვანე მიღებული 6-ნიშნა კოდი და ახალი პაროლი"}
        </p>
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
            პაროლი შეიცვალა. გადამისამართება…
          </p>
        ) : step === 1 ? (
          <form className="space-y-4" onSubmit={request}>
            <div className="space-y-1.5">
              <Label htmlFor="id">ტელეფონი ან ელფოსტა</Label>
              <Input id="id" value={id} onChange={(e) => setId(e.target.value)} required />
            </div>
            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? "იგზავნება…" : "კოდის გამოგზავნა"}
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={reset}>
            <div className="space-y-1.5">
              <Label htmlFor="code">კოდი</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">ახალი პაროლი</Label>
              <Input
                id="pw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="მინიმუმ 8 სიმბოლო"
                required
              />
            </div>
            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? "მუშავდება…" : "პაროლის შეცვლა"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setStep(1)}
            >
              კოდი ვერ მიიღე? თავიდან
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-accent hover:underline">
            შესვლაზე დაბრუნება
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
