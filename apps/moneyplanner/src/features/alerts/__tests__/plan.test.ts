import { addDays, today } from '@/lib/dates';
import type { AppAlert, BillReminders } from '@/types';
import { alertRoute, type BillDue, GENERIC_BODY, GENERIC_TITLE, MAX_NOTIFICATIONS, planNotifications, sortBySeverity, validateThresholds } from '../plan';

const alert = (id: string, notifyOn: string | null, severity: AppAlert['severity'] = 'caution'): AppAlert => ({
  id,
  kind: 'shortfall-zero',
  severity,
  title: `Title ${id}`,
  message: `AED 500 message ${id}`,
  date: notifyOn,
  notifyOn,
  refId: null,
});

describe('planNotifications', () => {
  const now = new Date();
  it('plans 09:00 local on notifyOn, skipping in-app-only and past alerts', () => {
    const out = planNotifications([alert('a', addDays(today(now), 2)), alert('b', null), alert('c', addDays(today(now), -1))], false, now);
    expect(out).toHaveLength(1);
    expect(out[0].at.getHours()).toBe(9);
    expect(out[0].at.getMinutes()).toBe(0);
    expect(out[0].title).toBe('Title a');
    expect(out[0].body).toBe('AED 500 message a');
  });

  it('keeps the 20 soonest, in order', () => {
    const alerts = Array.from({ length: 30 }, (_, i) => alert(`x${i}`, addDays(today(now), 30 - i)));
    const out = planNotifications(alerts, false, now);
    expect(out).toHaveLength(MAX_NOTIFICATIONS);
    expect(out[0].alertId).toBe('x29');
    expect(out[19].at.getTime()).toBeGreaterThan(out[0].at.getTime());
  });

  it('uses generic text when locked', () => {
    const [n] = planNotifications([alert('a', addDays(today(now), 2))], true, now);
    expect(n.title).toBe(GENERIC_TITLE);
    expect(n.body).toBe(GENERIC_BODY);
    expect(n.body).not.toMatch(/AED/);
  });
});

describe('notifyOn today', () => {
  const alerts = [alert('t', '2026-05-10')];
  it('reminds in a minute when 09:00 has passed today', () => {
    const now = new Date(2026, 4, 10, 14, 30);
    const [n] = planNotifications(alerts, false, now);
    expect(n.at.getTime()).toBe(now.getTime() + 60_000);
  });
  it('keeps 09:00 when it is still ahead, and skips earlier days', () => {
    expect(planNotifications(alerts, false, new Date(2026, 4, 10, 7, 0))[0].at.getHours()).toBe(9);
    expect(planNotifications(alerts, false, new Date(2026, 4, 11, 7, 0))).toEqual([]);
  });
});

describe('helpers', () => {
  it('sorts by severity, keeping order within a level', () => {
    const out = sortBySeverity([alert('1', null, 'info'), alert('2', null, 'high'), alert('3', null, 'good'), alert('4', null, 'high')]);
    expect(out.map((a) => a.id)).toEqual(['2', '4', '1', '3']);
  });
  it('routes alerts to their screens', () => {
    expect(alertRoute('shortfall-buffer')).toBe('/month');
    expect(alertRoute('cheque-uncovered')).toBe('/cheques');
    expect(alertRoute('card-near-limit')).toBe('/debts');
  });
  it('validates thresholds', () => {
    expect(validateThresholds({ debtCautionPct: '40', debtHighPct: '50', cardUsagePct: '80' }).value).toEqual({ debtCautionPct: 40, debtHighPct: 50, cardUsagePct: 80 });
    expect(validateThresholds({ debtCautionPct: '60', debtHighPct: '50', cardUsagePct: '80' }).errors.debtCautionPct).toMatch(/lower/);
    expect(validateThresholds({ debtCautionPct: 'x', debtHighPct: '0', cardUsagePct: '101' }).errors).toEqual({
      debtCautionPct: expect.any(String),
      debtHighPct: expect.any(String),
      cardUsagePct: expect.any(String),
    });
  });
});

describe('bill reminders', () => {
  const now = new Date(2026, 10, 22, 8, 0); // 22 Nov 2026, 08:00
  const bill = (key: string, date: string, over: Partial<BillDue> = {}): BillDue => ({ key, refId: key, date, title: `Rent ${key}`, amount: 'AED 6,500', ...over });
  const on = (over: Partial<BillReminders> = {}): BillReminders => ({ on: true, leadDays: 1, muted: [], ...over });

  it('reminds at 09:00 on due date minus the lead days, same day included', () => {
    for (const [lead, day] of [[0, 25], [1, 24], [2, 23], [3, 22]] as const) {
      const [n] = planNotifications([], false, now, [bill('a', '2026-11-25')], on({ leadDays: lead }));
      expect([n.at.getDate(), n.at.getHours(), n.at.getMinutes()]).toEqual([day, 9, 0]);
    }
  });

  it('says what is due and when, e.g. "Rent AED 6,500 due tomorrow"', () => {
    const [n] = planNotifications([], false, now, [bill('a', '2026-11-23', { title: 'Rent' })], on());
    expect(n.body).toBe('Rent AED 6,500 due tomorrow');
    const [m] = planNotifications([], false, now, [bill('a', '2026-11-26', { title: 'Rent' })], on({ leadDays: 3 }));
    expect(m.body).toBe('Rent AED 6,500 due in 4 days');
  });

  it('when 09:00 today has passed, reminds in a minute; earlier days are skipped', () => {
    const late = new Date(2026, 10, 22, 10, 0);
    const [n] = planNotifications([], false, late, [bill('a', '2026-11-23')], on());
    expect(n.at.getTime()).toBe(late.getTime() + 60_000);
    expect(planNotifications([], false, late, [bill('a', '2026-11-22')], on())).toHaveLength(0);
    expect(planNotifications([], false, late, [bill('a', '2026-11-23')], on({ leadDays: 2 }))).toHaveLength(0);
  });

  it('skips muted items and does nothing when reminders are off', () => {
    const bills = [bill('a', '2026-11-25'), bill('b', '2026-11-26')];
    expect(planNotifications([], false, now, bills, on({ muted: ['a'] })).map((n) => n.alertId)).toEqual(['bill:b']);
    expect(planNotifications([], false, now, bills, on({ on: false }))).toHaveLength(0);
    expect(planNotifications([], false, now, bills)).toHaveLength(0);
  });

  it('uses generic text when locked', () => {
    const [n] = planNotifications([], true, now, [bill('a', '2026-11-25')], on());
    expect(n.title).toBe(GENERIC_TITLE);
    expect(n.body).toBe('A bill is due soon in Money Planner');
  });

  it('keeps 20 and gives bills and serious alerts priority over info alerts', () => {
    const info = Array.from({ length: 10 }, (_, i) => ({ ...alert(`i${i}`, `2026-11-${23 + (i % 3)}`, 'info') }));
    const bills = Array.from({ length: 15 }, (_, i) => bill(`b${i}`, `2026-12-${String(10 + i).padStart(2, '0')}`));
    const out = planNotifications([...info, alert('hi', '2026-12-30', 'high')], false, now, bills, on());
    expect(out).toHaveLength(MAX_NOTIFICATIONS);
    expect(out.filter((n) => n.alertId.startsWith('bill:'))).toHaveLength(15);
    expect(out.some((n) => n.alertId === 'hi')).toBe(true);
    expect(out.filter((n) => n.alertId.startsWith('i'))).toHaveLength(4);
    for (let i = 1; i < out.length; i++) expect(out[i].at.getTime()).toBeGreaterThanOrEqual(out[i - 1].at.getTime());
  });
});
