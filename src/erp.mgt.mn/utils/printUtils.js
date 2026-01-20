export const normalizePrintNumber = (value, { fallback = null, min = null } = {}) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (min !== null && parsed < min) return fallback;
  return parsed;
};

export const resolvePrintSettings = ({
  printConfig = {},
  isReceipt = false,
  receiptSheetWidthFallback = 'max-width:100%;',
  printSheetWidthFallback = 'max-width:210mm;',
  pageSizeFallbackReceipt = 'auto',
  pageSizeFallbackPrint = 'A4',
  enforcePortrait = false,
  swapLandscapeDimensions = false,
} = {}) => {
  const receiptMargin = normalizePrintNumber(printConfig.receiptMargin);
  const receiptGap = normalizePrintNumber(printConfig.receiptGap);
  const receiptFontSize = normalizePrintNumber(printConfig.receiptFontSize);
  const receiptWidth = normalizePrintNumber(printConfig.receiptWidth);
  const receiptHeight = normalizePrintNumber(printConfig.receiptHeight);
  const printWidth = normalizePrintNumber(printConfig.printWidth);
  const printHeight = normalizePrintNumber(printConfig.printHeight);
  const printMargin = normalizePrintNumber(printConfig.printMargin ?? printConfig.margin);
  const printGap = normalizePrintNumber(printConfig.printGap ?? printConfig.gap);
  const printFontSize = normalizePrintNumber(
    printConfig.printFontSize ?? printConfig.fontSize ?? printConfig.textSize,
  );

  const pageMarginValue = isReceipt ? receiptMargin : printMargin;
  const fontSizeValue = isReceipt ? receiptFontSize : printFontSize;
  const gapValue = isReceipt ? receiptGap : printGap;
  const pageMargin = pageMarginValue !== null ? `${pageMarginValue}mm` : isReceipt ? '0' : '1rem';
  const fontSize = fontSizeValue !== null ? `${fontSizeValue}px` : isReceipt ? 'inherit' : 'smaller';
  const gapSize = gapValue !== null ? `${gapValue}mm` : '0.75rem';
  const groupSpacing = gapValue !== null ? `${gapValue}mm` : '1rem';

  const widthValue = isReceipt ? receiptWidth : printWidth;
  const heightValue = isReceipt ? receiptHeight : printHeight;
  const shouldSwap = !isReceipt && swapLandscapeDimensions && widthValue && heightValue && widthValue > heightValue;
  const [resolvedWidthValue, resolvedHeightValue] = shouldSwap
    ? [heightValue, widthValue]
    : [widthValue, heightValue];
  const pageWidth = resolvedWidthValue ? `${resolvedWidthValue}mm` : null;
  const pageHeight = resolvedHeightValue ? `${resolvedHeightValue}mm` : null;
  const pageSize =
    pageWidth && pageHeight
      ? `${pageWidth} ${pageHeight}`
      : isReceipt
        ? pageSizeFallbackReceipt
        : pageSizeFallbackPrint;
  const pageSizeRule = isReceipt ? pageSize : enforcePortrait ? `${pageSize} portrait` : pageSize;
  const sheetWidthRule = pageWidth
    ? `width:${pageWidth};max-width:${pageWidth};`
    : isReceipt
      ? receiptSheetWidthFallback
      : printSheetWidthFallback;

  return {
    pageMargin,
    fontSize,
    gapSize,
    groupSpacing,
    pageWidth,
    pageHeight,
    pageSize,
    pageSizeRule,
    sheetWidthRule,
  };
};

export const buildPrintHtml = ({
  title = 'Print',
  sections = '',
  pageSizeRule,
  pageMargin,
  fontSize,
  sheetWidthRule,
  groupSpacing,
  gapSize,
} = {}) => {
  return (
    '<html><head>' +
    `<title>${title}</title>` +
    `<style>@page{size:${pageSizeRule};margin:${pageMargin};}` +
    '@media print{body{margin:0;}.print-group{break-inside:avoid;page-break-inside:avoid;}}' +
    `body{margin:0;} .print-sheet{box-sizing:border-box;font-size:${fontSize};${sheetWidthRule}}` +
    ` .print-sheet,.print-sheet *{font-size:${fontSize} !important;}` +
    ` .print-group{margin-bottom:${groupSpacing};}` +
    ` .print-copies{display:grid;grid-template-columns:1fr;gap:${gapSize};}` +
    ' .print-copies.print-copies-grid{grid-template-columns:repeat(2,minmax(0,1fr));}' +
    ' .print-item{break-inside:avoid;}' +
    ' table{width:100%;border-collapse:collapse;margin-bottom:1rem;table-layout:fixed;}' +
    ' th,td{padding:4px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;white-space:normal;}' +
    ' img,svg,canvas{max-width:100%;height:auto;}' +
    ' .print-main-table th,.print-main-table td{border:1px solid #666;}' +
    ' .print-signature-table{table-layout:fixed;}' +
    ' .print-signature-table th{width:45%;}' +
    ' .print-signature-table td{width:55%;text-align:right;overflow-wrap:break-word;word-break:normal;white-space:normal;}' +
    ' h3{margin:0 0 4px 0;font-weight:600;}</style>' +
    `</head><body><div class="print-sheet">${sections}</div></body></html>`
  );
};

export const openPrintWindow = ({ html, windowFeatures, onReady, onOpenError } = {}) => {
  const printWindow = window.open('', '_blank', windowFeatures);
  if (!printWindow) {
    if (onOpenError) onOpenError();
    return null;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  if (onReady) onReady(printWindow);
  printWindow.focus();
  return printWindow;
};

export const dispatchPrint = ({ html, printerId, apiBase, onOpenError } = {}) => {
  if (printerId) {
    return fetch(`${apiBase}/print`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerId, content: html }),
    }).catch((err) => console.error('Print failed', err));
  }
  const printWindow = openPrintWindow({ html, onOpenError });
  if (!printWindow) return null;
  printWindow.print();
  return printWindow;
};

export const mmToPixels = (mm) => Math.round(mm * 3.7795);
