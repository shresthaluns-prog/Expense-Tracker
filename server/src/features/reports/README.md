# Analytics API

`GET /api/reports` requires an access token. Transaction aggregation is scoped
to the authenticated user; owner IDs are never accepted in query parameters.

## Date, timezone, and currency behavior

`startDate` and `endDate` are optional date-only values in `YYYY-MM-DD` form.
Provide both or neither. `timezone` is an optional IANA timezone identifier
(defaults to `UTC`). Date boundaries are local midnight in that timezone,
converted to UTC instants for MongoDB filtering. `endDate` is inclusive. DST
transitions are respected, so a local calendar day may be 23 or 25 hours.
Explicit ranges may cover at most 366 calendar days.

If dates are omitted, the report covers the first day of the current month five
months ago through today, using the requested timezone.

Optionally pass an ISO 4217 `currency` code to filter results. Without this
filter, totals and charts are grouped separately by currency; currencies are
never added together or converted. `amountMinor` is in the currency's minor
unit, such as `1234` USD = USD 12.34.

## Endpoint and response

```http
GET /api/reports?startDate=2026-03-01&endDate=2026-03-31&timezone=America%2FLos_Angeles&currency=USD
Authorization: Bearer <access-token>
```

```json
{
  "success": true,
  "data": {
    "period": {
      "startDate": "2026-03-01",
      "endDate": "2026-03-31",
      "timezone": "America/Los_Angeles"
    },
    "summary": [
      { "currency": "USD", "type": "expense", "amountMinor": 3500, "transactionCount": 2 },
      { "currency": "USD", "type": "income", "amountMinor": 5000, "transactionCount": 1 }
    ],
    "totals": [
      {
        "currency": "USD",
        "incomeMinor": 5000,
        "expensesMinor": 3500,
        "netCashFlowMinor": 1500,
        "savingsRate": 30,
        "transactionCount": 3
      }
    ],
    "monthly": [
      { "month": "2026-03", "currency": "USD", "type": "income", "amountMinor": 5000, "transactionCount": 1 },
      { "month": "2026-03", "currency": "USD", "type": "expense", "amountMinor": 3500, "transactionCount": 2 }
    ],
    "trends": [
      {
        "month": "2026-03",
        "currency": "USD",
        "incomeMinor": 5000,
        "expensesMinor": 3500,
        "netCashFlowMinor": 1500,
        "savingsRate": 30,
        "transactionCount": 3
      }
    ],
    "categories": [
      {
        "categoryId": "65f000000000000000000001",
        "currency": "USD",
        "name": "Food",
        "color": "#123456",
        "amountMinor": 3500,
        "transactionCount": 2
      }
    ],
    "categoryTotals": [
      {
        "categoryId": "65f000000000000000000001",
        "currency": "USD",
        "type": "expense",
        "name": "Food",
        "color": "#123456",
        "amountMinor": 3500,
        "transactionCount": 2
      }
    ],
    "payments": [
      { "currency": "USD", "method": "card", "amountMinor": 2500, "transactionCount": 1 }
    ],
    "budgets": [
      {
        "_id": "65f000000000000000000002",
        "categoryId": null,
        "currency": "USD",
        "amountMinor": 10000,
        "spentMinor": 3500,
        "remainingMinor": 6500,
        "percentageUsed": 35,
        "status": "on_track"
      }
    ]
  }
}
```

`totals` and `trends` are grouped by currency. `savingsRate` is
`(incomeMinor - expensesMinor) / incomeMinor * 100`; it is zero when income is
zero and may be negative. `monthly` and `trends` contain zero-valued records
for empty months for every currency represented in the selected range. Month
labels and bucketing use the requested timezone. An entirely empty range
returns empty currency arrays because no currency can be inferred.

`categories` contains expense-only totals for the existing reports UI.
`categoryTotals` includes both income and expense categories. Category names
and colors are joined only from categories owned by the authenticated user;
archived or missing category documents use a safe label and neutral color.

`budgets` contains this user's budgets whose periods overlap the report range.
Usage is calculated for each budget's entire stored period using the existing
budget aggregation; it is not prorated to the report range. An optional
currency filter applies to budgets too.

The analytics use one MongoDB aggregation with facets for transaction totals,
monthly trends, category totals, and payment methods. Budget progress reuses
the budget service aggregation, which joins matching transactions without
per-budget queries.
