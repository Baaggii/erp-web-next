import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'config', 'posTransactions.json');

async function readData() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeData(arr) {
  await fs.writeFile(filePath, JSON.stringify(arr, null, 2));
}

export async function addTransaction(name, data) {
  const list = await readData();
  const rec = { id: 'post_' + Date.now().toString(36), name, data, postedAt: new Date().toISOString() };
  list.push(rec);
  await writeData(list);
  return rec;
}
