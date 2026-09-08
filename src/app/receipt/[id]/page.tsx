"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useOrder } from "@/lib/hooks";
import { GEL, fmtDateTime, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/domain";
import { COMPANY } from "@/lib/company";
import { ArrowLeft, Printer } from "lucide-react";

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { order, isLoading } = useOrder(id, 0);

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">იტვირთება…</p>;
  if (!order) return <p className="p-6 text-sm text-destructive">შეკვეთა ვერ მოიძებნა</p>;

  const c = order.customer;
  const customerLine =
    c?.accountType === "COMPANY" && c.companyName
      ? `${c.companyName}${c.taxId ? ` · ს/კ ${c.taxId}` : ""}`
      : c?.name ?? "";

  const Row = ({ l, v }: { l: string; v: string }) => (
    <div className="flex justify-between gap-4 border-b border-dashed border-gray-300 py-1.5">
      <span className="text-gray-500">{l}</span>
      <span className="text-right font-medium tabular-nums">{v}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/app/track?id=${order.id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> უკან
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#157a5a] px-4 py-2 text-sm font-medium text-white"
        >
          <Printer className="h-4 w-4" /> ბეჭდვა / PDF
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-800 print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xl font-bold">{COMPANY.brand}</div>
            <div className="mt-1 text-xs text-gray-500">
              {COMPANY.name} · ს/კ {COMPANY.taxId}
              <br />
              {COMPANY.address} · {COMPANY.email}
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold">ქვითარი</div>
            <div className="font-mono text-xs text-gray-500">{order.trackingNumber}</div>
            <div className="text-xs text-gray-500">{fmtDateTime(order.createdAt)}</div>
          </div>
        </div>

        <div className="my-5 h-px bg-gray-200" />

        <div className="mb-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            შემკვეთი
          </div>
          <div>{customerLine}</div>
          {c && (
            <div className="text-xs text-gray-500">
              {c.phone} · {c.email}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              გამგზავნი
            </div>
            <div>{order.sender.name}</div>
            <div className="text-xs text-gray-500">{order.sender.phone}</div>
            <div className="mt-1 text-xs text-gray-600">{order.pickup.address}</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              მიმღები
            </div>
            <div>{order.recipient.name}</div>
            <div className="text-xs text-gray-500">{order.recipient.phone}</div>
            <div className="mt-1 text-xs text-gray-600">{order.delivery.address}</div>
          </div>
        </div>

        <div className="my-5 h-px bg-gray-200" />

        <Row l="სტატუსი" v={ORDER_STATUS_LABEL[order.status]} />
        <Row l="წონა" v={`${order.weightKg} კგ`} />
        {order.description && <Row l="აღწერა" v={order.description} />}
        <Row l="ნივთის ღირებულება" v={order.parcelValue != null ? GEL(order.parcelValue) : "—"} />
        <Row l="მანძილი" v={`${order.distanceKm} კმ`} />
        <Row l="მიტანის საფასური" v={GEL(order.price.delivery)} />
        {order.collectAmount > 0 && (
          <>
            <Row l="მიმღებისგან ასაღები (ნივთი)" v={GEL(order.collectAmount)} />
            <Row l="ჩვენი საკომისიო თანხის აღებაზე" v={`−${GEL(order.codCommission)}`} />
          </>
        )}
        <Row l="გადახდის მეთოდი" v={PAYMENT_METHOD_LABEL[order.paymentMethod]} />
        {order.cancelFee > 0 && <Row l="გაუქმების საფასური" v={GEL(order.cancelFee)} />}
        {order.returnFee > 0 && <Row l="დაბრუნების საფასური" v={GEL(order.returnFee)} />}

        <div className="mt-3 flex justify-between border-t-2 border-gray-800 pt-2 text-base font-bold">
          <span>სულ (მიტანა)</span>
          <span className="tabular-nums">{GEL(order.price.total)}</span>
        </div>
        {order.collectAmount > 0 && (
          <div className="mt-1 flex justify-between text-sm text-gray-600">
            <span>გამგზავნს ერგება (ნივთის თანხა − საკომისიო)</span>
            <span className="tabular-nums">{GEL(order.collectAmount - order.codCommission)}</span>
          </div>
        )}

        <div className="mt-6 text-xs text-gray-400">
          ეს ქვითარი გენერირებულია Zippa-ს სისტემით. მადლობა თანამშრომლობისთვის.
        </div>
      </div>
    </div>
  );
}
