"use client";

import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { usePricingRules, useCities, type PricingRule } from "@/lib/hooks";
import { api } from "@/lib/fetcher";
import { GEL, DELIVERY_KIND_LABEL } from "@/lib/domain";

type Draft = Omit<PricingRule, "id" | "cityName">;

const blank: Draft = {
  name: "",
  kind: "INTRA_CITY",
  cityId: null,
  isActive: true,
  priority: 1,
  basePrice: 5,
  pricePerKm: 1,
  pricePerKg: 0.5,
  freeWeightKg: 5,
  minPrice: 5,
  codFee: 1,
  driverPayoutPercent: 80,
};

export default function PricingPage() {
  const { rules, isLoading, mutate } = usePricingRules();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="ტარიფები"
        description="ფასის წესები — რომელი გამოიყენება, დამოკიდებულია ქალაქზე, ტიპსა და priority-ზე"
        action={
          <Button size="sm" onClick={() => setEditing("new")}>
            წესის დამატება
          </Button>
        }
      />

      {editing === "new" && (
        <RuleForm
          initial={blank}
          onCancel={() => setEditing(null)}
          onSave={async (d) => {
            await api("/api/pricing/rules", "POST", d);
            setEditing(null);
            mutate();
          }}
        />
      )}

      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rules.map((r) =>
          editing === r.id ? (
            <div key={r.id} className="md:col-span-2 xl:col-span-3">
              <RuleForm
                initial={r}
                onCancel={() => setEditing(null)}
                onSave={async (d) => {
                  await api(`/api/pricing/rules/${r.id}`, "PATCH", d);
                  setEditing(null);
                  mutate();
                }}
                onDelete={async () => {
                  await api(`/api/pricing/rules/${r.id}`, "DELETE");
                  setEditing(null);
                  mutate();
                }}
              />
            </div>
          ) : (
            <Card key={r.id}>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>{r.name}</CardTitle>
                  <div className="mt-1 flex gap-1">
                    <Badge tone="neutral">{DELIVERY_KIND_LABEL[r.kind]}</Badge>
                    {r.cityName && <Badge tone="neutral">{r.cityName}</Badge>}
                    <Badge tone={r.isActive ? "green" : "red"}>
                      {r.isActive ? "აქტიური" : "გამორთული"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Line label="საბაზისო" value={GEL(r.basePrice)} />
                <Line label="1 კმ" value={GEL(r.pricePerKm)} />
                <Line label={`1 კგ (>${r.freeWeightKg}კგ)`} value={GEL(r.pricePerKg)} />
                <Line label="მინ. ფასი" value={GEL(r.minPrice)} />
                <Line label="ნაღდის საკომისიო" value={GEL(r.codFee)} />
                <Line label="კურიერის წილი" value={`${r.driverPayoutPercent}%`} />
                <Line label="priority" value={String(r.priority)} />
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => setEditing(r.id)}
                >
                  რედაქტირება
                </Button>
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function RuleForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Draft;
  onSave: (d: Draft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const { cities } = useCities();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const numField = (k: keyof Draft, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        step="0.1"
        value={String(d[k] as number)}
        onChange={(e) => set(k, Number(e.target.value) as never)}
      />
    </div>
  );

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await onSave(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{initial.name ? "წესის რედაქტირება" : "ახალი წესი"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>დასახელება</Label>
            <Input value={d.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>ტიპი</Label>
            <Select value={d.kind} onChange={(e) => set("kind", e.target.value as Draft["kind"])}>
              <option value="INTRA_CITY">ქალაქში</option>
              <option value="INTER_CITY">ქალაქებს შორის</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ქალაქი</Label>
            <Select
              value={d.cityId ?? ""}
              onChange={(e) => set("cityId", e.target.value || null)}
              disabled={d.kind === "INTER_CITY"}
            >
              <option value="">ყველა (ზოგადი)</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          {numField("basePrice", "საბაზისო ₾")}
          {numField("pricePerKm", "1 კმ ₾")}
          {numField("pricePerKg", "1 კგ ₾")}
          {numField("freeWeightKg", "უფასო წონა კგ")}
          {numField("minPrice", "მინ. ფასი ₾")}
          {numField("codFee", "ნაღდის საკომისიო ₾")}
          {numField("driverPayoutPercent", "კურიერის წილი %")}
          {numField("priority", "priority")}
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              აქტიური
            </label>
          </div>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={save}>
            {busy ? "ინახება…" : "შენახვა"}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            გაუქმება
          </Button>
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={onDelete}
            >
              წაშლა
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
