import { apiRequest, queryString } from "../../api/request.js";

export async function listCategories(values = {}) {
  const result = await apiRequest(`/categories${queryString({ ...values, limit: 100 })}`);
  return result.data;
}

export async function createCategory(values) {
  const result = await apiRequest("/categories", { method: "POST", body: values });
  return result.data;
}

export async function updateCategory(id, values) {
  const result = await apiRequest(`/categories/${id}`, { method: "PATCH", body: values });
  return result.data;
}

export function archiveCategory(id) {
  return apiRequest(`/categories/${id}`, { method: "DELETE" });
}
