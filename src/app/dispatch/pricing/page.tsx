"use client";

import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import useSWR from "swr";
import { usePricingRules, type PricingRule, type WeightBracket } from "@/lib/hooks";
import { api, jsonFetcher } from "@/lib/fetcher";
import { GEL, DELIVERY_ZONE_LABEL } from "@/lib/domain";

export default function PricingPage() {
  const { rules, isLoading, mutate } = usePricingRules();

  return (
    <>
      <PageHeader
        title="ტარიფები"
        description="ფასი წონის მიხედვით, ზონებით. ზონა განისაზღვრება მიტანის მისამართით."
      />
      <CodCommissionCard />
      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
      <div className="space-y-4">
        {rules.map((r) => (
          <RuleCard key={r.id} rule={r} onSaved={mutate} />
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        თბილისში კურიერი თითო მიტანაზე იღებს წონა-ცხრილით (მანძილი არ ითვლება). ეს არის მთელი
        ანაზღაურება ამ მიტანისთვის — ცალკე ხელფასი არ ერიცხება. 20 კგ-ზე მეტი და რთული შემთხვევები
        ავტომატურად არ მუშავდება — დისპეჩერი ხელით ადასტურებს ფასს.
      </p>
    </>
  );
}

function CodCommissionCard() {
  const { data, mutate } = useSWR<{ settings: { cod_commission_percent: number } }>(
    "/api/dispatch/settings",
    jsonFetcher,
  );
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const pct = data?.settings.cod_commission_percent ?? 0;

  async function save() {
    setBusy(true);
    try {
      await api("/api/dispatch/settings", "PATCH", { cod_commission_percent: Number(val) });
      setEditing(false);
      mutate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="font-medium">საკომისიო თანხის აღებაზე</div>
          <p className="text-sm text-muted-foreground">
            როცა კურიერი მიმღებისგან იღებს ამანათის ფასს და გამგზავნს ვურიცხავთ — ამ თანხის რამდენ %-ს ვიტოვებთ.
          </p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.5"
              className="h-9 w-24"
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
            <span className="text-sm">%</span>
            <Button size="sm" disabled={busy} onClick={save}>
              {busy ? "…" : "შენახვა"}
            </Button>
          </div>
        ) : (
          <button
            className="text-sm font-medium text-accent hover:underline"
            onClick={() => {
              setVal(String(pct));
              setEditing(true);
            }}
          >
            {pct}% · შეცვლა
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function RuleCard({ rule, onSaved }: { rule: PricingRule; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [brackets, setBrackets] = useState<WeightBracket[]>(rule.weightBrackets);
  const [dBrackets, setDBrackets] = useState<{ maxKg: number; payout: number }[] | null>(
    rule.driverWeightBrackets,
  );
  const [partnerCost, setPartnerCost] = useState(String(rule.partnerCost));
  const [codFee, setCodFee] = useState(String(rule.codFee));
  const [dBase, setDBase] = useState(String(rule.driverBaseFee));
  const [dPerKm, setDPerKm] = useState(String(rule.driverPerKm));
  const [dFreeKm, setDFreeKm] = useState(String(rule.driverFreeKm));
  const [cutoff, setCutoff] = useState(rule.sameDayCutoffHour == null ? "" : String(rule.sameDayCutoffHour));
  const [days, setDays] = useState(String(rule.deliveryDays));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setBrackets(rule.weightBrackets);
    setDBrackets(rule.driverWeightBrackets);
    setPartnerCost(String(rule.partnerCost));
    setCodFee(String(rule.codFee));
    setDBase(String(rule.driverBaseFee));
    setDPerKm(String(rule.driverPerKm));
    setDFreeKm(String(rule.driverFreeKm));
    setCutoff(rule.sameDayCutoffHour == null ? "" : String(rule.sameDayCutoffHour));
    setDays(String(rule.deliveryDays));
    setEditing(false);
    setErr(null);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/pricing/rules/${rule.id}`, "PATCH", {
        weightBrackets: brackets.map((b) => ({ maxKg: Number(b.maxKg), price: Number(b.price) })),
        driverWeightBrackets: dBrackets
          ? dBrackets.map((b) => ({ maxKg: Number(b.maxKg), payout: Number(b.payout) }))
          : null,
        partnerCost: Number(partnerCost),
        codFee: Number(codFee),
        driverBaseFee: Number(dBase),
        driverPerKm: Number(dPerKm),
        driverFreeKm: Number(dFreeKm),
        sameDayCutoffHour: cutoff === "" ? null : Number(cutoff),
        deliveryDays: Number(days),
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  const setBracket = (i: number, key: "maxKg" | "price", v: string) =>
    setBrackets((bs) => bs.map((b, j) => (j === i ? { ...b, [key]: Number(v) } : b)));

  const setDPayout = (i: number, v: string) =>
    setDBrackets((bs) =>
      (bs ?? []).map((b, j) => (j === i ? { ...b, payout: Number(v) } : b)),
    );

  const enableDriverBrackets = () =>
    setDBrackets(brackets.map((b) => ({ maxKg: b.maxKg, payout: Math.round(b.price * 0.5 * 2) / 2 })));

  const dPayoutOf = (i: number) => {
    const src = dBrackets ?? rule.driverWeightBrackets;
    return src?.[i]?.payout ?? null;
  };

  const rangeLabel = (i: number) => {
    const lo = i === 0 ? 0 : brackets[i - 1].maxKg;
    return `${lo}–${brackets[i].maxKg} კგ`;
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>{DELIVERY_ZONE_LABEL[rule.zone]}</CardTitle>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge tone={rule.isActive ? "green" : "red"}>{rule.isActive ? "აქტიური" : "გამორთული"}</Badge>
            {rule.zone === "TBILISI" && rule.sameDayCutoffHour != null && (
              <Badge tone="accent">{rule.sameDayCutoffHour}:00-მდე → იმ დღესვე</Badge>
            )}
            {rule.deliveryDays > 0 && <Badge tone="neutral">+{rule.deliveryDays} დღე</Badge>}
          </div>
        </div>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            რედაქტირება
          </Button>
        )}
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">წონა</th>
                <th className="py-2 pr-4 font-medium">კლიენტი იხდის</th>
                {(dBrackets ?? rule.driverWeightBrackets) && (
                  <th className="py-2 pr-4 font-medium">კურიერს ერიცხება</th>
                )}
                {editing && <th className="py-2 font-medium">ზედა ზღვარი (კგ)</th>}
              </tr>
            </thead>
            <tbody>
              {brackets.map((b, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-muted-foreground">{rangeLabel(i)}</td>
                  <td className="py-2 pr-4">
                    {editing ? (
                      <Input
                        type="number"
                        step="0.5"
                        className="h-8 w-24"
                        value={String(b.price)}
                        onChange={(e) => setBracket(i, "price", e.target.value)}
                      />
                    ) : (
                      <span className="font-medium tabular-nums">{GEL(b.price)}</span>
                    )}
                  </td>
                  {(dBrackets ?? rule.driverWeightBrackets) && (
                    <td className="py-2 pr-4">
                      {editing && dBrackets ? (
                        <Input
                          type="number"
                          step="0.5"
                          className="h-8 w-24"
                          value={String(dPayoutOf(i) ?? 0)}
                          onChange={(e) => setDPayout(i, e.target.value)}
                        />
                      ) : (
                        <span className="tabular-nums text-muted-foreground">
                          {dPayoutOf(i) == null ? "—" : GEL(dPayoutOf(i)!)}
                        </span>
                      )}
                    </td>
                  )}
                  {editing && (
                    <td className="py-2">
                      <Input
                        type="number"
                        className="h-8 w-24"
                        value={String(b.maxKg)}
                        onChange={(e) => setBracket(i, "maxKg", e.target.value)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="ნაღდის საკომისიო ₾" value={codFee} onChange={setCodFee} edit={editing} display={GEL(rule.codFee)} />
          <Field label="კურიერი — ბაზისი ₾" value={dBase} onChange={setDBase} edit={editing} display={GEL(rule.driverBaseFee)} />
          <Field label="კურიერი — ₾/კმ" value={dPerKm} onChange={setDPerKm} edit={editing} display={GEL(rule.driverPerKm)} />
          <Field label="უფასო კმ (ბაზისში)" value={dFreeKm} onChange={setDFreeKm} edit={editing} display={`${rule.driverFreeKm} კმ`} />
          {rule.zone !== "TBILISI" && (
            <Field label="პარტნიორის ხარჯი ₾" value={partnerCost} onChange={setPartnerCost} edit={editing} display={GEL(rule.partnerCost)} />
          )}
          {rule.zone === "TBILISI" && (
            <Field label="იმ-დღეს cut-off (საათი)" value={cutoff} onChange={setCutoff} edit={editing} display={rule.sameDayCutoffHour == null ? "—" : `${rule.sameDayCutoffHour}:00`} />
          )}
          <Field label="მინ. დღეები" value={days} onChange={setDays} edit={editing} display={String(rule.deliveryDays)} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {(dBrackets ?? rule.driverWeightBrackets)
            ? "კურიერს ერიცხება წონა-ცხრილით (მანძილი არ ითვლება). ბაზისი+კმ გამოიყენება მხოლოდ თუ წონა-ცხრილი გამორთულია."
            : "კურიერი მიტანაზე იღებს: ბაზისი + (მანძილი − უფასო კმ) × ₾/კმ"}
        </p>

        {editing && (
          <div className="mt-3">
            {dBrackets ? (
              <Button size="sm" variant="ghost" onClick={() => setDBrackets(null)}>
                წონით ანაზღაურების გამორთვა
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={enableDriverBrackets}>
                წონით ანაზღაურების ჩართვა
              </Button>
            )}
          </div>
        )}

        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

        {editing && (
          <div className="mt-4 flex gap-2">
            <Button size="sm" disabled={busy} onClick={save}>
              {busy ? "ინახება…" : "შენახვა"}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>
              გაუქმება
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  edit,
  display,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  edit: boolean;
  display: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {edit ? (
        <Input type="number" step="0.5" className="h-8" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="text-sm font-medium tabular-nums">{display}</div>
      )}
    </div>
  );
}
