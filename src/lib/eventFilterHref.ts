export interface FilterHrefOverrides {
  modality?: string;
  city?: string;
  timeframe?: 'past';
  search?: string;
  // Pide el listado explicitamente, sin depender de que haya algun filtro
  // puesto. Sin esto, quitar el ultimo filtro -pulsar "Todos" viniendo de "Ver
  // mas eventos"- devolvia a la portada, que es justo lo contrario de lo que
  // pide quien acaba de entrar al listado.
  list?: boolean;
}

export function buildFilterHref(overrides: FilterHrefOverrides): string {
  const params = new URLSearchParams();
  if (overrides.modality) params.set('modalidad', overrides.modality);
  if (overrides.city) params.set('ciudad', overrides.city);
  if (overrides.timeframe === 'past') params.set('tiempo', 'pasados');
  if (overrides.search) params.set('q', overrides.search);
  if (overrides.list) params.set('ver', 'todos');
  const query = params.toString();
  return query ? `/?${query}` : '/';
}
