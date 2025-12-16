import { defineConfig } from "prisma/config";
import { DATABASE_URL } from "./src/config/env";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: DATABASE_URL,
  },
});
