import cron from "node-cron";
import { ReminderWorker } from "../services/workers/reminderWorker";
import { WalkInTimeoutWorker } from "../services/workers/walkInTimeoutWorker";
import { NoShowWorker } from "../services/workers/noShowWorker";

const reminderWorker = new ReminderWorker();
const walkInTimeoutWorker = new WalkInTimeoutWorker();
const noShowWorker = new NoShowWorker();

export const initCronJobs = () => {
  console.log("⏰ Initializing Cron Jobs...");

  // Schedule: Run once per day at midnight (0 0 * * *)
  cron.schedule("0 0 * * *", async () => {
    try {
      await reminderWorker.processDueReminders();
    } catch (error) {
      console.error("🔥 Error in Reminder Cron:", error);
    }
  });

  cron.schedule("0 0 * * *", async () => {
    try {
      await walkInTimeoutWorker.processExpiredWalkIns();
    } catch (error) {
      console.error("🔥 Error in Walk-In Timeout Cron:", error);
    }
  });

  cron.schedule("0 0 * * *", async () => {
    try {
      await noShowWorker.processNoShows();
    } catch (error) {
      console.error("🔥 Error in No-Show Cron:", error);
    }
  });
};
