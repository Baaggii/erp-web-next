export function serializeError(err) {
  if (!err) return null;
  if (err instanceof Error) {
    const serialized = { message: err.message };
    if (err.name && err.name !== 'Error') {
      serialized.name = err.name;
    }
    if (err.status !== undefined) {
      serialized.status = err.status;
    }
    if (err.statusText !== undefined) {
      serialized.statusText = err.statusText;
    }
    if (err.code !== undefined) {
      serialized.code = err.code;
    }
    if (err.body !== undefined) {
      serialized.body = err.body;
    }
    if (err.details !== undefined) {
      serialized.details = err.details;
    }
    if (err.stack) {
      serialized.stack = err.stack;
    }
    if (err.cause) {
      serialized.cause = serializeError(err.cause);
    }
    return serialized;
  }
  if (typeof err === 'object') {
    return { ...err };
  }
  return { message: String(err) };
}

export function summarizePosPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const summary = {};
  if (payload.type !== undefined) summary.type = payload.type;
  if (payload.totalAmount !== undefined) summary.totalAmount = payload.totalAmount;
  if (payload.totalVAT !== undefined) summary.totalVAT = payload.totalVAT;
  if (payload.totalCityTax !== undefined)
    summary.totalCityTax = payload.totalCityTax;
  if (payload.branchNo !== undefined) summary.branchNo = payload.branchNo;
  if (payload.posNo !== undefined) summary.posNo = payload.posNo;
  if (payload.merchantTin !== undefined) summary.merchantTin = payload.merchantTin;
  if (payload.customerTin !== undefined) summary.customerTin = payload.customerTin;
  if (payload.consumerNo !== undefined) summary.consumerNo = payload.consumerNo;
  if (payload.receipts && Array.isArray(payload.receipts)) {
    summary.receiptCount = payload.receipts.length;
  }
  return summary;
}
