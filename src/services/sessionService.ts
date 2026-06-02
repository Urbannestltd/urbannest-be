import { prisma } from "../config/prisma";
import * as jwt from "jsonwebtoken";
import { ForbiddenError, UnauthorizedError } from "../utils/apiError";

export class SessionService {
  public async refreshAccessToken(refreshToken: string) {
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: { include: { userRole: true } } },
    });

    if (!session || !session.isValid) {
      throw new UnauthorizedError("Session invalid or revoked. Please log in again.");
    }

    if (session.user.userStatus === "BLOCKED") {
      await this.invalidateSession(refreshToken);
      throw new ForbiddenError(
        "This account has been deactivated. Contact your administrator.",
      );
    }

    const now = new Date();

    const MAX_SESSION_HOURS = 24;
    const sessionAgeHours =
      (now.getTime() - session.createdAt.getTime()) / (1000 * 60 * 60);
    if (sessionAgeHours > MAX_SESSION_HOURS) {
      await this.invalidateSession(refreshToken);
      throw new UnauthorizedError("Session expired. Please log in again.");
    }

    const MAX_IDLE_HOURS = 2;
    const idleHours =
      (now.getTime() - session.lastActiveAt.getTime()) / (1000 * 60 * 60);
    if (idleHours > MAX_IDLE_HOURS) {
      await this.invalidateSession(refreshToken);
      throw new UnauthorizedError("Session expired due to inactivity.");
    }

    await prisma.session.update({
      where: { refreshToken },
      data: { lastActiveAt: now },
    });

    const privateKey = Buffer.from(
      process.env.JWT_PRIVATE_KEY!,
      "base64",
    ).toString("ascii");

    const newAccessToken = jwt.sign(
      { userId: session.userId, role: session.user.userRole.roleName },
      privateKey,
      { algorithm: "RS256", expiresIn: "1d" },
    );

    return { accessToken: newAccessToken };
  }

  /** Invalidates a session by its refresh token (the stable unique identifier callers have). */
  public async invalidateSession(refreshToken: string) {
    await prisma.session.updateMany({
      where: { refreshToken },
      data: { isValid: false },
    });
  }

  /** Revokes ALL active sessions for a user — called on account suspension. */
  public async invalidateAllUserSessions(userId: string) {
    await prisma.session.updateMany({
      where: { userId, isValid: true },
      data: { isValid: false },
    });
  }
}
