import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import authRouter from "./features/auth/auth.routes.js";
import categoryRouter from "./features/categories/category.routes.js";
import transactionRouter from "./features/expenses/transaction.routes.js";
import budgetRouter from "./features/budgets/budget.routes.js";
import reportRouter from "./features/reports/report.routes.js";
import healthRouter from "./routes/health.routes.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: env.clientOrigins,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/transactions", transactionRouter);
app.use("/api/budgets", budgetRouter);
app.use("/api/reports", reportRouter);
app.use(notFound);
app.use(errorHandler);

export default app;
