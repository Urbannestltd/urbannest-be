import { Resend } from "resend";
import { RESEND_API_KEY } from "./env";

const resend = new Resend(RESEND_API_KEY);

async function sendEmail(to: string, subject: string, html: string) {
  await resend.emails.send({
    from: "info@urbannest.com",
    to: to,
    subject: subject,
    html: html,
  });
}

export default sendEmail;
