import fs from 'fs/promises';
import { resolveDataPath } from '../utils/dataPaths.js';
import { getResponse } from '../utils/openaiClient.js';

export async function fetchDashboard(empid, companyId) {
  let data;
  try {
    const filePath = await resolveDataPath('dashboard.json', companyId);
    const fileData = await fs.readFile(filePath, 'utf8');
    const dashboards = JSON.parse(fileData || '{}');
    data = dashboards[empid] || { tasks: [], projects: [], notifications: [] };
  } catch {
    data = { tasks: [], projects: [], notifications: [] };
  }

  try {
    const prompt = `Summarize these tasks, projects and notifications: ${JSON.stringify(data)}`;
    const summary = await getResponse(prompt);
    return { ...data, summary };
  } catch {
    return { ...data, summary: null };
  }
}
