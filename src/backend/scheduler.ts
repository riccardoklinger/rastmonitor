import { scrapeAndStore } from "@/backend/scraper";

const globalForScheduler = globalThis as unknown as { schedulerStarted?: boolean };

function getIntervalMs() {
  const configured = Number(process.env.SCRAPE_INTERVAL_MINUTES ?? 10);
  const minutes = Number.isFinite(configured) ? configured : 10;
  const bounded = Math.min(15, Math.max(5, minutes));
  return bounded * 60 * 1000;
}

export function startScraperScheduler() {
  if (globalForScheduler.schedulerStarted) {
    return;
  }
  globalForScheduler.schedulerStarted = true;

  const runNow = process.env.SCRAPE_RUN_ON_STARTUP !== "false";
  const intervalMs = getIntervalMs();

  const execute = async () => {
    try {
      await scrapeAndStore();
    } catch (error) {
      console.error("Scheduled scrape failed", error);
    }
  };

  if (runNow) {
    void execute();
  }

  setInterval(() => {
    void execute();
  }, intervalMs);
}
