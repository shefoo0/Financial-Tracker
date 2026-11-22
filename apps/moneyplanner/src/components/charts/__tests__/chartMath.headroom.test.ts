import { headroom, niceTicks } from '../chartMath';

it('adds headroom so the top of the scale sits on a round tick above the highest balance', () => {
  const values = [650000, 1500000, 3300000]; // AED 6,500 … 33,000
  const [top] = headroom(values, 100000);
  expect(top).toBeGreaterThan(3300000);
  expect(niceTicks(0, top).at(-1)).toBeGreaterThanOrEqual(3300000);
});

it('extends below zero to a round tick when balances go negative', () => {
  const out = headroom([-250000, 500000]);
  expect(Math.min(...out)).toBeLessThanOrEqual(-250000);
});
