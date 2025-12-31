import { Resend } from "resend";
import { RESEND_API_KEY } from "./env";

const resend = new Resend(RESEND_API_KEY);

async function sendEmail(to: string, subject: string, html: string) {
  const sentEmail = await resend.emails.send({
    from: "otegabrotobor@gmail.com",
    to: to,
    subject: subject,
    html: html,
  });

  console.log(sentEmail.data);
}

export default sendEmail;
