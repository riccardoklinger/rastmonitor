import { scrapeAndStore } from "@/backend/scraper";

export const runtime = "nodejs";

export async function POST() {
  const result = await scrapeAndStore();

  return Response.json({
    ok: true,
    ...result,
    scrapedAt: new Date().toISOString(),
  });
}
