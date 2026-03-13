import { useContext, useMemo } from 'react';
import { HeaderMappingsContext } from '../context/HeaderMappingsContext.jsx';

export function clearHeaderMappingsCache() {
  // global mappings are loaded once from HeaderMappingsProvider
}

export default function useHeaderMappings(headers = []) {
  const { mappings } = useContext(HeaderMappingsContext);

  return useMemo(() => {
    const unique = Array.from(new Set((headers || []).filter(Boolean)));
    const result = {};
    unique.forEach((header) => {
      if (mappings && Object.prototype.hasOwnProperty.call(mappings, header)) {
        result[header] = mappings[header];
      }
    });
    return result;
  }, [headers, mappings]);
}
