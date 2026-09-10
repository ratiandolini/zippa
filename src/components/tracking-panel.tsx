"use client";

import { OrderStatusBadge } from "@/components/order-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ORDER_STATUS_LABEL, DELIVERY_KIND_LABEL, fmtDateTime } from "@/lib/domain";
import type { TrackingDTO } from "@/lib/hooks";

// საჯარო ხედი — მხოლოდ სტატუსი და ზოგადი ინფო. მისამართი/კურიერი/რუკა აქ არ ჩანს;
// სრული დეტალები მხოლოდ ავტორიზებულ მფლობელს უჩანს /app-ში.
export function TrackingPanel({ t }: { t: TrackingDTO }) {
  const eta = t.deliveredAt ?? t.estimatedDeliveryAt;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-sm text-muted-foreground">{t.trackingNumber}</div>
          <h1 className="text-xl font-semibold">შეკვეთის სტატუსი</h1>
        </div>
        <OrderStatusBadge status={t.status} />
      </div>

      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">მიმართულება</span>
            <span>{DELIVERY_KIND_LABEL[t.kind]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">ზონა</span>
            <span>{t.area}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">შეიქმნა</span>
            <span>{fmtDateTime(t.createdAt)}</span>
          </div>
          {eta && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t.deliveredAt ? "ჩაბარდა" : "სავარაუდო მიტანა"}
              </span>
              <span>{fmtDateTime(eta)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>მოძრაობა</CardTitle>
        </CardHeader>
        <CardContent>
          {t.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">ჯერ განახლება არ არის.</p>
          ) : (
            <ol className="space-y-4">
              {t.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        i === t.steps.length - 1 ? "bg-accent" : "bg-border"
                      }`}
                    />
                    {i < t.steps.length - 1 && <span className="w-px flex-1 bg-border" />}
                  </div>
                  <div className="pb-1">
                    <div className="text-sm font-medium">{ORDER_STATUS_LABEL[s.status]}</div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(s.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        სრული დეტალები — შეკვეთის ავტორთან, ანგარიშში შესვლის შემდეგ.
      </p>
    </div>
  );
}
