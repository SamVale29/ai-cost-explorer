const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index]?.replace(/^--/, ''), process.argv[index + 1] ?? '');

const provider = args.get('provider') || '<provider>';
const model = args.get('model') || '<model>';
const suite = args.get('suite') || 'standard-v1';
console.log(`Benchmark harness configured for ${provider}/${model} (${suite}).`);
console.log('Protocol: 2 warmups, 5 measured repetitions, concurrency 1, streaming for TTFT, UTC timestamp, P50/P95.');
console.log('No paid benchmark was executed. Provide an API key and explicit --execute in a local environment to run a measurement.');
