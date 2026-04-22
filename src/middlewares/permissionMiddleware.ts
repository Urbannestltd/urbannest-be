import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { Permission } from "@prisma/client";
import { ForbiddenError } from "../utils/apiError";

export function requirePermission(...required: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId: string = (req as any).user?.userId;
    if (!userId) return next(new ForbiddenError("Unauthorized"));

    const user = await prisma.user.findUnique({
      where: { userId },
      select: {
        userRole: { select: { roleName: true } },
        permissions: true,
      },
    });

    if (!user) return next(new ForbiddenError("User not found"));

    // ADMIN role bypasses all permission checks
    if (user.userRole.roleName === "ADMIN") return next();

    const hasAll = required.every((p) => user.permissions.includes(p));
    if (!hasAll) {
      return next(
        new ForbiddenError("You do not have permission to perform this action"),
      );
    }

    next();
  };
}
