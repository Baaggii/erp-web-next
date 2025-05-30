import React from 'react';
import Form from '@rjsf/core';
export default function FormRenderer({ schema, onSubmit }) {
  return <Form schema={schema} onSubmit={onSubmit} />;
}