import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

export async function logActivity(params: {
  userId: string;
  action: string;
  description: string;
  ipAddress?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        description: params.description,
        ipAddress: params.ipAddress ?? null,
        metadata: params.metadata ?? Prisma.JsonNull,
      },
    });
  } catch {
    // Never let logging break the main flow
  }
}
