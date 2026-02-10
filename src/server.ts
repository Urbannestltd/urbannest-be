import app from "./app";
import { PORT } from "./config/env";
import { initCronJobs } from "./jobs/scheduler";

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  initCronJobs();
});
