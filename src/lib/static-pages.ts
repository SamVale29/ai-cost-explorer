import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Model } from '../types';
import { canonicalUrl, getPageMeta, PAGE_ROUTES, robotsFor } from './page-meta';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function routeHtml(template: string, path: string, model?: Model): string {
  const meta = getPageMeta(path, model);
  const title = escapeHtml(`${meta.title} · AI Cost Explorer`);
  const description = escapeHtml(meta.description);
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(
      /(<meta\s+(?:name|property)="(?:description|og:description|twitter:description)"\s+content=")[^"]*(")/g,
      `$1${description}$2`,
    )
    .replace(
      /(<meta\s+(?:name|property)="(?:og:title|twitter:title)"\s+content=")[^"]*(")/g,
      `$1${title}$2`,
    )
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/g, `$1${canonicalUrl(path)}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/g, `$1${canonicalUrl(path)}$2`)
    .replace(/(<meta\s+name="robots"\s+content=")[^"]*(")/g, `$1${robotsFor(path)}$2`);
}

export async function buildPages(dist: string, models: Model[]): Promise<number> {
  const template = await readFile(resolve(dist, 'index.html'), 'utf8');
  const routes = [...PAGE_ROUTES, ...models.map((model) => `model/${model.id}`)];
  for (const route of routes) {
    if (!/^(?:[a-z0-9-]+\/)*[a-z0-9-]*$/.test(route))
      throw new Error(`Invalid static route: ${route}`);
    const directory = resolve(dist, route);
    await mkdir(directory, { recursive: true });
    const model = models.find((item) => route === `model/${item.id}`);
    await writeFile(resolve(directory, 'index.html'), routeHtml(template, `/${route}`, model));
  }
  const notFound = routeHtml(template, '/404')
    .replace(/<title>.*?<\/title>/, '<title>Page not found · AI Cost Explorer</title>')
    .replace('content="index,follow"', 'content="noindex,follow"')
    .replace(/<link\s+rel="canonical"[^>]*>/, '');
  await writeFile(resolve(dist, '404.html'), notFound);
  await writeFile(
    resolve(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes
      .filter((route) => robotsFor(`/${route}`) === 'index,follow')
      .map((route) => `  <url><loc>${canonicalUrl(route)}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
  );
  return routes.length;
}
