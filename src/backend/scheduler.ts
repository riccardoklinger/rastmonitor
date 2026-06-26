import { scrapeAndStore } from "@/backend/scraper";

const DEFAULT_SCRAPE_INTERVAL_MINUTES = 10;

const globalForScheduler = globalThis as unknown as {
  schedulerStarted?: boolean;
  schedulerInterval?: NodeJS.Timeout;
};

function getIntervalMs() {
  const configured = Number(process.env.SCRAPE_INTERVAL_MINUTES ?? DEFAULT_SCRAPE_INTERVAL_MINUTES);
  const minutes = Number.isFinite(configured) ? configured : DEFAULT_SCRAPE_INTERVAL_MINUTES;
  // Product requirement: scrape interval must stay configurable but within 5-15 minutes.
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

  globalForScheduler.schedulerInterval = setInterval(() => {
    void execute();
  }, intervalMs);
}

export function stopScraperScheduler() {
  if (globalForScheduler.schedulerInterval) {
    clearInterval(globalForScheduler.schedulerInterval);
    globalForScheduler.schedulerInterval = undefined;
  }
  globalForScheduler.schedulerStarted = false;
}
