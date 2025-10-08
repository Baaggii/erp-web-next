export function resolveScopedCompanyId(requestedCompanyId, userCompanyId) {
  const normalizedUserCompany = Number.isFinite(Number(userCompanyId))
    ? Number(userCompanyId)
    : 0;
  if (
    normalizedUserCompany === 0 &&
    requestedCompanyId !== undefined &&
    requestedCompanyId !== null
  ) {
    const parsed = Number(requestedCompanyId);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return normalizedUserCompany;
}

export function pickFirstScopeValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== '') return trimmed;
      continue;
    }
    const str = String(value).trim();
    if (str !== '') return str;
  }
  return null;
}
