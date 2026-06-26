import { getLiveParkingData, initSchema } from "@/backend/db";

export const runtime = "nodejs";

export async function GET() {
  await initSchema();
  const data = await getLiveParkingData();

  return Response.json({
    data,
    mode: "live",
    generatedAt: new Date().toISOString(),
  });
}
