import mongoose from "mongoose";
import app from "./app.js";
import { connectToDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function startServer() {
  await connectToDatabase();

  const server = app.listen(env.port, () => {
    console.info(`API listening on port ${env.port}.`);
  });

  let isShuttingDown = false;
  const shutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.info(`${signal} received; shutting down.`);

    server.close((error) => {
      if (error) {
        console.error("Failed to close the HTTP server cleanly.", error);
        process.exitCode = 1;
      }

      mongoose
        .disconnect()
        .then(() => {
          process.exit(process.exitCode ?? 0);
        })
        .catch((disconnectError) => {
          console.error("Failed to disconnect from MongoDB cleanly.", disconnectError);
          process.exit(1);
        });
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error) => {
  console.error("Failed to start the API server.", error);
  process.exitCode = 1;
});
