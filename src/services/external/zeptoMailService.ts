import axios from "axios";

// Interface for the data you want to inject into the email
// e.g. { "name": "John", "amount": "50,000" }
interface EmailMergeTags {
  [key: string]: string | number | boolean;
}

interface EmailRecipient {
  email: string;
  name?: string;
}

export class ZeptoMailService {
  private client;
  private fromAddress: string;
  private fromName: string;

  constructor() {
    this.fromAddress =
      process.env.ZEPTOMAIL_FROM_EMAIL || "noreply@urbannesttech.com";
    this.fromName = process.env.ZEPTOMAIL_FROM_NAME || "Urbannest";

    this.client = axios.create({
      baseURL:
        process.env.ZEPTOMAIL_BASE_URL || "https://api.zeptomail.com/v1.1",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `${process.env.ZEPTOMAIL_API_KEY}`,
      },
    });
  }

  /**
   * Send an Email using a Template created on ZeptoMail Portal
   * @param to - Recipient(s)
   * @param templateKey - The unique key from ZeptoMail dashboard (e.g. "2d6f.56...")
   * @param mergeVariables - Data to fill placeholders (e.g. { name: "John", link: "..." })
   */
  public async sendTemplateEmail(
    to: EmailRecipient | EmailRecipient[],
    templateKey: string,
    mergeVariables?: EmailMergeTags,
  ) {
    const recipients = Array.isArray(to) ? to : [to];

    // Map to ZeptoMail 'to' format
    const formattedRecipients = recipients.map((r) => ({
      email_address: {
        address: r.email,
        name: r.name || r.email.split("@")[0],
      },
    }));

    try {
      // NOTE: We use the /email/template endpoint (or /email with template_key depending on API version)
      // Standard ZeptoMail Template Payload:
      const payload = {
        from: {
          address: this.fromAddress,
          name: this.fromName,
        },
        to: formattedRecipients,
        template_key: templateKey, // <--- Tells Zepto which design to use
        merge_info: mergeVariables, // <--- Fills the {{name}} {{amount}} tags

        // Tracking options
        track_clicks: true,
        track_opens: true,
      };

      const response = await this.client.post("/email/template", payload);

      return { success: true, message: "Email queued successfully" };
    } catch (error: any) {
      console.error(
        "ZeptoMail Error:",
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      // We don't throw here to avoid breaking the main flow (e.g. don't fail a payment just because email failed)
      return { success: false, error: error.message };
    }
  }
}
