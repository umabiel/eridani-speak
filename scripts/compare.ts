import { loadResult, renderReport } from './report.js';
import { loadEnvFile } from './env.js';

function main(): void {
  loadEnvFile();
  const [normalPath, signalPath] = process.argv.slice(2);
  if (!normalPath || !signalPath) {
    console.error('Usage: npm run compare -- <normal-result.json> <signal-result.json>');
    process.exit(1);
  }
  const normal = loadResult(normalPath);
  const signal = loadResult(signalPath);
  const markdown = renderReport({ model: signal.model, suite: signal.suite, normal, signal });
  console.log(markdown);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
