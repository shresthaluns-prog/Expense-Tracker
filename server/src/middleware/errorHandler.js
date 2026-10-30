export function errorHandler(error, req, res, next) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message:
      statusCode >= 500 && process.env.NODE_ENV === "production"
        ? "Internal server error."
        : error.message,
  });
}
