export type ScrapedParkingPoint = {
  locationId: string;
  name: string;
  lat: number;
  lng: number;
  usage: number | null;
  capacity: number | null;
  available: number | null;
};

export type LiveParkingPoint = {
  locationId: string;
  name: string;
  lat: number;
  lng: number;
  usage: number | null;
  capacity: number | null;
  available: number | null;
  scrapedAt: string | null;
};

export type AggregateBucket = "last_month" | "last_3_months" | "calendar_month";

export type AggregateParkingPoint = {
  locationId: string;
  name: string;
  lat: number;
  lng: number;
  minUsage: number | null;
  maxUsage: number | null;
  meanUsage: number | null;
  sampleCount: number;
  from: string;
  to: string;
};
