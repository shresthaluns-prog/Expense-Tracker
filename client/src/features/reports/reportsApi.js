import { apiRequest, queryString } from "../../api/request.js";

export async function fetchReport(values = {}) {
  const result = await apiRequest(`/reports${queryString(values)}`);
  return result.data;
}
