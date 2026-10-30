import { Router } from "express";
import Category from "../categories/category.model.js";
import { requireAuthenticatedUser } from "../../middleware/requireAuthenticatedUser.js";
import Transaction from "./transaction.model.js";
import {
  createTransactionSchema,
  listTransactionsSchema,
  transactionIdSchema,
  updateTransactionSchema,
} from "./transaction.schemas.js";

const transactionRouter = Router();
transactionRouter.use(requireAuthenticatedUser);

function validate(schema, source = "body") {
  return (req, res, next) => {
    const input = source === "params" ? req.params.id : req[source];
    const result = schema.safeParse(input);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Request validation failed.",
        issues: result.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
      });
    }
    req.validated = { ...(req.validated ?? {}), [source]: result.data };
    next();
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicTransaction(transaction) {
  const result = transaction.toObject ? transaction.toObject() : { ...transaction };
  delete result.userId;
  return result;
}

async function findOwnedActiveCategory(userId, categoryId) {
  return Category.findOne({ _id: categoryId, userId, isArchived: false });
}

function handleValidationOrDuplicate(error, res, next) {
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({ success: false, message: "Transaction validation failed." });
  }
  next(error);
}

transactionRouter
  .route("/")
  .get(validate(listTransactionsSchema, "query"), async (req, res, next) => {
    try {
      const { type, categoryId, startDate, endDate, search, page, limit } = req.validated.query;
      const filter = { userId: req.authUser.id };
      if (type) filter.type = type;
      if (categoryId) filter.categoryId = categoryId;
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = startDate;
        if (endDate) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)) {
            const exclusiveEndDate = new Date(endDate);
            exclusiveEndDate.setUTCDate(exclusiveEndDate.getUTCDate() + 1);
            filter.date.$lt = exclusiveEndDate;
          } else {
            filter.date.$lte = endDate;
          }
        }
      }
      if (search) filter.note = { $regex: escapeRegex(search), $options: "i" };

      const [transactions, total] = await Promise.all([
        Transaction.find(filter)
          .sort({ date: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .populate({
            path: "categoryId",
            match: { userId: req.authUser.id },
            select: "name type color",
          }),
        Transaction.countDocuments(filter),
      ]);
      res.json({
        success: true,
        data: transactions.map(publicTransaction),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  })
  .post(validate(createTransactionSchema), async (req, res, next) => {
    try {
      const { categoryId, type, ...values } = req.validated.body;
      const category = await findOwnedActiveCategory(req.authUser.id, categoryId);
      if (!category) {
        return res.status(404).json({ success: false, message: "Category not found." });
      }
      if (category.type !== type) {
        return res.status(400).json({ success: false, message: "Transaction type must match its category type." });
      }

      const transaction = await Transaction.create({
        ...values,
        categoryId: category._id,
        type,
        userId: req.authUser.id,
      });
      await transaction.populate({
        path: "categoryId",
        match: { userId: req.authUser.id },
        select: "name type color",
      });
      res.status(201).json({ success: true, data: publicTransaction(transaction) });
    } catch (error) {
      handleValidationOrDuplicate(error, res, next);
    }
  });

transactionRouter
  .route("/:id")
  .all(validate(transactionIdSchema, "params"))
  .get(async (req, res, next) => {
    try {
      const transaction = await Transaction.findOne({
        _id: req.validated.params,
        userId: req.authUser.id,
      }).populate({
        path: "categoryId",
        match: { userId: req.authUser.id },
        select: "name type color",
      });
      if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found." });
      res.json({ success: true, data: publicTransaction(transaction) });
    } catch (error) {
      next(error);
    }
  })
  .patch(validate(updateTransactionSchema), async (req, res, next) => {
    try {
      const transaction = await Transaction.findOne({
        _id: req.validated.params,
        userId: req.authUser.id,
      });
      if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found." });

      const updates = req.validated.body;
      const categoryId = updates.categoryId ?? transaction.categoryId.toString();
      const type = updates.type ?? transaction.type;
      const category = await findOwnedActiveCategory(req.authUser.id, categoryId);
      if (!category) return res.status(404).json({ success: false, message: "Category not found." });
      if (category.type !== type) {
        return res.status(400).json({ success: false, message: "Transaction type must match its category type." });
      }

      Object.assign(transaction, updates, { categoryId: category._id, type });
      await transaction.save();
      await transaction.populate({
        path: "categoryId",
        match: { userId: req.authUser.id },
        select: "name type color",
      });
      res.json({ success: true, data: publicTransaction(transaction) });
    } catch (error) {
      handleValidationOrDuplicate(error, res, next);
    }
  })
  .delete(async (req, res, next) => {
    try {
      const transaction = await Transaction.findOneAndDelete({
        _id: req.validated.params,
        userId: req.authUser.id,
      });
      if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found." });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

export default transactionRouter;
