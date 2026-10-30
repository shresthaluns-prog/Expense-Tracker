import mongoose from "mongoose";

export function createBudgetService({ BudgetModel, TransactionModel }) {
  async function withSpending(userId, filter = {}, { page, limit } = {}) {
    const ownerId = new mongoose.Types.ObjectId(userId);
    const match = { userId: ownerId, ...filter };
    if (typeof match.categoryId === "string") {
      match.categoryId = new mongoose.Types.ObjectId(match.categoryId);
    }
    if (typeof match._id === "string") {
      match._id = new mongoose.Types.ObjectId(match._id);
    }
    const pipeline = [{ $match: match }, { $sort: { startDate: -1, _id: 1 } }];

    if (page !== undefined && limit !== undefined) {
      pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });
    }

    pipeline.push(
      {
        $lookup: {
          from: TransactionModel.collection.name,
          let: {
            budgetUserId: "$userId",
            budgetCategoryId: "$categoryId",
            budgetCurrency: "$currency",
            budgetStartDate: "$startDate",
            budgetEndDate: "$endDate",
          },
          pipeline: [
            {
              $match: {
                type: "expense",
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$budgetUserId"] },
                    { $eq: ["$currency", "$$budgetCurrency"] },
                    { $gte: ["$date", "$$budgetStartDate"] },
                    { $lt: ["$date", "$$budgetEndDate"] },
                    {
                      $or: [
                        { $eq: ["$$budgetCategoryId", null] },
                        { $eq: ["$categoryId", "$$budgetCategoryId"] },
                      ],
                    },
                  ],
                },
              },
            },
            { $group: { _id: null, spentMinor: { $sum: "$amountMinor" } } },
          ],
          as: "spending",
        },
      },
      {
        $set: {
          spentMinor: { $ifNull: [{ $first: "$spending.spentMinor" }, 0] },
          remainingMinor: {
            $subtract: ["$amountMinor", { $ifNull: [{ $first: "$spending.spentMinor" }, 0] }],
          },
        },
      },
      {
        $set: {
          percentageUsed: {
            $round: [
              { $multiply: [{ $divide: ["$spentMinor", "$amountMinor"] }, 100] },
              2,
            ],
          },
        },
      },
      {
        $set: {
          status: {
            $switch: {
              branches: [
                { case: { $gt: ["$spentMinor", "$amountMinor"] }, then: "over_budget" },
                { case: { $gte: ["$percentageUsed", 80] }, then: "warning" },
              ],
              default: "on_track",
            },
          },
        },
      },
      { $unset: ["spending", "userId"] },
    );

    return BudgetModel.aggregate(pipeline);
  }

  async function getById(userId, budgetId) {
    const [budget] = await withSpending(userId, { _id: new mongoose.Types.ObjectId(budgetId) });
    return budget ?? null;
  }

  return { withSpending, getById };
}
