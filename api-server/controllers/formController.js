import { listForms } from '../../db/index.js';

export async function getFormSchemas(req, res, next) {
  try {
    const forms = await listForms();
    const schemas = forms.map(f => ({
      id: f.id,
      name: f.name,
      schema: typeof f.schema_json === 'string' ? JSON.parse(f.schema_json) : f.schema_json,
    }));
    res.json(schemas);
  } catch (err) {
    next(err);
  }
}
