// Local dev server for /api/analyze. Bypasses `vercel dev` so env loads cleanly
// from .env.local via the --env-file flag in package.json.
//
// Run: npm run dev:api

import { createServer } from "node:http";
import handler from "../api/analyze.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const PORT = Number(process.env.PORT ?? 3000);

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (rawReq, rawRes) => {
  // CORS for local Vite dev (port 5173)
  rawRes.setHeader("Access-Control-Allow-Origin", "*");
  rawRes.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  rawRes.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (rawReq.method === "OPTIONS") {
    rawRes.writeHead(204).end();
    return;
  }

  if (rawReq.url !== "/api/analyze") {
    rawRes.writeHead(404, { "Content-Type": "application/json" });
    rawRes.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const bodyText = await readBody(rawReq);
  let parsedBody: unknown = undefined;
  if (bodyText.length > 0) {
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      rawRes.writeHead(400, { "Content-Type": "application/json" });
      rawRes.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
  }

  // Shim a minimal VercelRequest/VercelResponse on top of Node's req/res.
  const req = Object.assign(rawReq, { body: parsedBody, query: {}, cookies: {} }) as unknown as VercelRequest;
  const res = Object.assign(rawRes, {
    status(code: number) {
      rawRes.statusCode = code;
      return res;
    },
    json(obj: unknown) {
      rawRes.setHeader("Content-Type", "application/json");
      rawRes.end(JSON.stringify(obj));
      return res;
    },
    send(body: unknown) {
      rawRes.end(typeof body === "string" ? body : JSON.stringify(body));
      return res;
    },
  }) as unknown as VercelResponse;

  try {
    await handler(req, res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!rawRes.writableEnded) {
      rawRes.writeHead(500, { "Content-Type": "application/json" });
      rawRes.end(JSON.stringify({ error: "Handler threw", detail: msg }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`/api/analyze listening on http://localhost:${PORT}/api/analyze`);
  console.log(`  VOYAGE_API_KEY:    ${process.env.VOYAGE_API_KEY ? "loaded" : "MISSING"}`);
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "loaded" : "MISSING"}`);
});
