import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { db, migrate } from "./db/index.js";
import { runDetection } from "./engine/runDetection.js";
import { agentsRouter } from "./routes/agents.js";
import { alertsRouter } from "./routes/alerts.js";
import { miscRouter } from "./routes/misc.js";
import { observeApiRequest } from "./observability.js";
import { liveFeedRouter } from "./routes/liveFeed.js";
import { liveTransactionStream } from "./simulation/liveTransactionStream.js";
import { startOpenAiAdvisor } from "./ai/openaiAdvisor.js";
import { ensureDemoUsers } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { planningRouter } from "./routes/planning.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  // Node 24's built-in .env loader keeps local secrets out of source code.
  loadEnvFile(path.resolve(__dirname, "../.env"));
} catch {
  // .env is optional; deployment environments can provide process variables.
}

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "127.0.0.1";
const clientDist = path.resolve(__dirname, "../../client/dist");

migrate();

const agentCount = (db.prepare("SELECT COUNT(*) AS n FROM agents").get() as { n: number }).n;
if (agentCount === 0) {
  console.warn("Database is empty — run `npm run seed` first, then restart.");
} else {
  ensureDemoUsers();
  const alertCount = (db.prepare("SELECT COUNT(*) AS n FROM alerts").get() as { n: number }).n;
  if (alertCount === 0) {
    // First boot after a bare seed: populate alerts. Never re-run automatically
    // afterwards, so acknowledgements/escalations survive server restarts.
    const n = runDetection();
    console.log(`Detection pass produced ${n} alerts.`);
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", observeApiRequest);

app.use("/api/auth", authRouter);
app.use("/api", miscRouter);
app.use("/api/planning", planningRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/live-feed", liveFeedRouter);

// Production/LAN mode: one server delivers both the API and the built React app.
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  // In development Vite serves the UI separately. Make the API root useful
  // when it is opened accidentally instead of returning Express's Cannot GET /.
  app.get("/", (_req, res) => res.redirect("http://localhost:5173"));
}

// Errors retain a trace ID in logs and the response; no internal stack is sent
// to a user-facing client.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const traceId = String(res.getHeader("x-trace-id") ?? "untraced");
  console.error(
    JSON.stringify({
      event: "api_error",
      traceId,
      method: req.method,
      route: `${req.baseUrl}${req.path}`,
      error: err instanceof Error ? err.message : String(err),
    })
  );
  res.status(500).json({ error: "Unexpected server error.", traceId });
});

app.listen(PORT, HOST, () => {
  const address = HOST === "0.0.0.0" ? `http://<this-PC-IP>:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`CashLens is listening on ${address}`);
  liveTransactionStream.start();
  startOpenAiAdvisor();
  console.log("Live synthetic transaction stream started (SSE: /api/live-feed/stream).");
});
