export interface FilterHrefOverrides {
  modality?: string;
  city?: string;
  timeframe?: 'past';
  search?: string;
}

export function buildFilterHref(overrides: FilterHrefOverrides): string {
  const params = new URLSearchParams();
  if (overrides.modality) params.set('modalidad', overrides.modality);
  if (overrides.city) params.set('ciudad', overrides.city);
  if (overrides.timeframe === 'past') params.set('tiempo', 'pasados');
  if (overrides.search) params.set('q', overrides.search);
  const query = params.toString();
  return query ? `/?${query}` : '/';
}
