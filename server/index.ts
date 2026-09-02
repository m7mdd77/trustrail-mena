import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApiApp } from "./app.js";
import { getRuntimeMode } from "./nokia.js";

const app = createApiApp();
const port = Number(process.env.PORT ?? 4173);
const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const host = process.env.HOST ?? (isProduction ? "0.0.0.0" : "127.0.0.1");

if (!isProduction) {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const clientDirectory = path.resolve(directory, "../dist/client");
  app.use(express.static(clientDirectory));
  app.get("/*splat", (_request, response) => {
    response.sendFile(path.join(clientDirectory, "index.html"));
  });
}

app.listen(port, host, () => {
  console.log(`TrustRail MENA is running on ${host}:${port}`);
  console.log(`Network mode: ${getRuntimeMode()}`);
});
