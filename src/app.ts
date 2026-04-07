import crypto from "crypto";
import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { requestLogger } from "./middlewares/requestLogger";
import { notFoundHandler } from "./middlewares/notFoundHandler";
import { errorHandler } from "./middlewares/errorHandler";
import swaggerUi from "swagger-ui-express";
import { RegisterRoutes } from "./build/routes";
import swaggerDocument from "./build/swagger.json";
import { PaymentService } from "./services/paymentService";

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

app.use(express.json());
app.use(requestLogger);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

RegisterRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
