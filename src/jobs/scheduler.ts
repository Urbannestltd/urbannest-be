import cron from "node-cron";
import { ReminderWorker } from "../services/workers/reminderWorker";

const reminderWorker = new ReminderWorker();

export const initCronJobs = () => {
  console.log("⏰ Initializing Cron Jobs...");

  // Schedule: Run every minute (* * * * *)
  cron.schedule("* * * * *", async () => {
    try {
      await reminderWorker.processDueReminders();
    } catch (error) {
      console.error("🔥 Error in Reminder Cron:", error);
    }
  });
};
