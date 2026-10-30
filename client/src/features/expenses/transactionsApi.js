import { apiRequest, queryString } from "../../api/request.js";

export async function listTransactions(values = {}) {
  const result = await apiRequest(`/transactions${queryString(values)}`);
  return { data: result.data, pagination: result.pagination };
}

export async function createTransaction(values) {
  const result = await apiRequest("/transactions", { method: "POST", body: values });
  return result.data;
}

export async function updateTransaction(id, values) {
  const result = await apiRequest(`/transactions/${id}`, { method: "PATCH", body: values });
  return result.data;
}

export function deleteTransaction(id) {
  return apiRequest(`/transactions/${id}`, { method: "DELETE" });
}
