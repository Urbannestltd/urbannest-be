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
    <div class="icon">${isError ? "⚠️" : title.toLowerCase().includes("approved") ? "✅" : "🚫"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="badge">Urbannest Access Control</div>
  </div>
</body>
</html>`;

@Route("visitor-approval")
@Tags("Visitor Approval (Public)")
export class VisitorApprovalController extends Controller {
  /**
   * Email magic-link endpoint — approves a walk-in visitor.
   * No authentication required. Returns an HTML confirmation page.
   * The token is single-use and expires after 5 minutes.
   */
  @Response(200, "HTML confirmation page")
  @Get("approve")
  public async approveViaToken(@Query() token: string): Promise<string> {
    this.setHeader("Content-Type", "text/html");
    return this.resolveToken(token, "approve");
  }

  /**
   * Email magic-link endpoint — rejects a walk-in visitor.
   * No authentication required. Returns an HTML confirmation page.
   * The token is single-use and expires after 5 minutes.
   */
  @Response(200, "HTML confirmation page")
  @Get("reject")
  public async rejectViaToken(@Query() token: string): Promise<string> {
    this.setHeader("Content-Type", "text/html");
    return this.resolveToken(token, "reject");
  }

  private async resolveToken(token: string, action: "approve" | "reject"): Promise<string> {
    if (!token) {
      return htmlPage("Invalid Link", "This approval link is missing a token.", true);
    }

    const visit = await prisma.visitorInvite.findUnique({
      where: { approvalToken: token },
      select: {
        id: true,
        status: true,
        visitorName: true,
        approvalExpiresAt: true,
        tenantId: true,
      },
    });

    if (!visit) {
      return htmlPage("Link Not Found", "This approval link is invalid or has already been used.", true);
    }

    if (visit.status !== "PENDING") {
      const statusLabel =
        visit.status === "CHECKED_IN"
          ? "already approved"
          : visit.status === "REJECTED"
            ? "already denied"
            : "already resolved";
      return htmlPage(
        "Already Resolved",
        `This visitor request has been ${statusLabel}. No further action is needed.`,
        visit.status === "REJECTED",
      );
    }

    if (visit.approvalExpiresAt && visit.approvalExpiresAt < new Date()) {
      return htmlPage(
        "Link Expired",
        "This approval window has expired. The system has already applied the fallback rule.",
        true,
      );
    }

    const newStatus = action === "approve" ? "CHECKED_IN" : "REJECTED";
    await prisma.visitorInvite.update({
      where: { id: visit.id },
      data: {
        status: newStatus as any,
        checkedInAt: action === "approve" ? new Date() : undefined,
        approvalToken: null,
      },
    });

    void logActivity({
      userId: visit.tenantId,
      action: action === "approve" ? "WALK_IN_APPROVED" : "WALK_IN_REJECTED",
      description: `Walk-in visitor ${visit.visitorName} ${action === "approve" ? "approved" : "rejected"} via email link`,
      metadata: { visitId: visit.id },
    });

    if (action === "approve") {
      return htmlPage(
        "Entry Approved",
        `<strong>${visit.visitorName}</strong> has been approved to enter. The facility manager has been notified.`,
      );
    } else {
      return htmlPage(
        "Entry Denied",
        `<strong>${visit.visitorName}</strong> has been denied entry. The facility manager has been notified.`,
        true,
      );
    }
  }
}
