import { Router } from "express";
import mongoose from "mongoose";

const healthRouter = Router();

healthRouter.get("/", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,
    status: databaseConnected ? "ok" : "unavailable",
    database: databaseConnected ? "connected" : "disconnected",
  });
});

export default healthRouter;
