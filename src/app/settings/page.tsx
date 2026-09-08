"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { jsonFetcher, api } from "@/lib/fetcher";
import { useDriverMe, useCities } from "@/lib/hooks";
import { VEHICLE_LABEL } from "@/lib/domain";
import type { Role, VehicleType } from "@prisma/client";

interface Me {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: Role;
    accountType: "INDIVIDUAL" | "COMPANY";
    companyName: string | null;
    taxId: string | null;
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const { data, mutate } = useSWR<Me>("/api/auth/me", jsonFetcher);
  const user = data?.user;

  return (
    <>
      <PageHeader title="პარამეტრები" />
      <div className="grid gap-6 lg:grid-cols-2">
        {user && <ProfileForm user={user} onSaved={() => { mutate(); router.refresh(); }} />}
        <PasswordForm />
        {user?.role === "DRIVER" && <VehicleForm />}
      </div>
    </>
  );
}

function Section({
  title,
  children,
  onSubmit,
  busy,
  msg,
}: {
  title: string;
  children: React.ReactNode;
  onSubmit: () => void;
  busy: boolean;
  msg: { ok: boolean; text: string } | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          {msg && (
            <p className={msg.ok ? "text-sm text-accent" : "text-sm text-destructive"}>{msg.text}</p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "ინახება…" : "შენახვა"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ProfileForm({ user, onSaved }: { user: Me["user"]; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [accountType, setAccountType] = useState(user.accountType);
  const [companyName, setCompanyName] = useState(user.companyName ?? "");
  const [taxId, setTaxId] = useState(user.taxId ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const canChooseType = user.role === "CUSTOMER";
  const isCompany = canChooseType && accountType === "COMPANY";

  async function save() {
    if (isCompany && (!companyName.trim() || !/^\d{9,11}$/.test(taxId.trim()))) {
      setMsg({ ok: false, text: "შეავსეთ კომპანიის დასახელება და ს/კ (9–11 ციფრი)" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/auth/me", "PATCH", {
        name,
        phone,
        ...(canChooseType
          ? {
              accountType,
              companyName: isCompany ? companyName : null,
              taxId: isCompany ? taxId : null,
            }
          : {}),
      });
      setMsg({ ok: true, text: "შენახულია" });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "შეცდომა" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="პროფილი" onSubmit={save} busy={busy} msg={msg}>
      {canChooseType && (
        <div className="space-y-1.5">
          <Label>ანგარიშის ტიპი</Label>
          <Select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as "INDIVIDUAL" | "COMPANY")}
          >
            <option value="INDIVIDUAL">ფიზიკური პირი</option>
            <option value="COMPANY">იურიდიული პირი</option>
          </Select>
        </div>
      )}
      {isCompany && (
        <>
          <div className="space-y-1.5">
            <Label>კომპანიის დასახელება</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>საიდენტიფიკაციო კოდი</Label>
            <Input value={taxId} inputMode="numeric" onChange={(e) => setTaxId(e.target.value)} />
          </div>
        </>
      )}
      <div className="space-y-1.5">
        <Label>{isCompany ? "საკონტაქტო პირი" : "სახელი და გვარი"}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>ტელეფონი</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>ელფოსტა</Label>
        <Input value={user.email} disabled />
      </div>
    </Section>
  );
}

function PasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/auth/password", "POST", { currentPassword: cur, newPassword: next });
      setMsg({ ok: true, text: "პაროლი შეიცვალა" });
      setCur("");
      setNext("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "შეცდომა" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="პაროლის შეცვლა" onSubmit={save} busy={busy} msg={msg}>
      <div className="space-y-1.5">
        <Label>მიმდინარე პაროლი</Label>
        <PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>ახალი პაროლი</Label>
        <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
    </Section>
  );
}

function VehicleForm() {
  const { driver, mutate } = useDriverMe(0);
  const { cities } = useCities();
  const [type, setType] = useState<VehicleType>("MOTORCYCLE");
  const [numberPlate, setNumberPlate] = useState("");
  const [cityId, setCityId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (driver) {
      setType(driver.vehicleType as VehicleType);
      setNumberPlate(driver.vehicleNumber ?? "");
      setCityId(driver.cityId ?? "");
    }
  }, [driver]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/driver/me", "PATCH", {
        vehicleType: type,
        vehicleNumber: numberPlate,
        cityId: cityId || null,
      });
      setMsg({ ok: true, text: "შენახულია" });
      mutate();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "შეცდომა" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="ტრანსპორტი და ქალაქი" onSubmit={save} busy={busy} msg={msg}>
      <div className="space-y-1.5">
        <Label>ტიპი</Label>
        <Select value={type} onChange={(e) => setType(e.target.value as VehicleType)}>
          {(Object.keys(VEHICLE_LABEL) as VehicleType[]).map((v) => (
            <option key={v} value={v}>
              {VEHICLE_LABEL[v]}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>სახელმწიფო ნომერი</Label>
        <Input value={numberPlate} onChange={(e) => setNumberPlate(e.target.value)} placeholder="AA-123-BB" />
      </div>
      <div className="space-y-1.5">
        <Label>ქალაქი (სად მუშაობ ძირითადად)</Label>
        <Select value={cityId} onChange={(e) => setCityId(e.target.value)}>
          <option value="">— აირჩიე —</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
    </Section>
  );
}
