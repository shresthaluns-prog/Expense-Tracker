# Data model conventions

Every financial document (`Category`, `Transaction`, and `Budget`) has a required
`userId` reference to its owner. Queries and writes must still include the
authenticated user's ID; a schema reference does not enforce authorization or
that a referenced category belongs to that same user.

Transactions persist an `income` or `expense` type that must match the selected
category. The API validates both category ownership and matching type on create
and update. Categories referenced by transactions are archived rather than
hard-deleted, retaining their historical transaction references.

The authenticated API exposes `GET`, `POST`, `GET /:id`, `PATCH /:id`, and
`DELETE /:id` for both `/api/categories` and `/api/transactions`. List endpoints
accept `page` and `limit` (maximum 100), with category `type`/`search` and
transaction `type`/`categoryId`/`startDate`/`endDate`/`search` filters. Date-only
transaction range endpoints include the entire end date. Deleted categories
are archived and omitted from normal category lists; pass
`includeArchived=true` to include them.

`amountMinor` is a positive, safe integer in the smallest accounting unit for
the record's ISO 4217 `currency`, avoiding floating-point money values. For
example, `1234` with `USD` means USD 12.34. Currency exponents vary, so callers
must interpret the amount using the currency code (for example, JPY generally
has no fractional minor unit). Defaults use USD but can be overridden.

Budgets use a half-open-by-convention date interval with `startDate` inclusive
and `endDate` exclusive. A missing `categoryId` (`null`) represents an overall
budget; a category ID represents a category-specific budget. Unique indexes
prevent duplicate users/categories and duplicate budget windows after indexes
have been built. MongoDB TTL deletion of expired refresh sessions is
asynchronous; authentication code must check `expiresAt` and `revokedAt` on
every use.
