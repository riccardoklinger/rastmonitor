import { startScraperScheduler } from "@/backend/scheduler";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ENABLE_SCRAPER_SCHEDULER === "true") {
    startScraperScheduler();
  }
}
