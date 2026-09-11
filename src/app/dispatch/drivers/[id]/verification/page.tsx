"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, jsonFetcher, HttpError } from "@/lib/fetcher";

interface VerificationDetail {
  transportType: string;
  status: string;
  personalIdLast4: string | null;
  rejectionReason: string | null;
  changesRequestedMessage: string | null;
  submittedAt: string | null;
  missingTypes: string[];
  documents: { id: string; type: string; mimeType: string; uploadedAt: string; viewUrl: string }[];
  driver: { name: string; email: string; phone: string };
}

const STATUS_LABEL: Record<string, string> = {
  NOT_SUBMITTED: "არ არის გაგზავნილი",
  PENDING: "განხილვაშია",
  CHANGES_REQUESTED: "საჭიროა შესწორება",
  APPROVED: "დამტკიცებული",
  REJECTED: "უარყოფილი",
  SUSPENDED: "შეჩერებული",
};
const DOC_LABEL: Record<string, string> = {
  ID_FRONT: "პირადობა (წინა)",
  ID_BACK: "პირადობა (უკანა)",
  DRIVER_LICENSE_FRONT: "მართვის მოწმობა (წინა)",
  DRIVER_LICENSE_BACK: "მართვის მოწმობა (უკანა)",
  VEHICLE_REGISTRATION: "სატრანსპორტო დაზღვევა/რეგისტრაცია",
  OTHER: "სხვა",
};

export default function DriverVerificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, mutate } = useSWR<{ verification: VerificationDetail | null }>(
    `/api/dispatch/drivers/${id}/verification`,
    jsonFetcher,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) return <p className="p-6 text-sm text-muted-foreground">იტვირთება…</p>;
  const v = data.verification;
  if (!v) return <p className="p-6 text-sm text-muted-foreground">კურიერს ვერიფიკაცია არ წარმოდგენილი.</p>;

  async function review(action: "APPROVE" | "CHANGES_REQUESTED" | "REJECT" | "SUSPEND") {
    setError("");
    setBusy(true);
    try {
      await api(`/api/dispatch/drivers/${id}/verification`, "POST", { action, message: message || undefined });
      await mutate();
      setMessage("");
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={v.driver.name} description="კურიერის ვერიფიკაცია" />
      <div className="mb-4">
        <Badge tone={v.status === "APPROVED" ? "green" : v.status === "REJECTED" || v.status === "SUSPENDED" ? "red" : "accent"}>
          {STATUS_LABEL[v.status]}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>პროფილი</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row l="ტრანსპორტი" v={v.transportType} />
            <Row l="ელფოსტა" v={v.driver.email} />
            <Row l="ტელეფონი" v={v.driver.phone} />
            <Row l="პირადობის ბოლო 4 ციფრი" v={v.personalIdLast4 ?? "—"} />
            <Row l="გაგზავნის თარიღი" v={v.submittedAt ? new Date(v.submittedAt).toLocaleString("ka-GE") : "—"} />
            {v.missingTypes.length > 0 && (
              <p className="text-sm text-destructive">აკლია: {v.missingTypes.map((t) => DOC_LABEL[t] ?? t).join(", ")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>დოკუმენტები</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {v.documents.length === 0 && <p className="text-sm text-muted-foreground">ჯერ არაფერია ატვირთული.</p>}
            {v.documents.map((d) => (
              <a
                key={d.id}
                href={d.viewUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-muted"
              >
                <span>{DOC_LABEL[d.type] ?? d.type}</span>
                <span className="text-accent">ნახვა →</span>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Review-ქმედება</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            rows={2}
            placeholder="კომენტარი"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => review("APPROVE")}>დამტკიცება</Button>
            <Button variant="outline" disabled={busy} onClick={() => review("CHANGES_REQUESTED")}>ცვლილების მოთხოვნა</Button>
            <Button variant="outline" disabled={busy} onClick={() => review("REJECT")}>უარყოფა</Button>
            <Button variant="outline" disabled={busy} onClick={() => review("SUSPEND")}>შეჩერება</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{l}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
