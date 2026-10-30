# Budgets API

All routes require `Authorization: Bearer <access-token>`. The server derives
the owner from that verified token; request bodies do not accept `userId`.

## Money and date rules

`amountMinor`, `spentMinor`, and `remainingMinor` are safe integer values in
the minor unit of the ISO 4217 `currency` (for example, `1234` USD means
USD 12.34). Spending is summed only from this user's `expense` transactions
with the same currency. Income transactions are never counted. A category
budget also matches only the budget's category.

All period dates use UTC calendar days. `startDate` is inclusive and `endDate`
is exclusive; API date strings must be `YYYY-MM-DD`.

- `weekly`: `startDate` is an anchor day; the period is normalized to Monday
  00:00 UTC through the following Monday 00:00 UTC.
- `monthly`: `startDate` is an anchor day; the period is normalized to the
  first day of that UTC month through the first day of the next month.
- `custom`: `startDate` and required `endDate` are the explicit inclusive and
  exclusive UTC boundaries.

Spent totals are calculated with a single MongoDB aggregation `$lookup` for a
list request, not one transaction query per budget. `remainingMinor` may be
negative. `percentageUsed` is rounded to two decimal places and is not capped.
Status is `on_track` below 80%, `warning` from 80% through 100%, and
`over_budget` above 100%. An empty period has zero spend, full remaining
amount, zero percent, and `on_track` status.

## Endpoints

- `GET /api/budgets?page=1&limit=20&periodType=monthly&scope=overall`
- `GET /api/budgets?page=1&limit=20&scope=category&categoryId=<id>`
- `POST /api/budgets`
- `GET /api/budgets/:id`
- `PATCH /api/budgets/:id`
- `DELETE /api/budgets/:id`

List `limit` is capped at 100. Omit `categoryId` for overall budgets; send a
category ID for a category-specific budget. Use `scope=overall` or
`scope=category&categoryId=<id>` to filter by budget scope. Budgets require an active,
expense-type category belonging to the authenticated user. Another user's
budget returns 404 for read, update, and delete.

## Examples

Create a monthly overall budget (any day in March anchors the UTC month):

```http
POST /api/budgets
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "amountMinor": 50000,
  "currency": "USD",
  "periodType": "monthly",
  "startDate": "2026-03-15"
}
```

Create a weekly food budget:

```json
{
  "categoryId": "65f000000000000000000001",
  "amountMinor": 15000,
  "currency": "USD",
  "periodType": "weekly",
  "startDate": "2026-03-11"
}
```

Create a custom period. Here `endDate` is exclusive, so March 10 itself is not
counted:

```json
{
  "amountMinor": 25000,
  "currency": "USD",
  "periodType": "custom",
  "startDate": "2026-03-01",
  "endDate": "2026-03-10"
}
```

The create and read response includes derived usage:

```json
{
  "success": true,
  "data": {
    "_id": "65f000000000000000000002",
    "categoryId": null,
    "amountMinor": 50000,
    "currency": "USD",
    "periodType": "monthly",
    "startDate": "2026-03-01T00:00:00.000Z",
    "endDate": "2026-04-01T00:00:00.000Z",
    "spentMinor": 12345,
    "remainingMinor": 37655,
    "percentageUsed": 24.69,
    "status": "on_track"
  }
}
```

Update a budget amount:

```http
PATCH /api/budgets/65f000000000000000000002
Authorization: Bearer <access-token>
Content-Type: application/json

{ "amountMinor": 60000 }
```

Delete permanently removes only the budget definition; transaction history is
unchanged.
