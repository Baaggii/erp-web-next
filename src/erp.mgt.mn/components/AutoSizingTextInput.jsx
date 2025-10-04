import React from 'react';
import computeAutoSizingInputWidth from './computeAutoSizingInputWidth.js';

const AutoSizingTextInput = React.forwardRef(function AutoSizingTextInput(
  props,
  ref,
) {
  const {
    value = '',
    placeholder = '',
    minChars = 0,
    charWidth = 1,
    style,
    ...rest
  } = props;

  const widthCh = computeAutoSizingInputWidth({
    value,
    placeholder,
    minChars,
    charWidth,
  });

  const mergedStyle = {
    ...style,
    width: `${widthCh}ch`,
  };

  return (
    <input
      {...rest}
      ref={ref}
      value={value}
      placeholder={placeholder}
      style={mergedStyle}
    />
  );
});

export default AutoSizingTextInput;
