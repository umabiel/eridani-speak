import { validateAllFixtures } from './fixtures.js';

const { fixtures, errors } = validateAllFixtures();

let failed = false;
for (const [id, errs] of errors) {
  failed = true;
  console.error(`✗ ${id}: ${errs.join('; ')}`);
}

const categoryCount = new Map<string, number>();
for (const f of fixtures) categoryCount.set(f.category, (categoryCount.get(f.category) ?? 0) + 1);
console.log(
  `Validated ${fixtures.length} fixtures (${[...categoryCount.entries()].map(([c, n]) => `${c}: ${n}`).join(', ')}).`,
);

if (failed) {
  console.error('Fixture validation FAILED.');
  process.exit(1);
}
console.log('Fixture validation OK.');
