import { addDays, today } from '@/lib/dates';
import type { AppAlert } from '@/types';
import { alertRoute, GENERIC_BODY, GENERIC_TITLE, MAX_NOTIFICATIONS, planNotifications, sortBySeverity, validateThresholds } from '../plan';

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
