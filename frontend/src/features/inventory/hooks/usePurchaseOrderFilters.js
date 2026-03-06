import { useEffect, useState } from 'react';

const parsePoFiltersFromQuery = (params) => ({
  branch_id: params.get('branch_id') || '',
  warehouse_id: params.get('warehouse_id') || '',
  severity: params.get('severity') || '',
  min_stockout_days: params.get('min_stockout_days') || '',
});

export default function usePurchaseOrderFilters(searchParams, setSearchParams) {
  const [poFilters, setPoFilters] = useState(() => parsePoFiltersFromQuery(searchParams));

  useEffect(() => {
    const incomingFilters = parsePoFiltersFromQuery(searchParams);
    const hasChanges = Object.keys(incomingFilters).some((key) => incomingFilters[key] !== poFilters[key]);
    if (hasChanges) {
      setPoFilters(incomingFilters);
    }
  }, [poFilters, searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    Object.entries(poFilters).forEach(([key, value]) => {
      if (value) nextParams.set(key, value);
    });
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams);
    }
  }, [poFilters, searchParams, setSearchParams]);

  const clearPoFilters = () => {
    setPoFilters({ branch_id: '', warehouse_id: '', severity: '', min_stockout_days: '' });
  };

  return {
    poFilters,
    setPoFilters,
    clearPoFilters,
  };
}
