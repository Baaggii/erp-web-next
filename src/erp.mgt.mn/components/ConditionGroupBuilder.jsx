import React from 'react';

const OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'in', 'not_in', 'contains', 'exists', 'not_exists'];

function parseValueByType(raw, type, operator) {
  if (['in', 'not_in'].includes(operator)) {
    return raw.split(',').map((v) => v.trim()).filter(Boolean);
  }
  if (type === 'number') return Number(raw || 0);
  if (type === 'boolean') return String(raw).toLowerCase() === 'true';
  return raw;
}

export default function ConditionGroupBuilder({ condition, fieldOptions = [], fieldTypes = {}, onChange }) {
  const rules = Array.isArray(condition.rules) ? condition.rules : [];

  const patchRule = (index, key, value) => {
    const next = [...rules];
    next[index] = { ...next[index], [key]: value };
    onChange({ ...condition, rules: next });
  };

  return (
    <div>
      <h3>Condition Builder</h3>
      <label>Logic
        <select value={condition.logic || 'and'} onChange={(e) => onChange({ ...condition, logic: e.target.value })}>
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
      </label>
      {rules.map((rule, idx) => (
        <div key={idx} className="row">
          <select value={rule.field || ''} onChange={(e) => patchRule(idx, 'field', e.target.value)}>
            <option value="">Select field</option>
            {fieldOptions.map((field) => <option key={field} value={field}>{field}</option>)}
          </select>
          <select value={rule.operator || '='} onChange={(e) => patchRule(idx, 'operator', e.target.value)}>
            {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input
            placeholder="value or comma list"
            type={fieldTypes[rule.field] === 'number' ? 'number' : 'text'}
            value={Array.isArray(rule.value) ? rule.value.join(',') : (rule.value ?? '')}
            onChange={(e) => {
              const raw = e.target.value;
              patchRule(idx, 'value', parseValueByType(raw, fieldTypes[rule.field], rule.operator));
            }} />
          <button type="button" onClick={() => onChange({ ...condition, rules: rules.filter((_, ruleIndex) => ruleIndex !== idx) })}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...condition, rules: [...rules, { field: '', operator: '=', value: '' }] })}>Add Condition</button>
    </div>
  );
}
