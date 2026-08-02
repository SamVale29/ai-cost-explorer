export type ExplorerUrlState = {
  search: string;
  providers: string[];
  organization: string;
  status: string;
  capabilities: string[];
  recentOnly: boolean;
  minInput?: number;
  maxInput?: number;
  minOutput?: number;
  maxOutput?: number;
  minContext?: number;
};

export function parseExplorerUrl(search: string): ExplorerUrlState {
  const params = new URLSearchParams(search);
  return {
    search: params.get('q') ?? '',
    providers: params.get('provider')?.split(',').filter(Boolean) ?? [],
    organization: params.get('org') ?? '',
    status: params.get('status') ?? '',
    capabilities: params.get('cap')?.split(',').filter(Boolean) ?? [],
    recentOnly: params.get('recent') === '1',
    minInput: params.get('minIn') ? Number(params.get('minIn')) : undefined,
    maxInput: params.get('maxIn') ? Number(params.get('maxIn')) : undefined,
    minOutput: params.get('minOut') ? Number(params.get('minOut')) : undefined,
    maxOutput: params.get('maxOut') ? Number(params.get('maxOut')) : undefined,
    minContext: params.get('minCtx') ? Number(params.get('minCtx')) : undefined,
  };
}

export function serializeExplorerUrl(state: ExplorerUrlState): string {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  if (state.providers.length) params.set('provider', state.providers.join(','));
  if (state.organization) params.set('org', state.organization);
  if (state.status) params.set('status', state.status);
  if (state.capabilities.length) params.set('cap', state.capabilities.join(','));
  if (state.recentOnly) params.set('recent', '1');
  if (state.minInput !== undefined) params.set('minIn', String(state.minInput));
  if (state.maxInput !== undefined) params.set('maxIn', String(state.maxInput));
  if (state.minOutput !== undefined) params.set('minOut', String(state.minOutput));
  if (state.maxOutput !== undefined) params.set('maxOut', String(state.maxOutput));
  if (state.minContext !== undefined) params.set('minCtx', String(state.minContext));
  const value = params.toString();
  return value ? `?${value}` : '';
}
