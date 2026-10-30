import { Router } from "express";
import { requireAuthenticatedUser } from "../../middleware/requireAuthenticatedUser.js";
import Budget from "../budgets/budget.model.js";
import Transaction from "../expenses/transaction.model.js";
import { createReportService } from "./report.service.js";
import { reportQuerySchema } from "./report.schemas.js";

const reportRouter = Router();
const reportService = createReportService({ TransactionModel: Transaction, BudgetModel: Budget });
reportRouter.use(requireAuthenticatedUser);

reportRouter.get("/", (req, res, next) => {
  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Request validation failed.",
      issues: parsed.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
    });
  }

  reportService
    .getReport(req.authUser.id, parsed.data)
    .then((data) => res.json({ success: true, data }))
    .catch(next);
});

export default reportRouter;
