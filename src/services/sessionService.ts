import { prisma } from "../config/prisma";
import * as jwt from "jsonwebtoken";

export class SessionService {
  public async refreshAccessToken(refreshToken: string) {
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: { include: { userRole: true } } },
    });

    if (!session || !session.isValid) {
      throw new Error("Session invalid or revoked. Please log in again.");
    }

    const now = new Date();

    // --- SECURITY RULE 1: Absolute Timeout (e.g., 24 hours max) ---
    const MAX_SESSION_HOURS = 24;
    const sessionAgeHours =
      (now.getTime() - session.createdAt.getTime()) / (1000 * 60 * 60);
    if (sessionAgeHours > MAX_SESSION_HOURS) {
      await this.invalidateSession(session.id);
      throw new Error("Absolute session timeout reached.");
    }

    // --- SECURITY RULE 2: Idle Timeout (e.g., 2 hours of inactivity) ---
    const MAX_IDLE_HOURS = 2;
    const idleHours =
      (now.getTime() - session.lastActiveAt.getTime()) / (1000 * 60 * 60);
    if (idleHours > MAX_IDLE_HOURS) {
      await this.invalidateSession(session.id);
      throw new Error("Session expired due to inactivity.");
    }

    // --- SECURITY RULE 3: Update Activity & Issue New Token ---
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: now }, // Resets the idle timer
    });

    const privateKey = Buffer.from(
      process.env.JWT_PRIVATE_KEY_B64!,
      "base64",
    ).toString("ascii");
    const newAccessToken = jwt.sign(
      { userId: session.userId, role: session.user.userRole.roleName },
      privateKey,
      { algorithm: "RS256", expiresIn: "15m" },
    );

    return { accessToken: newAccessToken };
  }

  public async invalidateSession(sessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { isValid: false },
    });
  }
}
