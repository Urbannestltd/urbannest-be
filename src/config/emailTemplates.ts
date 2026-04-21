// ---------------------------------------------------------------------------
// Urbannest Email Templates
// Minimalist, modern, inline-HTML (email-client safe, table-based layout).
// All functions return a { subject, html } tuple ready for ZeptoMailService.sendEmail()
// ---------------------------------------------------------------------------

const BRAND = {
  dark: "#18181b",
  accent: "#d4a853",
  bg: "#f4f4f5",
  card: "#ffffff",
  text: "#3f3f46",
  muted: "#a1a1aa",
  border: "#e4e4e7",
  softBg: "#fafafa",
};

const font =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif";

// ---------------------------------------------------------------------------
// Base layout wrapper
// ---------------------------------------------------------------------------
function base(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${font};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:48px 16px 64px;">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:580px;background:${BRAND.card};border-radius:12px;
                      border:1px solid ${BRAND.border};overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND.dark};padding:24px 40px;">
              <span style="font-size:20px;font-weight:700;color:#ffffff;
                           letter-spacing:-0.3px;">Urbannest</span>
              <span style="font-size:20px;font-weight:300;color:${BRAND.accent};
                           letter-spacing:-0.3px;">.</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;color:${BRAND.text};
                       font-size:15px;line-height:1.7;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${BRAND.softBg};border-top:1px solid ${BRAND.border};
                       padding:20px 40px;">
              <p style="margin:0;font-size:12px;color:${BRAND.muted};line-height:1.8;">
                You're receiving this because you have an account with Urbannest.<br/>
                Need help? &nbsp;<a href="mailto:support@urbannesttech.com"
                  style="color:${BRAND.muted};text-decoration:underline;">
                  support@urbannesttech.com</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Reusable partials
// ---------------------------------------------------------------------------
function heading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;
                      color:${BRAND.dark};letter-spacing:-0.4px;">${text}</h1>`;
}

function subheading(text: string): string {
  return `<p style="margin:0 0 28px;font-size:14px;color:${BRAND.muted};">${text}</p>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 20px;font-size:15px;color:${BRAND.text};
                    line-height:1.7;">${text}</p>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid ${BRAND.border};margin:28px 0;"/>`;
}

function ctaButton(label: string, href: string): string {
  return `
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
    <tr>
      <td style="background:${BRAND.dark};border-radius:8px;">
        <a href="${href}"
           style="display:inline-block;padding:14px 32px;color:#ffffff;
                  font-size:14px;font-weight:600;text-decoration:none;
                  letter-spacing:0.2px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function otpBlock(code: string): string {
  return `
  <div style="background:${BRAND.softBg};border:1px solid ${BRAND.border};
              border-radius:10px;padding:28px;text-align:center;margin:28px 0;">
    <p style="margin:0 0 6px;font-size:12px;color:${BRAND.muted};
              text-transform:uppercase;letter-spacing:1px;">Your code</p>
    <span style="font-size:40px;font-weight:700;letter-spacing:10px;
                 color:${BRAND.dark};font-variant-numeric:tabular-nums;">${code}</span>
  </div>
  <p style="margin:0 0 20px;font-size:13px;color:${BRAND.muted};text-align:center;">
    This code expires in 10 minutes. Do not share it with anyone.
  </p>`;
}

function alertBox(text: string, type: "warning" | "info" = "warning"): string {
  const colors =
    type === "warning"
      ? { bg: "#fefce8", border: "#ca8a04", text: "#854d0e" }
      : { bg: "#f0f9ff", border: "#0284c7", text: "#0c4a6e" };
  return `
  <div style="background:${colors.bg};border-left:3px solid ${colors.border};
              border-radius:0 8px 8px 0;padding:14px 16px;margin:24px 0;">
    <p style="margin:0;font-size:13px;color:${colors.text};line-height:1.6;">${text}</p>
  </div>`;
}

function metaRow(label: string, value: string): string {
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};
               font-size:13px;color:${BRAND.muted};width:40%;vertical-align:top;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};
               font-size:13px;color:${BRAND.dark};font-weight:500;">${value}</td>
  </tr>`;
}

