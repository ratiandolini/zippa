"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AddressField, type AddressValue } from "@/components/address-field";
import { GEL, PAYMENT_METHOD_LABEL, DELIVERY_ZONE_LABEL, fmtDate } from "@/lib/domain";
import { api } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import type { OrderDTO } from "@/lib/serialize";

const empty: AddressValue = { address: "", lat: null, lng: null };

interface Quote {
  zone: "TBILISI" | "REGIONAL_CITY" | "TOWN_VILLAGE";
  distanceKm: number;
  deliveryPrice: number;
  codFee: number;
  totalPrice: number;
  codAmount: number;
  overWeight: boolean;
  estimatedDeliveryAt: string;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [pickup, setPickup] = useState<AddressValue>(empty);
  const [delivery, setDelivery] = useState<AddressValue>(empty);
  const [weight, setWeight] = useState("");
  const [description, setDescription] = useState("");
  const payment = "CASH" as const;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const weightNum = parseFloat(weight);
  const ready =
    pickup.lat != null && delivery.lat != null && weightNum > 0 && !Number.isNaN(weightNum);

  const debounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!ready) {
      setQuote(null);
      return;
    }
    clearTimeout(debounce.current);
    setQuoting(true);
    debounce.current = setTimeout(async () => {
      try {
        const q = await api<Quote>("/api/pricing/quote", "POST", {
          pickup: { lat: pickup.lat, lng: pickup.lng },
          delivery: { lat: delivery.lat, lng: delivery.lng },
          weightKg: weightNum,
          paymentMethod: payment,
        });
        setQuote(q);
      } catch {
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 350);
  }, [ready, pickup.lat, pickup.lng, delivery.lat, delivery.lng, weightNum, payment]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const { order } = await api<{ order: OrderDTO }>("/api/orders", "POST", {
        sender: { name: senderName, phone: senderPhone },
        recipient: { name: recipientName, phone: recipientPhone },
        pickup: { address: pickup.address, lat: pickup.lat, lng: pickup.lng, note: undefined },
        delivery: {
          address: delivery.address,
          lat: delivery.lat,
          lng: delivery.lng,
          note: undefined,
        },
        weightKg: weightNum,
        description: description || undefined,
        paymentMethod: payment,
      });
      router.push(`/app/track?id=${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "შეცდომა");
      setSubmitting(false);
    }
  }

  const canSubmit =
    ready &&
    !!quote &&
    senderName.trim() &&
    senderPhone.trim() &&
    recipientName.trim() &&
    recipientPhone.trim() &&
    !submitting;

  return (
    <>
      <PageHeader title="ახალი შეკვეთა" description="შეავსე მონაცემები ამანათის გასაგზავნად" />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>საიდან (აღება)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <AddressField
                  label="მისამართი"
                  value={pickup}
                  onChange={setPickup}
                  placeholder="ქალაქი, ქუჩა, ნომერი"
                />
              </div>
              <Text label="გამგზავნი" value={senderName} onChange={setSenderName} placeholder="სახელი გვარი" />
              <Text label="ტელეფონი" value={senderPhone} onChange={setSenderPhone} placeholder="5XX XX XX XX" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>სად (მიტანა)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <AddressField
                  label="მისამართი"
                  value={delivery}
                  onChange={setDelivery}
                  placeholder="ქალაქი, ქუჩა, ნომერი"
                />
              </div>
              <Text label="მიმღები" value={recipientName} onChange={setRecipientName} placeholder="სახელი გვარი" />
              <Text label="ტელეფონი" value={recipientPhone} onChange={setRecipientPhone} placeholder="5XX XX XX XX" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ამანათი</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Text
                label="წონა, კგ"
                value={weight}
                onChange={setWeight}
                placeholder="მაგ. 0.5 ან 2"
                type="number"
                step="0.1"
                hint="კილოგრამში. 500 გრამი = 0.5"
              />
              <Text label="აღწერა" value={description} onChange={setDescription} placeholder="მაგ. დოკუმენტები, ტანსაცმელი" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>გადახდა</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
                <div className="font-medium">{PAYMENT_METHOD_LABEL.CASH}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  მიტანის საფასური ნაღდით ბარდება კურიერს — გამგზავნისგან ან მიმღებისგან.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>ღირებულება</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!ready && (
                <p className="text-muted-foreground">
                  შეავსე ორივე მისამართი (სიიდან არჩევით) და წონა ფასის სანახავად.
                </p>
              )}
              {ready && quoting && <p className="text-muted-foreground">ვთვლი…</p>}
              {ready && !quoting && quote && (
                <>
                  <Row label={`ზონა: ${DELIVERY_ZONE_LABEL[quote.zone]}`} value={`${quote.distanceKm} კმ`} />
                  <Row label={`მიტანა (${weightNum} კგ)`} value={GEL(quote.deliveryPrice)} />
                  {quote.codFee > 0 && <Row label="ნაღდის საკომისიო" value={GEL(quote.codFee)} />}
                  <div className="my-2 border-t border-border" />
                  <Row label="სულ გადასახდელი" value={GEL(quote.totalPrice)} bold />
                  <div className="mt-1 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
                    მიტანა: {fmtDate(quote.estimatedDeliveryAt)}
                    {quote.zone === "TBILISI" &&
                      new Date(quote.estimatedDeliveryAt).toDateString() === new Date().toDateString() &&
                      " (დღეს)"}
                  </div>
                  {quote.overWeight && (
                    <p className="text-xs text-destructive">
                      წონა კალათებს სცდება — დაუკავშირდით დისპეჩერს ზუსტი ფასისთვის
                    </p>
                  )}
                  {payment === "CASH" && (
                    <p className="text-xs text-muted-foreground">
                      კურიერი ნაღდად აიღებს {GEL(quote.codAmount)}
                    </p>
                  )}
                </>
              )}
              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button className="mt-2 w-full" disabled={!canSubmit} onClick={submit}>
                {submitting ? "იქმნება…" : "შეკვეთის დადასტურება"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  type,
  hint,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between", bold && "font-semibold")}>
      <span className={cn(!bold && "text-muted-foreground")}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
