import { prisma } from "../config/prisma";

type NotifField =
  | "emailPayments"
  | "emailLease"
  | "emailMaintenance"
  | "emailVisitors";

/**
 * Returns all ADMIN-role users who have a given notification preference enabled
 * (or have no settings record at all, which means all defaults are true).
 */
export async function getAdminRecipients(
  preference: NotifField,
): Promise<{ email: string; name: string | null }[]> {
  const admins = await prisma.user.findMany({
    where: {
      userRole: { roleName: "ADMIN" },
      userStatus: "ACTIVE",
      OR: [
        { notificationSettings: null },
        { notificationSettings: { [preference]: true } },
      ],
    },
    select: { userEmail: true, userFullName: true },
  });

  return admins.map((a) => ({ email: a.userEmail, name: a.userFullName }));
}
