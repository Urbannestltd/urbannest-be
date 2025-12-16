import { PrismaClient } from "@prisma/client";
import { DATABASE_URL } from "./env";

export const prisma = new PrismaClient();

prisma
  .$connect()
  .then(() => {
    console.log("Connected to the database successfully.");
    if (process.env.NODE_ENV === "development") {
      console.log("Prisma Client is running in development mode.");
    } else if (process.env.NODE_ENV === "production") {
      console.log("Prisma Client is running in production mode.");
    }
  })
  .catch((error) => {
    console.error("Error connecting to the database:", error);
  });

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Closing database connection...`);
  await prisma.$disconnect();
  console.log("Database disconnected.");
  process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
