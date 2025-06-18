export const dashboards = {
  E1: {
    tasks: [
      { id: 1, title: 'Complete sales report', progress: 80, due: '2025-06-30' },
      { id: 2, title: 'Prepare Q2 presentation', progress: 40, due: '2025-06-20' },
    ],
    projects: [
      { id: 1, name: 'ERP Rollout', progress: 50 },
      { id: 2, name: 'Website Redesign', progress: 20 },
    ],
    notifications: [
      { id: 1, message: 'Server maintenance this Friday 7pm.' },
      { id: 2, message: 'Policy review meeting next week.' },
    ],
  },
};

export function getDashboard(empid) {
  return dashboards[empid] || { tasks: [], projects: [], notifications: [] };
}
