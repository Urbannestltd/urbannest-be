import { prisma } from "../../config/prisma";
import { ZeptoMailService } from "../external/zeptoMailService";
import { reminderEmail } from "../../config/emailTemplates";

export class ReminderWorker {
  private emailService = new ZeptoMailService();

  /**
   * The Core Logic: Process all pending reminders
   */
  public async processDueReminders() {
    console.log("⏳ Checking for due reminders...");

    // 1. Find reminders that are due (dueAt <= NOW) and haven't been sent yet
    const dueReminders = await prisma.reminder.findMany({
      where: {
        isSent: false,
        dueAt: {
          lte: new Date(), // "Less than or equal to" right now
        },
      },
      include: {
        user: true, // We need the user's email
      },
    });

    if (dueReminders.length === 0) {
      return; // Nothing to do
    }

    console.log(`🔔 Found ${dueReminders.length} reminders to send.`);

    // 2. Loop through and process them
    for (const reminder of dueReminders) {
      try {
        // A. Send the Email
        const rem = reminderEmail(
          reminder.user.userFirstName || "there",
          reminder.title,
          reminder.description || "No details provided.",
          new Date(reminder.dueAt).toLocaleString(),
        );
        await this.emailService.sendEmail(
          { email: reminder.user.userEmail, name: reminder.user.userFirstName ?? undefined },
          rem.subject,
          rem.html,
        );

        // B. Mark as Sent (So we don't send it again next minute)
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { isSent: true },
        });

        console.log(
          `✅ Sent reminder '${reminder.title}' to ${reminder.user.userEmail}`,
        );
      } catch (error) {
        console.error(`❌ Failed to send reminder ${reminder.id}:`, error);
        // Optional: Add a 'retryCount' field to the DB if you want to try again later
      }
    }
  }
}
