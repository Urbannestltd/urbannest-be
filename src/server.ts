import app from "./app";
import { PORT } from "./config/env";
import { initCronJobs } from "./jobs/scheduler";

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // node-cron only works in persistent environments (not Vercel serverless).
  // On Vercel, crons are triggered via HTTP — see /cron/* routes in app.ts.
  if (process.env.VERCEL !== "1") {
    initCronJobs();
  }
});
