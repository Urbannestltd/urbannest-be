import axios from "axios";

interface EmailMergeTags {
  [key: string]: string | number | boolean;
}

interface EmailRecipient {
  email: string;
  name?: string;
}

const RETRY_DELAYS = [0, 1000, 2000]; // ms to wait before each attempt (attempt 0 = immediate)

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
      timeout: 10_000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `${process.env.ZEPTOMAIL_API_KEY}`,
      },
    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (RETRY_DELAYS[attempt]! > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const nextDelay = RETRY_DELAYS[attempt + 1];
        if (nextDelay !== undefined) {
          console.warn(
            `ZeptoMail attempt ${attempt + 1} failed, retrying in ${nextDelay}ms...`,
          );
        }
      }
    }
    throw lastError;
  }

  /**
   * Send an Email using a Template created on ZeptoMail Portal
   */
  public async sendTemplateEmail(
    to: EmailRecipient | EmailRecipient[],
    templateKey: string,
    mergeVariables?: EmailMergeTags,
  ) {
    const formattedRecipients = (Array.isArray(to) ? to : [to]).map((r) => ({
      email_address: {
        address: r.email,
        name: r.name || r.email.split("@")[0],
      },
    }));

    try {
      await this.withRetry(() =>
        this.client.post("/email/template", {
          from: { address: this.fromAddress, name: this.fromName },
          to: formattedRecipients,
          template_key: templateKey,
          merge_info: mergeVariables,
          track_clicks: true,
          track_opens: true,
        }),
      );

      return { success: true, message: "Email queued successfully" };
    } catch (error: any) {
      console.error(
        "ZeptoMail Error:",
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a transactional email with a custom HTML body.
   * Use this with the template functions in src/config/emailTemplates.ts.
   */
  public async sendEmail(
    to: EmailRecipient | EmailRecipient[],
    subject: string,
    html: string,
  ) {
    const formattedRecipients = (Array.isArray(to) ? to : [to]).map((r) => ({
      email_address: {
        address: r.email,
        name: r.name || r.email.split("@")[0],
      },
    }));

    try {
      await this.withRetry(() =>
        this.client.post("/email", {
          from: { address: this.fromAddress, name: this.fromName },
          to: formattedRecipients,
          subject,
          htmlbody: html,
          track_clicks: true,
          track_opens: true,
        }),
      );

      return { success: true };
    } catch (error: any) {
      console.error(
        "ZeptoMail Error:",
        JSON.stringify(error.response?.data || error.message, null, 2),
      );
      return { success: false, error: error.message };
    }
  }
}

// Singleton — import this instead of constructing a new instance per service
export const zeptoMailService = new ZeptoMailService();
