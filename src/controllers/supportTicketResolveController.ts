import { Get, Query, Route, Controller, Tags, Response } from "tsoa";
import { prisma } from "../config/prisma";
import { logActivity } from "../utils/activityLogger";

const htmlPage = (title: string, message: string, isError = false) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} — Urbannest</title>
  <style>
    body{margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
    .card{background:#fff;border-radius:12px;border:1px solid #e4e4e7;padding:48px 40px;max-width:480px;width:100%;text-align:center;}
    .icon{font-size:48px;margin-bottom:16px;}
    h1{margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;}
    p{margin:0;font-size:15px;color:#71717a;line-height:1.6;}
    .badge{display:inline-block;margin-top:24px;padding:6px 16px;border-radius:99px;font-size:13px;font-weight:600;background:${isError ? "#fee2e2" : "#dcfce7"};color:${isError ? "#991b1b" : "#166534"};}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isError ? "⚠️" : "✅"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="badge">Urbannest Support</div>
  </div>
</body>
</html>`;

@Route("support-ticket")
@Tags("Support Ticket Resolution (Public)")
export class SupportTicketResolveController extends Controller {
  /**
   * Email magic-link endpoint — marks a support ticket as resolved.
   * No authentication required. Lets support staff act straight from the
   * notification email without logging into the admin portal.
   */
  @Response(200, "HTML confirmation page")
  @Get("resolve")
  public async resolveViaToken(@Query() token: string): Promise<string> {
    this.setHeader("Content-Type", "text/html");

    if (!token) {
      return htmlPage("Invalid Link", "This resolution link is missing a token.", true);
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { resolutionToken: token },
      select: {
        id: true,
        subject: true,
        status: true,
        userId: true,
        resolutionExpiresAt: true,
      },
    });

    if (!ticket) {
      return htmlPage(
        "Link Not Found",
        "This resolution link is invalid or has already been used.",
        true,
      );
    }

    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
      return htmlPage(
        "Already Resolved",
        `Ticket #${ticket.id.substring(0, 8).toUpperCase()} has already been marked as resolved. No further action is needed.`,
      );
    }

    if (ticket.resolutionExpiresAt && ticket.resolutionExpiresAt < new Date()) {
      return htmlPage(
        "Link Expired",
        "This resolution link has expired. Please resolve the ticket from the admin dashboard instead.",
        true,
      );
    }

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionToken: null,
      },
    });

    void logActivity({
      userId: ticket.userId,
      action: "SUPPORT_TICKET_RESOLVED",
      description: `Support ticket "${ticket.subject}" marked as resolved via email link`,
      metadata: { ticketId: ticket.id },
    });

    return htmlPage(
      "Ticket Resolved",
      `Ticket #${ticket.id.substring(0, 8).toUpperCase()} successfully marked as resolved.`,
    );
  }
}
