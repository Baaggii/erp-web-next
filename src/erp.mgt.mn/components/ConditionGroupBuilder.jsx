import React from 'react';

const OPERATORS_BY_TYPE = {
  number: ['>', '<', '>=', '<=', '='],
  string: ['=', 'contains', 'starts_with', 'in'],
  boolean: ['=', '!='],
  array: ['contains', 'in', 'not_in'],
  date: ['>', '<', '>=', '<=', '='],
  default: ['=', '!=', 'in', 'not_in', 'contains', 'exists', 'not_exists'],
};

function parseValueByType(raw, type, operator) {
  if (['in', 'not_in'].includes(operator)) {
    return raw.split(',').map((v) => v.trim()).filter(Boolean);
  }
  if (type === 'number' || type === 'date') return Number(raw || 0);
  if (type === 'boolean') return String(raw).toLowerCase() === 'true';
  return raw;
}

function operatorOptionsForType(type) {
  return OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.default;
}

export default function ConditionGroupBuilder({ condition, fields = [], fieldTypes = {}, onChange }) {
  const rules = Array.isArray(condition.rules) ? condition.rules : [];
  const fieldOptions = fields.map((entry) => entry.path);

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
      {rules.map((rule, idx) => {
        const type = fieldTypes[rule.field] || 'default';
        const operatorOptions = operatorOptionsForType(type);
        return (
          <div key={idx} className="row">
            <select value={rule.field || ''} onChange={(e) => patchRule(idx, 'field', e.target.value)}>
              <option value="">Select field</option>
              {fieldOptions.map((field) => <option key={field} value={field}>{field}</option>)}
            </select>
            <select value={rule.operator || operatorOptions[0]} onChange={(e) => patchRule(idx, 'operator', e.target.value)}>
              {operatorOptions.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
            <input
              placeholder="value or comma list"
              type={type === 'number' ? 'number' : 'text'}
              value={Array.isArray(rule.value) ? rule.value.join(',') : (rule.value ?? '')}
              onChange={(e) => {
                const raw = e.target.value;
                patchRule(idx, 'value', parseValueByType(raw, type, rule.operator));
              }} />
            <button type="button" onClick={() => onChange({ ...condition, rules: rules.filter((_, ruleIndex) => ruleIndex !== idx) })}>Remove</button>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange({ ...condition, rules: [...rules, { field: '', operator: '=', value: '' }] })}>Add Condition</button>
    </div>
  );
}
