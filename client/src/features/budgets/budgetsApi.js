import { apiRequest, queryString } from "../../api/request.js";

export async function listBudgets(values = {}) {
  const result = await apiRequest(`/budgets${queryString({ ...values, limit: 100 })}`);
  return result.data;
}

export async function createBudget(values) {
  const result = await apiRequest("/budgets", { method: "POST", body: values });
  return result.data;
}

export async function updateBudget(id, values) {
  const result = await apiRequest(`/budgets/${id}`, { method: "PATCH", body: values });
  return result.data;
}

export function deleteBudget(id) {
  return apiRequest(`/budgets/${id}`, { method: "DELETE" });
}
