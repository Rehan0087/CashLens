import { Router } from "express";
import { liveTransactionStream } from "../simulation/liveTransactionStream.js";

export const liveFeedRouter = Router();

liveFeedRouter.get("/snapshot", (_req, res) => {
  res.json(liveTransactionStream.snapshot());
});

liveFeedRouter.get("/stream", (req, res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: Parameters<typeof liveTransactionStream.subscribe>[0] extends (event: infer T) => void ? T : never) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const unsubscribe = liveTransactionStream.subscribe(send);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

liveFeedRouter.post("/control", (req, res) => {
  const action = req.body?.action;
  if (action === "pause") liveTransactionStream.setPaused(true);
  else if (action === "resume") liveTransactionStream.setPaused(false);
  else if (action === "inject_liquidity_drain") liveTransactionStream.injectLiquidityDrain();
  else if (action === "inject_anomaly_attack") liveTransactionStream.injectAnomalyAttack();
  else return res.status(400).json({ error: "Unknown live-feed action." });

  res.json({ ok: true, snapshot: liveTransactionStream.snapshot() });
});
