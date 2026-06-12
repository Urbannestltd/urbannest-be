import { Get, Query, Route, Controller, Tags, Response } from "tsoa";
import { prisma } from "../config/prisma";
import { confirmVisitorDeparture } from "../services/facility-manager/fmGateService";

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
    <div class="badge">Urbannest Access Control</div>
  </div>
</body>
</html>`;

@Route("visit-departures")
@Tags("Departure Confirmation (Public)")
export class DepartureController extends Controller {
  /**
   * Email magic-link endpoint — confirms a visitor has departed.
   * No authentication required. Returns an HTML confirmation page.
   * The departure token is single-use and is cleared after confirmation.
   */
  @Response(200, "HTML confirmation page")
  @Get("confirm")
  public async confirmDeparture(@Query() token: string): Promise<string> {
    this.setHeader("Content-Type", "text/html");

    if (!token) {
      return htmlPage("Invalid Link", "This confirmation link is missing a token.", true);
    }

    const invite = await prisma.visitorInvite.findFirst({
      where: { departureToken: token },
      select: {
        id: true,
        status: true,
        visitorName: true,
        tenantId: true,
        departureToken: true,
      },
    });

    if (!invite) {
      return htmlPage(
        "Link Not Found",
        "This confirmation link is invalid or has already been used.",
        true,
      );
    }

    if (invite.status === "CHECKED_OUT") {
      return htmlPage(
        "Already Confirmed",
        `${invite.visitorName}'s departure has already been logged. No further action needed.`,
      );
    }

    if (invite.status !== "CHECKED_IN") {
      return htmlPage(
        "Cannot Confirm",
        "This visit is not in a state that can be confirmed as departed.",
        true,
      );
    }

    try {
      await confirmVisitorDeparture(invite.id, invite.tenantId);
    } catch {
      return htmlPage(
        "Something Went Wrong",
        "We could not log this departure. Please try again or contact the facility manager.",
        true,
      );
    }

    return htmlPage(
      "Departure Confirmed",
      `<strong>${invite.visitorName}</strong>'s departure has been logged. The facility manager has been notified.`,
    );
  }
}
