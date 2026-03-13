export function normalizeAccessValue(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

export function normalizeAccessList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const normalized = [];
  list.forEach((item) => {
    const val = normalizeAccessValue(item);
    if (val !== null) normalized.push(val);
  });
  return normalized;
}

export function matchesScope(list, value) {
  if (!Array.isArray(list) || list.length === 0) return true;
  if (Array.isArray(value)) {
    const normalizedValues = value
      .map((item) => normalizeAccessValue(item))
      .filter((val) => val !== null);
    if (normalizedValues.length === 0) return false;
    return normalizedValues.some((val) => list.includes(val));
  }
  const normalizedValue = normalizeAccessValue(value);
  if (normalizedValue === null) return true;
  return list.includes(normalizedValue);
}

export function extractPositionId(entry) {
  if (entry === undefined || entry === null) return null;
  if (typeof entry === 'object' && !Array.isArray(entry)) {
    return (
      entry.positionId ??
      entry.position_id ??
      entry.position ??
      entry.workplacePositionId ??
      entry.workplace_position_id ??
      entry.id ??
      null
    );
  }
  return entry;
}

export function resolveWorkplacePositions(options, workplaceValue) {
  if (!options || typeof options !== 'object') return [];
  const workplaces = Array.isArray(workplaceValue) ? workplaceValue : [workplaceValue];
  const resolved = [];
  const addPosition = (position) => {
    const normalized = normalizeAccessValue(position);
    if (normalized !== null && !resolved.includes(normalized)) {
      resolved.push(normalized);
    }
  };

  for (const wp of workplaces) {
    const normalizedWorkplace = normalizeAccessValue(wp);
    if (normalizedWorkplace === null) continue;

    const mapCandidates = [
      options.workplacePositionMap,
      options.workplacePositionById,
      options.workplacePositionsMap,
    ];
    for (const map of mapCandidates) {
      if (map && typeof map === 'object' && !Array.isArray(map)) {
        addPosition(extractPositionId(map[normalizedWorkplace]));
      }
    }

    const listCandidates = [options.workplacePositions, options.workplacesWithPositions];
    for (const list of listCandidates) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const entryWorkplace = normalizeAccessValue(
          entry?.workplaceId ?? entry?.workplace_id ?? entry?.workplace ?? entry?.id,
        );
        if (entryWorkplace !== normalizedWorkplace) continue;
        addPosition(
          extractPositionId(
            entry?.positionId ??
              entry?.position_id ??
              entry?.position ??
              entry?.workplacePositionId ??
              entry?.workplace_position_id ??
              entry,
          ),
        );
      }
    }

    addPosition(
      extractPositionId(
        options.workplacePositionId ??
          options.workplacePosition ??
          options.workplace_position_id ??
          options.workplace_position,
      ),
    );
  }

  return resolved;
}

export function isPositionAllowed(allowedPositions, positionValue, workplaceValue, options) {
  if (!Array.isArray(allowedPositions) || allowedPositions.length === 0) return true;

  const hasWorkplace = workplaceValue !== null && workplaceValue !== undefined;

  if (hasWorkplace) {
    const workplacePositions = resolveWorkplacePositions(options, workplaceValue);

    if (!Array.isArray(workplacePositions) || workplacePositions.length === 0) {
      return false;
    }

    return matchesScope(allowedPositions, workplacePositions);
  }

  return matchesScope(allowedPositions, positionValue);
}
