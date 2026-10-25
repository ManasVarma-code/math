import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    const response = await fetch(`${process.env.MATH_SERVICE_URL ?? `http://127.0.0.1:${process.env.MATH_SERVICE_PORT ?? 8765}`}/healthz`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error("Math service unavailable");
    res.json(HealthCheckResponse.parse({ status: "Math engine ready" }));
  } catch {
    res.status(503).json({ error: "Math service is unavailable. Check the API terminal." });
  }
});

export default router;
