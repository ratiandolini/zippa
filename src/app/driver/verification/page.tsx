"use client";

import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, jsonFetcher, HttpError } from "@/lib/fetcher";

interface Verification {
  transportType: "FOOT" | "BICYCLE" | "MOTORCYCLE" | "CAR" | "VAN";
  status: "NOT_SUBMITTED" | "PENDING" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" | "SUSPENDED";
  personalIdLast4: string | null;
  rejectionReason: string | null;
  changesRequestedMessage: string | null;
  documents: { id: string; type: string; status: string; uploadedAt: string }[];
}

const TRANSPORT_LABEL: Record<string, string> = {
  FOOT: "ფეხით",
  BICYCLE: "ველოსიპედი",
  MOTORCYCLE: "მოტოციკლი",
  CAR: "მანქანა",
  VAN: "ფურგონი",
};
const STATUS_LABEL: Record<string, string> = {
  NOT_SUBMITTED: "არ არის გაგზავნილი",
  PENDING: "განხილვაშია",
  CHANGES_REQUESTED: "საჭიროა შესწორება",
  APPROVED: "დამტკიცებული",
  REJECTED: "უარყოფილი",
  SUSPENDED: "შეჩერებული",
};
const NEEDS_LICENSE = ["MOTORCYCLE", "CAR", "VAN"];

const DOC_TYPES: { type: string; label: string; requiredIf?: (t: string) => boolean }[] = [
  { type: "ID_FRONT", label: "პირადობა — წინა მხარე" },
  { type: "ID_BACK", label: "პირადობა — უკანა მხარე" },
  { type: "DRIVER_LICENSE_FRONT", label: "მართვის მოწმობა — წინა მხარე", requiredIf: (t) => NEEDS_LICENSE.includes(t) },
  { type: "DRIVER_LICENSE_BACK", label: "მართვის მოწმობა — უკანა მხარე", requiredIf: (t) => NEEDS_LICENSE.includes(t) },
];

export default function DriverVerificationPage() {
  const { data, mutate } = useSWR<{ verification: Verification | null }>(
    "/api/driver/verification",
    jsonFetcher,
  );
  const v = data?.verification;
  const [transportType, setTransportType] = useState<string>(v?.transportType ?? "FOOT");
  const [personalIdLast4, setPersonalIdLast4] = useState(v?.personalIdLast4 ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const uploadedTypes = new Set((v?.documents ?? []).map((d) => d.type));

  async function submit() {
    setError("");
    setBusy(true);
    try {
      await api("/api/driver/verification", "POST", { transportType, personalIdLast4: personalIdLast4 || undefined });
      await mutate();
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  async function upload(type: string, file: File) {
    setError("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("file", file);
      const res = await fetch("/api/driver/verification/documents", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "ატვირთვის შეცდომა");
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="ვერიფიკაცია" description="დოკუმენტების გადამოწმება — შეკვეთების მისაღებად სავალდებულო" />

      {v && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <p className="font-medium">სტატუსი: <span className="text-accent">{STATUS_LABEL[v.status]}</span></p>
            {v.status === "CHANGES_REQUESTED" && v.changesRequestedMessage && (
              <p className="mt-1 text-sm text-muted-foreground">შენიშვნა: {v.changesRequestedMessage}</p>
            )}
            {v.status === "REJECTED" && v.rejectionReason && (
              <p className="mt-1 text-sm text-destructive">მიზეზი: {v.rejectionReason}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader><CardTitle>ტრანსპორტის ტიპი და პირადი მონაცემები</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>ტრანსპორტი</Label>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={transportType}
              onChange={(e) => setTransportType(e.target.value)}
            >
              {Object.entries(TRANSPORT_LABEL).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>პირადობის ბოლო 4 ციფრი (არჩევითი)</Label>
            <Input
              maxLength={4}
              value={personalIdLast4}
              onChange={(e) => setPersonalIdLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy} onClick={submit}>შენახვა / გაგზავნა</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>დოკუმენტები</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {DOC_TYPES.filter((d) => !d.requiredIf || d.requiredIf(transportType)).map((d) => (
            <div key={d.type} className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">{d.label}</p>
                <p className="text-xs text-muted-foreground">
                  {uploadedTypes.has(d.type) ? "ატვირთულია ✓" : "ატვირთეთ PDF, JPG ან PNG (მაქს. 5MB)"}
                </p>
              </div>
              <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
                ატვირთვა
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(d.type, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
