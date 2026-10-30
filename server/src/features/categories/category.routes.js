import { Router } from "express";
import Category from "./category.model.js";
import Transaction from "../expenses/transaction.model.js";
import { requireAuthenticatedUser } from "../../middleware/requireAuthenticatedUser.js";
import {
  categoryIdSchema,
  createCategorySchema,
  listCategoriesSchema,
  updateCategorySchema,
} from "./category.schemas.js";

const categoryRouter = Router();
categoryRouter.use(requireAuthenticatedUser);

function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(source === "params" ? req.params.id : req[source]);
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

function duplicateCategoryError(error) {
  return error?.code === 11000;
}

function publicCategory(category) {
  const result = category.toObject ? category.toObject() : { ...category };
  delete result.userId;
  return result;
}

categoryRouter
  .route("/")
  .get(validate(listCategoriesSchema, "query"), async (req, res, next) => {
    try {
      const { type, search, includeArchived, page, limit } = req.validated.query;
      const filter = { userId: req.authUser.id };
      if (type) filter.type = type;
      if (includeArchived !== "true") filter.isArchived = false;
      if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

      const [categories, total] = await Promise.all([
        Category.find(filter)
          .sort({ type: 1, name: 1, _id: 1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Category.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: categories.map(publicCategory),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  })
  .post(validate(createCategorySchema), async (req, res, next) => {
    try {
      const category = await Category.create({
        ...req.validated.body,
        userId: req.authUser.id,
      });
      res.status(201).json({ success: true, data: publicCategory(category) });
    } catch (error) {
      if (duplicateCategoryError(error)) {
        return res.status(409).json({ success: false, message: "A category with this name and type already exists." });
      }
      next(error);
    }
  });

categoryRouter
  .route("/:id")
  .all(validate(categoryIdSchema, "params"))
  .get(async (req, res, next) => {
    try {
      const category = await Category.findOne({
        _id: req.validated.params,
        userId: req.authUser.id,
        isArchived: false,
      });
      if (!category) return res.status(404).json({ success: false, message: "Category not found." });
      res.json({ success: true, data: publicCategory(category) });
    } catch (error) {
      next(error);
    }
  })
  .patch(validate(updateCategorySchema), async (req, res, next) => {
    try {
      const category = await Category.findOne({
        _id: req.validated.params,
        userId: req.authUser.id,
        isArchived: false,
      });
      if (!category) return res.status(404).json({ success: false, message: "Category not found." });

      if (req.validated.body.type && req.validated.body.type !== category.type) {
        const hasTransactions = await Transaction.exists({
          userId: req.authUser.id,
          categoryId: category._id,
        });
        if (hasTransactions) {
          return res.status(409).json({
            success: false,
            message: "A category with transactions cannot change type.",
          });
        }
      }

      Object.assign(category, req.validated.body);
      await category.save();
      res.json({ success: true, data: publicCategory(category) });
    } catch (error) {
      if (duplicateCategoryError(error)) {
        return res.status(409).json({ success: false, message: "A category with this name and type already exists." });
      }
      next(error);
    }
  })
  .delete(async (req, res, next) => {
    try {
      const category = await Category.findOneAndUpdate(
        { _id: req.validated.params, userId: req.authUser.id, isArchived: false },
        { $set: { isArchived: true } },
        { returnDocument: "after", runValidators: true },
      );
      if (!category) return res.status(404).json({ success: false, message: "Category not found." });
      res.json({ success: true, archived: true, data: publicCategory(category) });
    } catch (error) {
      next(error);
    }
  });

export default categoryRouter;
