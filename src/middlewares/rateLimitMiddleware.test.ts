import express from "express";
import request from "supertest";
import { perUserRateLimit } from "./rateLimitMiddleware";

function buildApp(max: number) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { userId: "user-1" };
    next();
  });
  app.use(
    perUserRateLimit({ windowMs: 60_000, max, message: "Too many requests" }),
  );
  app.get("/ping", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("perUserRateLimit", () => {
  it("allows requests up to the limit, then returns 429 for the same user", async () => {
    const app = buildApp(3);

    const first = await request(app).get("/ping");
    const second = await request(app).get("/ping");
    const third = await request(app).get("/ping");
    const fourth = await request(app).get("/ping");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(fourth.status).toBe(429);
    expect(fourth.body).toEqual({ success: false, message: "Too many requests" });
  });
});
