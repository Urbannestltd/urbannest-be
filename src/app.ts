import crypto from "crypto";
import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { requestLogger } from "./middlewares/requestLogger";
import { activityLoggerMiddleware } from "./middlewares/activityLoggerMiddleware";
import { notFoundHandler } from "./middlewares/notFoundHandler";
import { errorHandler } from "./middlewares/errorHandler";
import swaggerUi from "swagger-ui-express";
import { RegisterRoutes } from "./build/routes";
import swaggerDocument from "./build/swagger.json";
import { PaymentService } from "./services/paymentService";
import { ReminderWorker } from "./services/workers/reminderWorker";
import { WalkInTimeoutWorker } from "./services/workers/walkInTimeoutWorker";
import { NoShowWorker } from "./services/workers/noShowWorker";

const app: Application = express();

app.use(cors());
app.use(helmet());

// ============================================================
// PAYSTACK WEBHOOK
// Must be registered BEFORE express.json() so we can read
// the raw body to verify the Paystack HMAC-SHA512 signature.
// ============================================================
app.post(
  "/payments/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const signature = req.headers["x-paystack-signature"];
    const secret = process.env.PAYSTACK_SECRET_KEY || "";

    const hash = crypto
      .createHmac("sha512", secret)
      .update(req.body)
      .digest("hex");

    if (hash !== signature) {
      res.status(400).json({ message: "Invalid signature" });
      return;
    }

    let event: { event: string; data: { reference: string } };
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      res.status(400).json({ message: "Invalid payload" });
      return;
    }

    if (event.event === "charge.success") {
      const paymentService = new PaymentService();
      try {
        await paymentService.verifyPayment(event.data.reference);
      } catch (err: any) {
        // Log but respond 200 — Paystack retries on 5xx, not on business errors
        console.error(`[Webhook] verifyPayment failed: ${err.message}`);
      }
    }

    res.status(200).json({ received: true });
  },
);

app.use(express.json({ limit: "10mb" }));
app.use(requestLogger);
app.use(activityLoggerMiddleware);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ============================================================
// VERCEL CRON ENDPOINTS
// Called by Vercel on a schedule. Protected by CRON_SECRET.
// ============================================================
function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  return true;
}

app.get("/cron/reminders", async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    await new ReminderWorker().processDueReminders();
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Cron] reminders failed:", err.message);
    res.status(500).json({ ok: false });
  }
});

app.get("/cron/walk-in-timeout", async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    await new WalkInTimeoutWorker().processExpiredWalkIns();
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Cron] walk-in-timeout failed:", err.message);
    res.status(500).json({ ok: false });
  }
});

app.get("/cron/no-show", async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    await new NoShowWorker().processNoShows();
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Cron] no-show failed:", err.message);
    res.status(500).json({ ok: false });
  }
});

RegisterRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
