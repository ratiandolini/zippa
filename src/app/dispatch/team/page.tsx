"use client";

import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { jsonFetcher, api } from "@/lib/fetcher";
import { useDispatchers } from "@/lib/hooks";
import { fmtDate } from "@/lib/domain";

interface Me {
  user: { id: string };
}

export default function TeamPage() {
  const { dispatchers, isLoading, mutate } = useDispatchers();
  const { data: me } = useSWR<Me>("/api/auth/me", jsonFetcher);
  const myId = me?.user.id;
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(id: string, isActive: boolean) {
    setBusyId(id);
    try {
      await api(`/api/dispatchers/${id}`, "PATCH", { isActive: !isActive });
      mutate();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="დისპეჩერების გუნდი" description="დისპეჩერების დამატება და მართვა" />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-x-auto">
          {isLoading && <p className="p-5 text-sm text-muted-foreground">იტვირთება…</p>}
          {!isLoading && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">სახელი</th>
                  <th className="px-5 py-3 font-medium">კონტაქტი</th>
                  <th className="px-5 py-3 font-medium">დამატდა</th>
                  <th className="px-5 py-3 font-medium">სტატუსი</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {dispatchers.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium">
                      {d.name}
                      {d.id === myId && (
                        <span className="ml-2 text-xs text-muted-foreground">(თქვენ)</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {d.email}
                      <br />
                      {d.phone}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{fmtDate(d.createdAt)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={d.isActive ? "green" : "neutral"}>
                        {d.isActive ? "აქტიური" : "გათიშული"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {d.id !== myId && (
                        <button
                          onClick={() => toggle(d.id, d.isActive)}
                          disabled={busyId === d.id}
                          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {busyId === d.id ? "…" : d.isActive ? "გათიშვა" : "გააქტიურება"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <NewDispatcherForm onCreated={mutate} />
      </div>
    </>
  );
}

function NewDispatcherForm({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/dispatchers", "POST", {
        name: fd.get("name"),
        email: fd.get("email"),
        phone: fd.get("phone"),
        password: fd.get("password"),
      });
      setMsg({ ok: true, text: "დისპეჩერი დაემატა. პაროლი გადაეცი პირადად." });
      form.reset();
      onCreated();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "შეცდომა" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>ახალი დისპეჩერი</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="name">სახელი და გვარი</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">ელფოსტა</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">ტელეფონი</Label>
            <Input id="phone" name="phone" type="tel" placeholder="+995 5XX XX XX XX" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">დროებითი პაროლი</Label>
            <Input id="password" name="password" type="text" placeholder="მინიმუმ 8 სიმბოლო" required />
          </div>
          {msg && (
            <p className={msg.ok ? "text-sm text-accent" : "text-sm text-destructive"}>{msg.text}</p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "მუშავდება…" : "დამატება"}
          </Button>
          <p className="text-xs text-muted-foreground">
            ახალი დისპეჩერი პაროლს შეცვლის პირველივე შესვლისას პარამეტრებში.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
