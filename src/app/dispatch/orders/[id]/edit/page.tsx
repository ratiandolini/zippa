"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AddressField, type AddressValue } from "@/components/address-field";
import { useOrder } from "@/lib/hooks";
import { api } from "@/lib/fetcher";
import { PAYMENT_METHOD_LABEL } from "@/lib/domain";
import type { OrderDTO } from "@/lib/serialize";

const EDITABLE = ["PENDING", "ASSIGNED", "ACCEPTED", "EN_ROUTE_PICKUP"];

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { order, isLoading } = useOrder(id, 0);

  return (
    <>
      <PageHeader title="შეკვეთის რედაქტირება" description="მისამართის ან მონაცემების შესწორება" />
      {isLoading && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
      {!isLoading && !order && <p className="text-sm text-destructive">შეკვეთა ვერ მოიძებნა</p>}
      {order && !EDITABLE.includes(order.status) && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            ამ სტატუსში ({order.status}) შეკვეთის რედაქტირება აღარ შეიძლება.{" "}
            <Link href="/dispatch/orders" className="text-accent hover:underline">
              დაფაზე დაბრუნება
            </Link>
          </CardContent>
        </Card>
      )}
      {order && EDITABLE.includes(order.status) && (
        <EditForm order={order} onDone={() => router.push("/dispatch/orders")} />
      )}
    </>
  );
}

function EditForm({ order, onDone }: { order: OrderDTO; onDone: () => void }) {
  const [senderName, setSenderName] = useState(order.sender.name);
  const [senderPhone, setSenderPhone] = useState(order.sender.phone);
  const [recipientName, setRecipientName] = useState(order.recipient.name);
  const [recipientPhone, setRecipientPhone] = useState(order.recipient.phone);
  const [pickup, setPickup] = useState<AddressValue>({
    address: order.pickup.address,
    lat: order.pickup.lat,
    lng: order.pickup.lng,
  });
  const [delivery, setDelivery] = useState<AddressValue>({
    address: order.delivery.address,
    lat: order.delivery.lat,
    lng: order.delivery.lng,
  });
  const [weight, setWeight] = useState(String(order.weightKg));
  const [description, setDescription] = useState(order.description ?? "");
  const [parcelValue, setParcelValue] = useState(
    order.parcelValue == null ? "" : String(order.parcelValue),
  );
  const [collectAmount, setCollectAmount] = useState(
    order.collectAmount ? String(order.collectAmount) : "",
  );
  const payment = order.paymentMethod;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const weightNum = parseFloat(weight);
  const addressesReady = pickup.lat != null && delivery.lat != null;

  useEffect(() => {
    const changed =
      pickup.lat !== order.pickup.lat ||
      delivery.lat !== order.delivery.lat ||
      weightNum !== order.weightKg ||
      payment !== order.paymentMethod ||
      (collectAmount.trim() ? parseFloat(collectAmount) : 0) !== order.collectAmount;
    setWarn(changed ? "მისამართის, წონის, გადახდის ან ასაღები თანხის შეცვლა ფასსა და ვადას თავიდან გამოთვლის." : null);
  }, [pickup.lat, delivery.lat, weightNum, payment, collectAmount, order]);

  async function save() {
    setError(null);
    if (!addressesReady) {
      setError("აირჩიე ორივე მისამართი სიიდან");
      return;
    }
    if (!(weightNum > 0)) {
      setError("წონა არასწორია");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/orders/${order.id}`, "PATCH", {
        sender: { name: senderName, phone: senderPhone },
        recipient: { name: recipientName, phone: recipientPhone },
        pickup: { address: pickup.address, lat: pickup.lat, lng: pickup.lng },
        delivery: { address: delivery.address, lat: delivery.lat, lng: delivery.lng },
        weightKg: weightNum,
        description: description.trim() || null,
        parcelValue: parcelValue.trim() ? parseFloat(parcelValue) : null,
        collectAmount: collectAmount.trim() ? parseFloat(collectAmount) : 0,
        paymentMethod: payment,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "შეცდომა");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>საიდან (აღება)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <AddressField label="მისამართი" value={pickup} onChange={setPickup} />
          </div>
          <Field label="გამგზავნი" value={senderName} onChange={setSenderName} />
          <Field label="ტელეფონი" value={senderPhone} onChange={setSenderPhone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>სად (მიტანა)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <AddressField label="მისამართი" value={delivery} onChange={setDelivery} />
          </div>
          <Field label="მიმღები" value={recipientName} onChange={setRecipientName} />
          <Field label="ტელეფონი" value={recipientPhone} onChange={setRecipientPhone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ამანათი და გადახდა</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="წონა, კგ (მაგ. 0.5)" value={weight} onChange={setWeight} type="number" />
          <Field label="ნივთის ღირებულება, ₾ (დაზღვევა)" value={parcelValue} onChange={setParcelValue} type="number" />
          <Field label="მიმღებისგან ასაღები, ₾ (COD)" value={collectAmount} onChange={setCollectAmount} type="number" />
          <div className="sm:col-span-2">
            <Field label="აღწერა" value={description} onChange={setDescription} />
          </div>
          <div className="sm:col-span-2 text-sm text-muted-foreground">
            გადახდა: {PAYMENT_METHOD_LABEL[payment]}
          </div>
        </CardContent>
      </Card>

      {warn && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{warn}</p>
      )}
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      <div className="flex gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "ინახება…" : "შენახვა"}
        </Button>
        <Link href="/dispatch/orders" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          გაუქმება
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
