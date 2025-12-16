import app from "./app";
import { PORT } from "./config/env";
import { prisma } from "./config/prisma";

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
