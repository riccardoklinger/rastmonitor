import { getAggregatedParkingData, initSchema } from "@/backend/db";
import type { AggregateBucket } from "@/backend/types";

export const runtime = "nodejs";

const ALLOWED_BUCKETS = new Set<AggregateBucket>(["last_month", "last_3_months", "calendar_month"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bucket = (searchParams.get("bucket") ?? "last_month") as AggregateBucket;
  const month = searchParams.get("month") ?? undefined;

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return Response.json({ error: "Invalid bucket" }, { status: 400 });
  }

  await initSchema();
  const data = await getAggregatedParkingData(bucket, month);

  return Response.json({
    data,
    mode: bucket,
    generatedAt: new Date().toISOString(),
  });
}
