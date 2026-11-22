import { addDays, today } from '@/lib/dates';

import { whenLabel } from '../helpers';

describe('whenLabel', () => {
  it('counts days ahead', () => {
    const now = today();
    expect(whenLabel(addDays(now, 23), now)).toBe('in 23 days');
    expect(whenLabel(addDays(now, 1), now)).toBe('tomorrow');
    expect(whenLabel(now, now)).toBe('today');
  });
});
