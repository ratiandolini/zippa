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

export interface PricingRule {
  id: string;
  name: string;
  kind: "INTRA_CITY" | "INTER_CITY";
  cityId: string | null;
  cityName: string | null;
  isActive: boolean;
  priority: number;
  basePrice: number;
  pricePerKm: number;
  pricePerKg: number;
  freeWeightKg: number;
  minPrice: number;
  codFee: number;
  driverPayoutPercent: number;
}

export interface City {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
}

export function usePricingRules() {
  const { data, isLoading, mutate } = useSWR<{ rules: PricingRule[] }>(
    "/api/pricing/rules",
    jsonFetcher,
  );
  return { rules: data?.rules ?? [], isLoading, mutate };
}

export function useCities() {
  const { data } = useSWR<{ cities: City[] }>("/api/cities", jsonFetcher);
  return { cities: data?.cities ?? [] };
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
