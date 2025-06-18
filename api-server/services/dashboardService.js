import { getDashboard } from '../data/dashboard.js';
import { getResponse } from '../utils/openaiClient.js';

export async function fetchDashboard(empid) {
  const data = getDashboard(empid);
  try {
    const prompt = `Summarize these tasks, projects and notifications: ${JSON.stringify(data)}`;
    const summary = await getResponse(prompt);
    return { ...data, summary };
  } catch {
    return { ...data, summary: null };
  }
}