function metaTable(rows: [string, string][]): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="margin:24px 0;">
    ${rows.map(([l, v]) => metaRow(l, v)).join("")}
  </table>`;
}

// ---------------------------------------------------------------------------
// 1. Registration invite
// ---------------------------------------------------------------------------
export function registrationInviteEmail(link: string, validTime = "24 hours") {
  return {
    subject: "You're invited to Urbannest",
    html: base(`
      ${heading("Welcome to Urbannest")}
      ${subheading("Your account is ready to be set up")}
      ${para("An administrator has created an account for you on the Urbannest platform. Click the button below to complete your registration and set your password.")}
      ${ctaButton("Complete Registration", link)}
      ${divider()}
      ${para(`This invitation link is valid for <strong>${validTime}</strong>. After that, please contact your administrator for a new link.`)}
      ${alertBox("Never share this link with anyone. It grants access to your account.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 2. Login OTP (2FA)
// ---------------------------------------------------------------------------
export function loginOtpEmail(name: string, code: string) {
  return {
    subject: "Your Urbannest login code",
    html: base(`
      ${heading("Login verification")}
      ${subheading(`Hi ${name}`)}
      ${para("Use the code below to complete your sign-in. It is valid for 10 minutes.")}
      ${otpBlock(code)}
      ${alertBox("If you did not attempt to log in, please secure your account immediately and contact support.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 3. Password reset
// ---------------------------------------------------------------------------
export function passwordResetEmail(name: string, link: string) {
  return {
    subject: "Reset your Urbannest password",
    html: base(`
      ${heading("Password reset request")}
      ${subheading(`Hi ${name}`)}
      ${para("We received a request to reset the password for your Urbannest account. Click the button below to choose a new password.")}
      ${ctaButton("Reset Password", link)}
      ${divider()}
      ${para("This link expires in <strong>1 hour</strong>.")}
      ${alertBox("If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 4. Password changed notification
// ---------------------------------------------------------------------------
export function passwordChangedEmail(name: string, date: string) {
  return {
    subject: "Your password was changed",
    html: base(`
      ${heading("Password updated")}
      ${subheading(`Hi ${name}`)}
      ${para("Your Urbannest account password was successfully changed.")}
      ${metaTable([["Date & time", date]])}
      ${alertBox("If you did not make this change, please contact support immediately and reset your password.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 5. Two-factor authentication setup OTP
// ---------------------------------------------------------------------------
export function twoFaSetupEmail(name: string, code: string) {
  return {
    subject: "Your two-factor authentication code",
    html: base(`
      ${heading("Enable two-factor authentication")}
      ${subheading(`Hi ${name}`)}
      ${para("Enter the code below to verify your identity and complete 2FA setup.")}
      ${otpBlock(code)}
      ${alertBox("Do not share this code with anyone, including Urbannest staff.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 6. New support ticket (to support team)
// ---------------------------------------------------------------------------
export function supportNewTicketEmail(
  ticketId: string,
  subject: string,
  userId: string,
) {
  return {
    subject: `New support ticket — ${ticketId.substring(0, 8).toUpperCase()}`,
    html: base(`
      ${heading("New support ticket received")}
      ${subheading("A tenant has submitted a new support request")}
      ${metaTable([
        ["Ticket ID", ticketId.substring(0, 8).toUpperCase()],
        ["Subject", subject],
        ["Submitted by", userId],
      ])}
      ${para("Log in to the admin dashboard to view and respond to this ticket.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 7. Support reply received (to tenant)
// ---------------------------------------------------------------------------
export function supportReplyEmail(
  name: string,
  ticketSubject: string,
  preview: string,
) {
  return {
    subject: `New reply on your support ticket`,
    html: base(`
      ${heading("You have a new reply")}
      ${subheading(`Hi ${name}`)}
      ${para(`The support team has responded to your ticket: <strong>${ticketSubject}</strong>`)}
      <div style="background:${BRAND.softBg};border:1px solid ${BRAND.border};
                  border-radius:8px;padding:20px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.7;
                  font-style:italic;">"${preview}…"</p>
      </div>
      ${para("Log in to your Urbannest account to view the full reply and continue the conversation.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 8. Maintenance alert (to facility manager / property manager)
// ---------------------------------------------------------------------------
export function maintenanceAlertEmail(
  category: string,
  unit: string,
  tenant: string,
  priority: string,
) {
  const priorityColor =
    priority === "EMERGENCY"
      ? "#dc2626"
      : priority === "HIGH"
        ? "#ea580c"
        : "#ca8a04";

  return {
    subject: `Maintenance request — ${category} (${priority})`,
    html: base(`
      ${heading("New maintenance request")}
      ${subheading("A tenant has raised a maintenance issue that requires attention")}
      ${metaTable([
        ["Category", category],
        ["Unit", unit],
        ["Reported by", tenant],
        [
          "Priority",
          `<span style="color:${priorityColor};font-weight:600;">${priority}</span>`,
        ],
      ])}
      ${priority === "EMERGENCY" ? alertBox("This request is marked <strong>EMERGENCY</strong>. Immediate attention is required.", "warning") : ""}
      ${para("Log in to the dashboard to assign and action this request.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 9. Maintenance reply notification
// ---------------------------------------------------------------------------
export function maintenanceReplyEmail(
  recipientName: string,
  ticketId: string,
  senderName: string,
  preview: string,
) {
  return {
    subject: `New message on your maintenance request`,
    html: base(`
      ${heading("New message received")}
      ${subheading(`Hi ${recipientName}`)}
      ${para(`<strong>${senderName}</strong> has sent a message on maintenance request <strong>#${ticketId.substring(0, 8).toUpperCase()}</strong>.`)}
      <div style="background:${BRAND.softBg};border:1px solid ${BRAND.border};
                  border-radius:8px;padding:20px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.7;
                  font-style:italic;">"${preview}…"</p>
      </div>
      ${para("Log in to your Urbannest account to view the full message and respond.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 10. Visitor check-in notification
// ---------------------------------------------------------------------------
export function visitorCheckInEmail(
  tenantName: string,
  visitorName: string,
  time: string,
  location: string,
) {
  return {
    subject: `Your visitor ${visitorName} has arrived`,
    html: base(`
      ${heading("Visitor arrival")}
      ${subheading(`Hi ${tenantName}`)}
      ${para(`Your visitor has checked in at the premises.`)}
      ${metaTable([
        ["Visitor", visitorName],
        ["Check-in time", time],
        ["Location", location],
      ])}
      ${para("If you were not expecting this visitor or have any concerns, please contact the front desk immediately.")}
    `),
  };
}

// ---------------------------------------------------------------------------
// 11. Reminder notification
// ---------------------------------------------------------------------------
export function reminderEmail(
  name: string,
  title: string,
  description: string,
  time: string,
) {
  return {
    subject: `Reminder: ${title}`,
    html: base(`
      ${heading("You have a reminder")}
      ${subheading(`Hi ${name}`)}
      <div style="background:${BRAND.softBg};border-left:3px solid ${BRAND.accent};
                  border-radius:0 8px 8px 0;padding:20px 24px;margin:24px 0;">
        <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:${BRAND.dark};">
          ${title}</p>
        <p style="margin:0;font-size:14px;color:${BRAND.text};line-height:1.6;">
          ${description}</p>
      </div>
      ${metaTable([["Due at", time]])}
    `),
  };
}
