import type { APIRoute } from 'astro';
import { getEvents } from '../lib/firebase/events';

const staticPaths = ['/', '/calendario', '/comunidades'];

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? 'https://nodo-eventos.duckdns.org';

  let eventPaths: string[] = [];

  try {
    const events = await getEvents();
    eventPaths = events.map((event) => `/eventos/${event.slug}`);
  } catch (error) {
    console.warn('No se pudo generar el sitemap con eventos:', error);
  }

  const urls = [...staticPaths, ...eventPaths];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}
</urlset>
`;

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/xml' },
  });
};
