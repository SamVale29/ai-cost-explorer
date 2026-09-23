export const SITE_URL = 'https://samvale29.github.io/ai-cost-explorer/';
export const PAGE_ROUTES = [
  '',
  'explore',
  'compare',
  'calculator',
  'history',
  'value',
  'methodology',
];
export function canonicalUrl(path: string): string {
  const route = path.replace(/^\/+|\/+$/g, '');
  return SITE_URL + (route ? route + '/' : '');
}
export function robotsFor(path: string, search = ''): string {
  const route = path.replace(/^\/+|\/+$/g, '');
  const known = PAGE_ROUTES.includes(route) || /^model\/[a-z0-9-]+$/.test(route);
  return search || route === 'compare' || !known ? 'noindex,follow' : 'index,follow';
}

export function getPageMeta(path: string, model?: { name: string }) {
  if (path.startsWith('/explore'))
    return {
      title: 'Model explorer',
      description:
        'Search verified AI model offers by pricing, context, capabilities and source freshness.',
    };
  if (path.startsWith('/compare'))
    return {
      title: 'Comparison workspace',
      description:
        'Compare selected AI API offers side by side with differences and unknowns visible.',
    };
  if (path.startsWith('/calculator'))
    return {
      title: 'Cost simulator',
      description:
        'Estimate AI API workload costs with cache, retries, batch share and shareable scenarios.',
    };
  if (path.startsWith('/history'))
    return {
      title: 'Price history',
      description: 'Review dated AI API pricing observations without invented historical lines.',
    };
  if (path.startsWith('/value'))
    return {
      title: 'Value frontier',
      description: 'Plot measurable AI offer dimensions and inspect a transparent Pareto frontier.',
    };
  if (path.startsWith('/methodology'))
    return {
      title: 'Methodology',
      description:
        'Read the public data, pricing, freshness and benchmark methodology behind AI Cost Explorer.',
    };
  if (path.startsWith('/model/'))
    return {
      title: model?.name ?? 'Model detail',
      description:
        'Inspect verified capabilities, pricing offers and official sources for an AI model.',
    };
  return {
    title: 'Overview',
    description:
      'Compare LLM pricing, capabilities, context windows and verified sources before a workload becomes a bill.',
  };
}
