"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";
import type { OrderDTO } from "@/lib/serialize";

export interface DriverListItem {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string | null;
  isApproved: boolean;
  status: "AVAILABLE" | "BUSY" | "OFFLINE";
  city: string | null;
  rating: number;
  ratingCount: number;
  activeOrders: number;
  totalDeliveries: number;
  location: { lat: number; lng: number } | null;
  cashOnHand: number;
  unpaidEarnings: number;
  distanceKm: number | null;
}

export interface DriverMe {
  id: string;
  status: "AVAILABLE" | "BUSY" | "OFFLINE";
  isApproved: boolean;
  vehicleType: string;
  vehicleNumber: string | null;
  city: string | null;
  cityId: string | null;
  rating: number;
  totalDeliveries: number;
  cashOnHand: number;
  unpaidEarnings: number;
  location: { lat: number; lng: number } | null;
}

export function useOrders(query = "", refreshInterval = 15000) {
  const { data, error, isLoading, mutate } = useSWR<{ orders: OrderDTO[] }>(
    `/api/orders${query}`,
    jsonFetcher,
    { refreshInterval },
  );
  return { orders: data?.orders ?? [], error, isLoading, mutate };
}

export function useOrder(id: string | null, refreshInterval = 10000) {
  const { data, error, isLoading, mutate } = useSWR<{ order: OrderDTO }>(
    id ? `/api/orders/${id}` : null,
    jsonFetcher,
    { refreshInterval },
  );
  return { order: data?.order ?? null, error, isLoading, mutate };
}

export function useTracking(tn: string | null, refreshInterval = 10000) {
  const { data, error, isLoading } = useSWR<{ tracking: TrackingDTO }>(
    tn ? `/api/orders/track/${encodeURIComponent(tn)}` : null,
    jsonFetcher,
    { refreshInterval },
  );
  return { tracking: data?.tracking ?? null, error, isLoading };
}

export function useDrivers(query = "", refreshInterval = 20000) {
  const { data, error, isLoading, mutate } = useSWR<{ drivers: DriverListItem[] }>(
    `/api/drivers${query}`,
    jsonFetcher,
    { refreshInterval },
  );
  return { drivers: data?.drivers ?? [], error, isLoading, mutate };
}

export function useDriverMe(refreshInterval = 20000) {
  const { data, error, isLoading, mutate } = useSWR<{ driver: DriverMe }>(
    "/api/driver/me",
    jsonFetcher,
    { refreshInterval },
  );
  return { driver: data?.driver ?? null, error, isLoading, mutate };
}

export interface WeightBracket {
  maxKg: number;
  price: number;
}

export interface PricingRule {
  id: string;
  zone: "TBILISI" | "REGIONAL_CITY" | "TOWN_VILLAGE";
  isActive: boolean;
  weightBrackets: WeightBracket[];
  codFee: number;
  driverBaseFee: number;
  driverPerKm: number;
  driverFreeKm: number;
  driverFlatFee: number;
  driverPayoutPercent: number | null;
  sameDayCutoffHour: number | null;
  deliveryDays: number;
}

export interface SettlementItem {
  id: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  cashOnHand?: number;
  amount: number;
  note: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  createdAt: string;
  confirmedAt: string | null;
}

export function useSettlements(query = "", refreshInterval = 20000) {
  const { data, isLoading, mutate } = useSWR<{ settlements: SettlementItem[] }>(
    `/api/settlements${query}`,
    jsonFetcher,
    { refreshInterval },
  );
  return { settlements: data?.settlements ?? [], isLoading, mutate };
}

export interface SavedContact {
  name: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  count: number;
}

export interface CityItem {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
}
export function useCities() {
  const { data } = useSWR<{ cities: CityItem[] }>("/api/cities", jsonFetcher);
  return { cities: data?.cities ?? [] };
}

export function useContacts() {
  const { data } = useSWR<{ senders: SavedContact[]; recipients: SavedContact[] }>(
    "/api/orders/contacts",
    jsonFetcher,
  );
  return { senders: data?.senders ?? [], recipients: data?.recipients ?? [] };
}

export interface CodOutstanding {
  customerId: string;
  name: string;
  phone: string;
  gross: number;
  commission: number;
  charges: number;
  net: number;
  count: number;
  oldest: string | null;
}
export interface CodRemittanceItem {
  id: string;
  customerName?: string;
  gross: number;
  commission: number;
  charges?: number;
  net: number;
  orderCount: number;
  method: string | null;
  createdAt: string;
}
export function useDispatchCod(refreshInterval = 20000) {
  const { data, isLoading, mutate } = useSWR<{
    outstanding: CodOutstanding[];
    history: CodRemittanceItem[];
  }>("/api/dispatch/cod", jsonFetcher, { refreshInterval });
  return {
    outstanding: data?.outstanding ?? [],
    history: data?.history ?? [],
    isLoading,
    mutate,
  };
}

export interface MyCod {
  outstandingNet: number;
  outstandingCount: number;
  chargesTotal: number;
  charges: { trackingNumber: string; amount: number; reason: string }[];
  pending: {
    trackingNumber: string;
    collectAmount: number;
    commission: number;
    net: number;
    deliveredAt: string | null;
  }[];
  history: CodRemittanceItem[];
}
export function useMyCod(refreshInterval = 30000) {
  const { data, mutate } = useSWR<MyCod>("/api/orders/cod", jsonFetcher, { refreshInterval });
  return { cod: data ?? null, mutate };
}

export function useMySettlements(refreshInterval = 20000) {
  const { data, isLoading, mutate } = useSWR<{ settlements: SettlementItem[] }>(
    "/api/driver/settlement",
    jsonFetcher,
    { refreshInterval },
  );
  return { settlements: data?.settlements ?? [], isLoading, mutate };
}

export function usePricingRules() {
  const { data, isLoading, mutate } = useSWR<{ rules: PricingRule[] }>(
    "/api/pricing/rules",
    jsonFetcher,
  );
  return { rules: data?.rules ?? [], isLoading, mutate };
}

export interface DispatcherItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
}

export function useDispatchers() {
  const { data, isLoading, mutate } = useSWR<{ dispatchers: DispatcherItem[] }>(
    "/api/dispatchers",
    jsonFetcher,
  );
  return { dispatchers: data?.dispatchers ?? [], isLoading, mutate };
}

export interface NotificationItem {
  id: string;
  type: "ORDER" | "PAYMENT" | "SYSTEM" | "PROMO";
  title: string;
  body: string;
  data: unknown;
  isRead: boolean;
  createdAt: string;
}

export function useNotifications(refreshInterval = 30000) {
  const { data, mutate } = useSWR<{ unread: number; notifications: NotificationItem[] }>(
    "/api/notifications",
    jsonFetcher,
    { refreshInterval },
  );
  return {
    unread: data?.unread ?? 0,
    notifications: data?.notifications ?? [],
    mutate,
  };
}

export interface TrackingDTO {
  trackingNumber: string;
  status: OrderDTO["status"];
  kind: OrderDTO["kind"];
  createdAt: string;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  pickup: { address: string; lat: number; lng: number };
  delivery: { address: string; lat: number; lng: number };
  driverName: string | null;
  driverLocation: { lat: number; lng: number } | null;
  events: OrderDTO["events"];
}
