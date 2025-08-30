import React from 'react';
import Form from '@rjsf/core';
import TooltipWrapper from '../components/TooltipWrapper.jsx';
import { useTranslation } from 'react-i18next';

export default function FormRenderer({ schema, uiSchema = {}, formData, onSubmit }) {
  const { t } = useTranslation('tooltip');

  const FieldTemplate = (props) => {
    const { id, label, required, children, errors, help, description, name } = props;
    const title = t(name, { ns: 'tooltip', defaultValue: label });
    return (
      <TooltipWrapper title={title}>
        <div className="mb-3">
          <label htmlFor={id} className="block font-medium">
            {label}
            {required && <span className="text-red-500">*</span>}
          </label>
          {description}
          {children}
          {errors}
          {help}
        </div>
      </TooltipWrapper>
    );
  };

  return (
    <Form
      schema={schema}
      uiSchema={uiSchema}
      formData={formData}
      onSubmit={onSubmit}
      templates={{ FieldTemplate }}
    />
  );
}
