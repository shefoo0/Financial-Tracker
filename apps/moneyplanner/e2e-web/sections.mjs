export const sections = [];
const add = (name, fn) => sections.push([name, fn]);

add('1 Wizard', async (d, step) => {
  await step('step 1 of 3: salary (with the welcome text)', async () => { await d.see('#onboarding-screen'); await d.see('Welcome', { exact: true }); await d.see('Step 1 of 3'); await d.see('Your salary'); await d.shot('welcome'); });
  await step('type salary 18000', async () => { await d.type('#onboarding-salary', '18000'); });
  await step('step 2 of 3: payday 25', async () => { await d.tap('#onboarding-next'); await d.see('Step 2 of 3'); await d.tap('#onboarding-payday'); await d.tap('#onboarding-payday-option-25'); });
  await step('step 3 of 3: balance 6500 (no buffer or module questions)', async () => {
    await d.tap('#onboarding-next'); await d.see('Your balance today'); await d.see('Step 3 of 3');
    if (await d.has('#onboarding-buffer') || await d.has('#onboarding-module-debts')) throw new Error('wizard still asks for buffer or modules');
    await d.type('#onboarding-balance', '6500');
  });
  await step('Start screen shows the default buffer', async () => {
    await d.tap('#onboarding-next'); await d.see('#onboarding-start');
    await d.see('#onboarding-summary');
    await d.seeText('#onboarding-summary', /Salary: AED 18,000\.00 every month, on day 25/);
    await d.seeText('#onboarding-summary', /Buffer: AED 1,000\.00/);
    await d.shot('wizard-summary');
  });
  await step('start -> Home with balance', async () => {
    await d.tap('#onboarding-start');
    await d.see('#dashboard-screen');
    await d.see('AED 6,500', { exact: true }); await d.see('Coming up'); await d.see('Salary', { exact: true });
    await d.shot('home-after-wizard');
  });
  await step('Home payday card: safe to spend = balance 6,500 - default buffer 1,000, until payday', async () => {
    await d.see('#payday-card'); await d.seeText('#payday-safe', /AED 5,500/);
    await d.seeText('#payday-card', /until payday on 25 [A-Z][a-z]{2}/);
    await d.tap('#payday-toggle'); await d.see('#payday-details'); await d.seeText('#payday-details', /Balance now.*6,500\.00/);
    await d.shot('home-payday-expanded'); await d.tap('#payday-toggle'); await d.notSee('#payday-details');
  });
});

add('2 Plan: recurring items', async (d, step) => {
  await step('Plan tab lists salary with totals', async () => {
    await d.tab('Plan'); await d.see('Income and costs that repeat'); await d.see('Salary');
    await d.seeText('#plan-total-income', /18,000\.00/); await d.shot('plan-with-salary');
  });
  await step('add cost Rent 9500 on day 1', async () => {
    await d.tap('#plan-add-cost'); await d.see('#recurring-screen');
    await d.type('#recurring-name', 'Rent'); await d.type('#recurring-amount', '9500'); await d.type('#recurring-day', '1');
    await d.shot('rent-form'); await d.tap('#recurring-save-bottom');
    await d.see('#plan-screen'); await d.notSee('#recurring-screen');
  });
  await step('Rent and cost total shown on Plan', async () => {
    await d.see('Rent'); await d.seeText('#plan-total-cost', /9,500\.00/); await d.shot('plan-with-rent');
  });
  await step('Home Coming up shows Rent', async () => {
    await d.tab('Home'); await d.see('#dashboard-upcoming'); await d.see('Rent', { exact: true }); await d.shot('home-with-rent');
  });
  await step('Coming up: Paid on Rent records it (row moves to the next month), Undo brings it back', async () => {
    const rentRow = () => d.page.locator('[data-testid^="dashboard-upcoming-"]').filter({ hasText: 'Rent' }).filter({ visible: true }).first();
    const before = (await rentRow().innerText()).replace(/\s+/g, ' ');
    await d.page.locator('[aria-label^="Mark Rent as paid"]').filter({ visible: true }).first().click();
    await d.see('#undo-bar'); await d.shot('home-marked-paid');
    await d.settle(300);
    const after = (await rentRow().innerText()).replace(/\s+/g, ' ');
    if (after === before) throw new Error('Rent row did not change after Paid: "' + before + '"');
    await d.tap('#undo-button'); await d.settle(300);
    const back = (await rentRow().innerText()).replace(/\s+/g, ' ');
    if (back !== before) throw new Error('Undo did not bring the Rent row back: was "' + before + '", now "' + back + '"');
    await d.notSee('#undo-bar');
  });
  await step('edit Rent amount to 9600', async () => {
    await d.tab('Plan'); await d.tap('Rent', { exact: true }); await d.see('#recurring-screen');
    await d.type('#recurring-amount', '9600'); await d.tap('#recurring-save-bottom');
    await d.see('#plan-screen'); await d.seeText('#plan-total-cost', /9,600\.00/);
  });
  await step('Discard changes? prompt: keep editing, then discard', async () => {
    await d.clearAlerts();
    await d.tap('Rent', { exact: true }); await d.see('#recurring-screen');
    await d.type('#recurring-amount', '1111'); await d.back();
    const a = await d.alerts();
    if (!a.some((x) => x.title === 'Discard changes?')) throw new Error('leaving a changed form did not ask "Discard changes?" (alerts: ' + JSON.stringify(a) + ')');
    await d.see('#recurring-screen');
    await d.alertPick('Discard'); await d.back();
    await d.see('#plan-screen'); await d.notSee('#recurring-screen');
    await d.seeText('#plan-total-cost', /9,600\.00/);
    await d.clearAlerts();
  });
  await step('add and delete a cost (Gym 200)', async () => {
    await d.tap('#plan-add-cost'); await d.type('#recurring-name', 'Gym'); await d.type('#recurring-amount', '200');
    await d.tap('#recurring-save-bottom'); await d.see('Gym');
    await d.seeText('#plan-total-cost', /9,800\.00/);
    await d.tap('Gym'); await d.see('#recurring-screen');
    await d.alertPick('Delete'); await d.tap('#recurring-delete');
    await d.see('#plan-screen'); await d.notSee('Gym', { exact: true }); await d.seeText('#plan-total-cost', /9,600\.00/);
    await d.clearAlerts(); await d.shot('plan-after-delete');
  });
  await step('weekly and yearly schedule types save', async () => {
    await d.tap('#plan-add-cost'); await d.type('#recurring-name', 'Groceries'); await d.type('#recurring-amount', '300');
    await d.tap('#recurring-schedule-weekly'); await d.see('Weekly items happen'); await d.tap('#recurring-save-bottom');
    await d.see('Groceries');
    await d.tap('#plan-add-cost'); await d.type('#recurring-name', 'Insurance'); await d.type('#recurring-amount', '1200');
    await d.tap('#recurring-schedule-yearly'); await d.tap('#recurring-save-bottom'); await d.see('Insurance');
  });
  await step('skip and move one payment of Rent', async () => {
    await d.tap('Rent', { exact: true }); await d.see('#recurring-screen'); await d.see('Upcoming', { exact: true });
    await d.tap('#occurrence-skip-0'); await d.see('#occurrence-unskip-0'); await d.shot('rent-skipped');
    await d.tap('#occurrence-unskip-0'); await d.see('#occurrence-skip-0');
    await d.tap('#occurrence-move-0'); await d.type('#occurrence-date-input-0', '2026-12-03'); await d.tap('#occurrence-date-apply-0');
    await d.see('Moved'); await d.shot('rent-moved');
    await d.tap('#occurrence-amount-1'); await d.type('#occurrence-amount-input-1', '9000'); await d.tap('#occurrence-amount-apply-1');
    await d.see('9,000.00');
    await d.tap('#occurrence-paid-0'); await d.see('Mark unpaid');
  });
  await step('leave the form without a prompt (nothing unsaved)', async () => {
    await d.clearAlerts(); await d.back(); await d.see('#plan-screen');
    if ((await d.alerts()).length) throw new Error('asked to discard although nothing was edited in the form');
  });
});

add('3 One-time items and Month', async (d, step) => {
  await step('Month tab shows this month with Rent', async () => {
    await d.tab('Month'); await d.see('#month-screen'); await d.see('Nov 2026'); await d.shot('month-nov');
  });
  await step('opening and closing balance show under the header', async () => {
    await d.seeText('#month-opening', /Opening AED/); await d.seeText('#month-closing', /Closing AED .*projected/);
  });
  await step('a monthly limit on Groceries shows spent vs left on Month', async () => {
    await d.tab('Settings'); await d.tap('#settings-categories'); await d.tap('#category-groceries');
    await d.type('#category-limit-input', '100'); await d.tap('#category-save'); await d.seeText('#category-limit-groceries', /Limit AED 100\.00/);
    await d.back(); await d.tab('Month'); await d.see('#month-limits'); await d.seeText('#month-limit-0', /Groceries/); await d.seeText('#month-limit-0', /left|over/); await d.shot('month-limits');
  });
  await step('add one-time spend Taxi 45', async () => {
    await d.tap('#month-add-item'); await d.see('#transaction-screen');
    await d.type('#transaction-description', 'Taxi'); await d.type('#transaction-amount', '45');
    await d.tap('#transaction-save-bottom'); await d.see('#month-screen'); await d.notSee('#transaction-screen');
    await d.see('Taxi'); await d.seeText('#month-spent', /45/); await d.shot('month-with-taxi');
  });
  await step('add one-time income Bonus 500 (planned)', async () => {
    await d.tap('#month-add-item'); await d.tap('#transaction-kind-income');
    await d.type('#transaction-description', 'Bonus'); await d.type('#transaction-amount', '500');
    await d.tap('#transaction-save-bottom'); await d.see('Bonus');
  });
  await step('edit Taxi to 60', async () => {
    await d.tap('Taxi'); await d.see('#transaction-screen'); await d.type('#transaction-amount', '60');
    await d.tap('#transaction-save-bottom'); await d.see('#month-screen'); await d.seeText('#month-spent', /60/);
  });
  await step('discard prompt on a one-time item', async () => {
    await d.clearAlerts(); await d.tap('Taxi'); await d.type('#transaction-amount', '99'); await d.back();
    if (!(await d.alerts()).some((a) => a.title === 'Discard changes?')) throw new Error('no Discard changes? prompt');
    await d.alertPick('Discard'); await d.back(); await d.see('#month-screen'); await d.seeText('#month-spent', /60/); await d.clearAlerts();
  });
  await step('delete Taxi', async () => {
    await d.tap('Taxi'); await d.alertPick('Delete'); await d.tap('#transaction-delete');
    await d.see('#month-screen'); await d.notSee('Taxi', { exact: true }); await d.clearAlerts(); await d.shot('month-after-delete');
  });
  await step('add one-time spend Coffee 12 (history for the chip)', async () => {
    await d.tap('#month-add-item'); await d.see('#transaction-screen');
    await d.type('#transaction-description', 'Coffee'); await d.type('#transaction-amount', '12');
    await d.tap('#transaction-save-bottom'); await d.see('#month-screen'); await d.see('Coffee');
  });
  await step('add via a recent chip (timed, target under 10 s)', async () => {
    const t0 = Date.now();
    await d.tap('#month-add-item'); await d.see('#transaction-screen');
    await d.tap('#recent-chip-0');
    if (!(await d.page.locator('[data-testid="transaction-description"]').inputValue())) throw new Error('chip did not fill the description');
    await d.type('#transaction-amount', '52');
    await d.tap('#transaction-save-bottom'); await d.see('#month-screen'); await d.notSee('#transaction-screen');
    const secs = (Date.now() - t0) / 1000;
    console.log(`    chip entry took ${secs.toFixed(1)} s`);
    if (secs > 10) throw new Error(`chip entry took ${secs.toFixed(1)} s (target under 10)`);
    await d.see('Coffee', { nth: 1 });
    for (let i = 0; i < 2; i++) { await d.clearAlerts(); await d.tap('Coffee'); await d.alertPick('Delete'); await d.tap('#transaction-delete'); await d.see('#month-screen'); }
    await d.notSee('Coffee', { exact: true }); await d.clearAlerts();
  });
  await step('month stepper: next, next, previous, Today', async () => {
    await d.tap('#month-next'); await d.see('Dec 2026'); await d.see('Rent'); await d.see('Paid', { exact: true }); await d.see('Moved', { exact: true }); await d.shot('month-dec');
    await d.tap('#month-next'); await d.see('Jan 2027');
    await d.tap('#month-prev'); await d.see('Dec 2026');
    await d.tap('#month-today'); await d.see('Nov 2026');
  });
  await step('past month is empty or lists items without error', async () => {
    await d.tap('#month-prev'); await d.tap('#month-prev'); await d.tap('#month-prev'); await d.see('Aug 2026');
    await d.shot('month-aug'); await d.tap('#month-today'); await d.see('Nov 2026');
  });
});

add('4 Debts', async (d, step) => {
  await step('open Debts from Plan: empty state', async () => {
    await d.tab('Plan'); await d.tap('#plan-open-debts'); await d.see('#debts-screen'); await d.see('Track what you owe'); await d.shot('debts-empty');
  });
  await step('add loan with 5.5% interest rate', async () => {
    await d.tap('#debts-add-loan'); await d.see('#debt-screen');
    await d.type('#debt-name', 'Car loan'); await d.type('#debt-balance', '20000'); await d.type('#debt-monthly', '1500');
    await d.type('#debt-day', '15'); await d.type('#debt-rate', '5.5'); await d.shot('loan-form');
    await d.tap('#debt-save-bottom'); await d.see('#debts-screen'); await d.notSee('#debt-screen');
    await d.see('Car loan'); await d.seeText('#debts-total', /20,000\.00/); await d.see('#debts-ratio'); await d.shot('debts-with-loan');
  });
  await step('APP CHECK: the loan row says when the next payment is (first payment is after today, so never "today")', async () => {
    const row = await d.text('#debt-item-0');
    if (/Next .* today/.test(row)) throw new Error(`debt row says the next payment is today although the first one is next month: "${row}" (src/features/debts/helpers.ts:7 whenLabel uses diffDays(date, now), reversed)`);
  }, { soft: true });
  await step('APP CHECK: hero "Monthly payments" shows the loan instalment', async () => {
    await d.seeText('#debts-monthly', /1,500\.00/);
  }, { soft: true });
  await step('add card (Minimum plan) and see interest estimate', async () => {
    await d.tap('#debts-add-card'); await d.see('#debt-screen');
    await d.type('#debt-name', 'Visa'); await d.type('#debt-limit', '10000'); await d.type('#debt-balance', '3000');
    await d.type('#debt-statement-day', '5'); await d.type('#debt-day', '25');
    await d.type('#debt-min-pct', '5'); await d.type('#debt-min-floor', '100'); await d.type('#debt-monthly-rate', '3');
    await d.tap('#debt-plan-minimum'); await d.see('#debt-interest-estimate'); await d.seeText('#debt-interest-estimate', /90\.00/);
    await d.tap('#debt-save-bottom'); await d.see('#debts-screen'); await d.see('Visa'); await d.shot('debts-with-card');
  });
  await step('card: switch plan to Fixed 500, then Full', async () => {
    await d.tap('Visa'); await d.see('#debt-screen'); await d.see('Available credit');
    await d.tap('#debt-plan-fixed'); await d.type('#debt-fixed', '500'); await d.tap('#debt-save-bottom'); await d.see('#debts-screen');
    await d.tap('Visa'); await d.see('#debt-fixed'); await d.tap('#debt-plan-full'); await d.tap('#debt-save-bottom'); await d.see('#debts-screen');
  });
  await step('add instalment plan linked to the card', async () => {
    await d.tap('#debts-add-plan'); await d.see('#debt-screen');
    await d.type('#debt-name', 'Phone'); await d.type('#debt-total', '3600'); await d.type('#debt-monthly', '300'); await d.type('#debt-payments', '12');
    await d.tap('#debt-card'); await d.tapIn('debt-card-options', 'Visa');
    await d.tap('#debt-save-bottom'); await d.see('#debts-screen'); await d.see('Phone'); await d.shot('debts-with-plan');
  });
  await step('add unlinked plan', async () => {
    await d.tap('#debts-add-plan'); await d.type('#debt-name', 'Sofa'); await d.type('#debt-total', '1200'); await d.type('#debt-monthly', '200'); await d.type('#debt-payments', '6');
    await d.tap('#debt-save-bottom'); await d.see('Sofa'); d.sofaRow = await d.text('Sofa', { last: false }).catch(() => '');
    d.sofaRow = (await d.page.locator('[data-testid^="debt-item-"]').filter({ hasText: 'Sofa' }).filter({ visible: true }).first().innerText()).replace(/\s+/g, ' ');
  });
  await step('hero stats reflect all debts', async () => {
    await d.seeText('#debts-total', /AED/); await d.seeText('#debts-monthly', /AED/); await d.shot('debts-hero');
  });
  await step('log an extra payment of 1000 on the loan (dated today, the default)', async () => {
    await d.tap('Car loan'); await d.see('#debt-screen'); await d.see('Remaining'); await d.seeText('#debt-summary', /20,000\.00/);
    await d.tap('#debt-log-payment'); await d.tap('#debt-payment-kind-extra'); await d.type('#debt-payment-amount', '1000'); await d.tap('#debt-payment-save');
    await d.see('#debt-log-item-0'); await d.shot('loan-payment-logged');
  });
  await step('APP CHECK: an extra payment logged on the day the loan was added lowers Remaining', async () => {
    await d.seeText('#debt-summary', /19,000\.00/);
  }, { soft: true });
  await step('log a second extra payment dated tomorrow: Remaining drops', async () => {
    const tm = new Date(Date.now() + 86400000); const iso = `${tm.getFullYear()}-${String(tm.getMonth() + 1).padStart(2, '0')}-${String(tm.getDate()).padStart(2, '0')}`;
    await d.tap('#debt-log-payment'); await d.tap('#debt-payment-kind-extra'); await d.type('#debt-payment-amount', '500'); await d.type('#debt-payment-date', iso); await d.tap('#debt-payment-save');
    await d.see('#debt-log-item-1'); await d.seeText('#debt-summary', /19,500\.00|18,500\.00/);
  });
  await step('delete both logged payments', async () => {
    await d.alertPick('Delete'); await d.tap('#debt-log-delete-0'); await d.see('#debt-log-item-0'); await d.notSee('#debt-log-item-1');
    await d.tap('#debt-log-delete-0'); await d.see('#debt-log-empty'); await d.seeText('#debt-summary', /20,000\.00/); await d.clearAlerts();
  });
  await step('skip, undo and move a scheduled payment', async () => {
    await d.tap('#debt-payment-0-skip'); await d.see('#debt-payment-0-undo'); await d.shot('loan-skipped');
    await d.tap('#debt-payment-0-undo'); await d.see('#debt-payment-0-skip');
    await d.tap('#debt-payment-0-move'); await d.type('#debt-override-date', '2026-12-20'); await d.tap('#debt-override-save'); await d.see('was 15 Dec 2026');
    await d.tap('#debt-payment-0-amount'); await d.type('#debt-override-amount', '1800'); await d.tap('#debt-override-save'); await d.see('1,800.00'); await d.shot('loan-overrides');
    await d.tap('#debt-payment-0-reset');
  });
  await step('discard prompt on the debt form', async () => {
    await d.clearAlerts(); await d.type('#debt-monthly', '1600'); await d.back();
    if (!(await d.alerts()).some((a) => a.title === 'Discard changes?')) throw new Error('no Discard changes? prompt on debt form');
    await d.alertPick('Discard'); await d.back(); await d.see('#debts-screen'); await d.clearAlerts();
  });
  await step('Home Coming up lists the loan payment', async () => {
    await d.back(); await d.tab('Home'); await d.see('#dashboard-upcoming'); await d.shot('home-with-debts'); await d.see('Visa payment');
  });
  await step('APP CHECK: instalment progress is the same on Debts and on Home', async () => {
    const debts = /(\d+) of 6 paid/.exec(d.sofaRow || '')?.[1];
    const home = (await d.page.locator('[data-testid^="dashboard-upcoming-"]').filter({ hasText: 'Sofa instalment' }).filter({ visible: true }).first().innerText()).replace(/\s+/g, ' ');
    const h = /(\d+) of 6 paid/.exec(home)?.[1];
    if (debts !== h) throw new Error(`Debts list says "${debts} of 6 paid" for Sofa but Home Coming up says "${h} of 6 paid" (${home}); see src/features/debts/Parts.tsx vs src/features/dashboard/upcoming.ts`);
  }, { soft: true });
  await step('archive (mark as paid off) the Sofa plan', async () => {
    await d.tab('Plan'); await d.tap('#plan-open-debts'); await d.see('#debts-screen');
    await d.tap('Sofa'); await d.see('#debt-screen'); await d.tap('#debt-archive'); await d.settle(400);
    if (await d.has('#debt-screen')) { await d.back(); }
    await d.see('#debts-screen'); await d.see('#debts-paid-off-toggle'); await d.tap('#debts-paid-off-toggle'); await d.see('#debts-paid-off'); await d.shot('debts-paid-off');
  });
  await step('delete a debt (Phone plan)', async () => {
    await d.tap('Phone'); await d.see('#debt-screen'); await d.alertPick('Delete'); await d.tap('#debt-delete');
    await d.see('#debts-screen'); await d.notSee('Phone', { exact: true }); await d.clearAlerts();
  });
});

const iso = (plusDays) => { const t = new Date(Date.now() + plusDays * 86400000); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

add('5 Cheques', async (d, step) => {
  await step('Plan shows the Cheques card without any switch', async () => {
    await d.tab('Settings'); await d.see('#settings-screen');
    if (await d.has('#settings-module-cheques') || await d.has('#settings-module-debts')) throw new Error('Settings still has module switches');
    await d.tab('Plan'); await d.see('#plan-open-cheques'); await d.shot('plan-with-cheques-card');
  });
  await step('Cheques empty state', async () => { await d.tap('#plan-open-cheques'); await d.see('#cheques-screen'); await d.see('No cheques yet'); await d.shot('cheques-empty'); });
  await step('add a single cheque (rent, 4000)', async () => {
    await d.tap('#cheques-add'); await d.see('#cheque-screen');
    await d.type('#cheque-payee', 'Dubai Landlord'); await d.type('#cheque-amount', '4000'); await d.type('#cheque-date', iso(20)); await d.type('#cheque-purpose', 'Rent');
    await d.tap('#cheque-save-bottom'); await d.see('#cheques-screen'); await d.see('Dubai Landlord'); await d.see('#cheques-hero'); await d.shot('cheques-one');
  });
  await step('add a series of 4 cheques every 3 months', async () => {
    await d.tap('#cheques-add-series'); await d.see('#cheque-series-screen');
    await d.type('#series-payee', 'Landlord'); await d.type('#series-amount', '3000'); await d.type('#series-count', '4'); await d.type('#series-every', '3'); await d.type('#series-date', iso(40));
    await d.see('#series-preview-3'); await d.shot('cheque-series-form'); await d.tap('#series-save');
    await d.see('#cheques-screen'); await d.see('#cheque-item-4'); await d.notSee('#cheque-item-5'); await d.shot('cheques-series');
  });
  await step('mark the first cheque cleared', async () => {
    await d.tap('#cheque-clear-0'); await d.see('Cleared', { exact: true }); await d.notSee('#cheque-item-5'); await d.shot('cheques-cleared');
  });
  await step('Home/forecast still loads with cheques (alerts card, no crash)', async () => {
    await d.back(); await d.tab('Home'); await d.see('#dashboard-screen'); await d.shot('home-with-cheques');
    await d.tab('Plan'); await d.tap('#plan-open-cheques'); await d.see('#cheques-screen');
  });
  await step('edit first series cheque to 3500 and apply to later cheques', async () => {
    await d.tap('Landlord', { exact: true }); await d.see('#cheque-screen');
    await d.type('#cheque-amount', '3500'); await d.tap('#cheque-apply-later'); await d.shot('cheque-apply-later');
    await d.tap('#cheque-save-bottom'); await d.see('#cheques-screen');
    const n = await d.page.getByText('3,500.00').and(d.page.locator(':not([inert] *)')).filter({ visible: true }).count();
    if (n < 3) throw new Error(`expected the series to show 3,500.00 on 3 upcoming cheques, found ${n}`);
  });
  await step('cancel one cheque, then delete another', async () => {
    await d.tap('Landlord', { exact: true }); await d.tap('#cheque-status-cancelled'); await d.tap('#cheque-save-bottom'); await d.see('#cheques-screen');
    await d.see('#cheques-cancelled-toggle'); await d.tap('#cheques-cancelled-toggle'); await d.shot('cheques-cancelled');
    await d.tap('Dubai Landlord'); await d.see('#cheque-screen'); await d.alertPick('Delete'); await d.tap('#cheque-delete');
    await d.see('#cheques-screen'); await d.notSee('Dubai Landlord', { exact: true }); await d.clearAlerts();
  });
  await step('discard prompt on the cheque form', async () => {
    await d.clearAlerts(); await d.tap('Landlord', { exact: true }); await d.type('#cheque-payee', 'Changed'); await d.back();
    if (!(await d.alerts()).some((a) => a.title === 'Discard changes?')) throw new Error('no Discard changes? prompt on cheque form');
    await d.alertPick('Discard'); await d.back(); await d.see('#cheques-screen'); await d.clearAlerts();
  });
});

// Types a PIN. Choosing a PIN has a Continue button; re-entering or checking one submits on the last digit.
const pin = async (d, prefix, digits) => {
  for (const k of digits) await d.tap(`#${prefix}-key-${k}`);
  await d.settle(250);
  if (prefix === 'pin' && (await d.has('#pin-submit')) && !(await d.page.locator('[data-testid="pin-submit"]').filter({ visible: true }).first().isDisabled())) await d.tap('#pin-submit');
  await d.settle(250);
};

add('6 Alerts', async (d, step) => {
  await step('Settings: the phone notifications switch is on by default; notifications say "not available in the web preview"', async () => {
    await d.tab('Settings'); await d.see('#settings-alerts'); await d.see('#settings-alerts-status'); await d.shot('settings-alerts');
  });
  await step('Settings: Bill reminders is on; set the lead time to 2 days, then back to 1 day', async () => {
    await d.see('#settings-bill-reminders'); await d.see('#settings-bill-lead-1');
    await d.tap('#settings-bill-lead-2'); await d.settle(300);
    await d.see('2 days before');
    await d.shot('settings-bill-lead'); await d.tap('#settings-bill-lead-1'); await d.settle(300);
  });
  await step('Home Coming up: the bell mutes and unmutes reminders for an item', async () => {
    await d.tab('Home'); await d.see('#dashboard-upcoming');
    // Only costs have a bell; a run of just this section has only the salary, so there is nothing to toggle.
    if (!(await d.has('#upcoming-bell-0'))) { await d.tab('Settings'); await d.see('#settings-alerts'); return; }
    const bell = () => d.page.locator('[data-testid="upcoming-bell-0"]').filter({ visible: true }).first();
    await bell().click(); await d.settle(400);
    if (!(await bell().innerText()).includes('🔕')) throw new Error('bell did not switch the reminder off');
    await d.shot('home-bell-muted');
    await bell().click(); await d.settle(400);
    if (!(await bell().innerText()).includes('🔔')) throw new Error('bell did not switch the reminder back on');
    await d.tab('Settings'); await d.see('#settings-alerts');
  });
  await step('set alert levels low (caution 5%, high 10%, card 20%) and save', async () => {
    await d.type('#settings-threshold-caution', '5'); await d.type('#settings-threshold-high', '10'); await d.type('#settings-threshold-card', '20');
    await d.tap('#settings-thresholds-save'); await d.settle(300); await d.shot('alerts-thresholds');
  });
  await step('Home shows the alerts card with debt and card alerts', async () => {
    await d.tab('Home'); await d.see('#alerts-card'); await d.see('#alert-0'); await d.shot('home-alerts');
    const txt = await d.text('#alerts-card');
    if (!/debt|card|balance|cheque/i.test(txt)) throw new Error(`alerts card has no recognisable alert: ${txt.slice(0, 200)}`);
  });
  await step('wording is factual (no "you should")', async () => {
    const txt = await d.text('#alerts-card');
    if (/you should/i.test(txt)) throw new Error(`advice wording in alerts: ${txt}`);
  });
  await step('restore thresholds (40 / 50 / 80)', async () => {
    await d.tab('Settings'); await d.type('#settings-threshold-caution', '40'); await d.type('#settings-threshold-high', '50'); await d.type('#settings-threshold-card', '80');
    await d.tap('#settings-thresholds-save'); await d.settle(300);
  });
  await step('Phone notifications off keeps the alerts card on Home (alerts always show in the app)', async () => {
    await d.type('#settings-threshold-caution', '5'); await d.type('#settings-threshold-high', '10'); await d.tap('#settings-thresholds-save'); await d.settle(300);
    await d.tap('#settings-notifications'); await d.settle(300);
    await d.tab('Home'); await d.see('#dashboard-screen'); await d.settle(300);
    await d.see('#alerts-card'); await d.shot('home-notifications-off');
    await d.tab('Settings'); await d.tap('#settings-notifications'); await d.settle(300);
    await d.tab('Home'); await d.see('#alerts-card');
    await d.tab('Settings'); await d.type('#settings-threshold-caution', '40'); await d.type('#settings-threshold-high', '50'); await d.tap('#settings-thresholds-save');
  });
});

add('7 Profiles and appearance', async (d, step) => {
  await step('profile switcher lists "Me" with Add profile', async () => {
    await d.tab('Home'); await d.tap('#profile-button'); await d.see('#profile-sheet'); await d.see('#profile-row-0'); await d.see('#profile-add');
    if (await d.has('#appearance-segmented-dark')) throw new Error('the profile switcher still has the appearance switch'); await d.shot('profile-sheet');
  });
  await step('add profile Layla -> her own wizard', async () => {
    await d.tap('#profile-add'); await d.type('#profile-name-input', 'Layla'); await d.tap('#profile-create');
    await d.see('#onboarding-profile-name'); await d.see('Setting up Layla'); await d.shot('layla-wizard');
  });
  await step("Layla's wizard: salary 9000 payday 1, balance 1000", async () => {
    await d.type('#onboarding-salary', '9000'); await d.tap('#onboarding-next'); await d.tap('#onboarding-payday'); await d.tap('#onboarding-payday-option-1');
    await d.tap('#onboarding-next'); await d.type('#onboarding-balance', '1000');
    for (let i = 0; i < 6 && !(await d.has('#onboarding-start')); i++) await d.tap('#onboarding-next');
    await d.tap('#onboarding-start'); await d.see('#dashboard-screen'); await d.see('Layla'); await d.shot('layla-home');
  });
  await step("Layla's data is separate (no Rent, no Car loan)", async () => {
    await d.tab('Plan'); await d.see('Salary'); await d.seeText('#plan-total-income', /9,000\.00/);
    if (await d.has('Rent', { exact: true })) throw new Error("Layla's Plan shows Me's Rent");
    await d.shot('layla-plan');
  });
  await step('switch back to Me: data intact', async () => {
    await d.tab('Home'); await d.tap('#profile-button'); await d.tap('#profile-row-0'); await d.see('#dashboard-screen'); await d.settle(400);
    await d.tab('Plan'); await d.see('Rent'); await d.seeText('#plan-total-income', /18,000\.00/); await d.shot('me-plan-after-switch');
  });
  await step('rename Layla to "Layla K" in Manage profiles', async () => {
    await d.tab('Settings'); await d.tap('#settings-manage-profiles'); await d.see('#profiles-screen');
    await d.tap('#profile-edit-1'); await d.type('#profile-edit-name-input', 'Layla K'); await d.tap('#profile-edit-save');
    await d.see('Layla K'); await d.shot('profiles-renamed');
  });
  await step('delete Layla K with the typed name (any profile can be deleted)', async () => {
    await d.tap('#profile-delete-1'); await d.see('#profile-delete-sheet'); await d.type('#profile-delete-input', 'Layla K');
    await d.tap('#profile-delete-confirm'); await d.notSee('Layla K', { exact: true });
  });
  await step('Appearance: Dark, Light, System with screenshots (Settings and Home)', async () => {
    await d.back(); await d.see('#settings-appearance-dark');
    for (const v of ['dark', 'light', 'system']) {
      await d.tap(`#settings-appearance-${v}`); await d.settle(300); await d.shot(`settings-${v}`);
    }
    await d.tap('#settings-appearance-dark'); await d.tab('Home'); await d.settle(300); await d.shot('home-dark');
    await d.tab('Month'); await d.settle(300); await d.shot('month-dark');
    await d.tab('Plan'); await d.settle(300); await d.shot('plan-dark');
    await d.tab('Settings'); await d.tap('#settings-appearance-light'); await d.tab('Home'); await d.settle(300); await d.shot('home-light');
  });
});

add('8 Quick add', async (d, step) => {
  await step('+ button opens the sheet with three rows', async () => {
    await d.tab('Home'); await d.tap('#quick-add'); await d.see('#quick-add-sheet'); await d.see('#quick-add-income'); await d.see('#quick-add-cost'); await d.see('#quick-add-one-time'); await d.shot('quick-add-sheet');
  });
  await step('Recurring income row opens the income form; add Freelance 1000', async () => {
    await d.tap('#quick-add-income'); await d.see('#recurring-screen'); await d.see('New recurring income');
    await d.type('#recurring-name', 'Freelance'); await d.type('#recurring-amount', '1000'); await d.tap('#recurring-save-bottom'); await d.notSee('#recurring-screen');
  });
  await step('Recurring cost row opens the cost form', async () => {
    await d.tap('#quick-add'); await d.tap('#quick-add-cost'); await d.see('New recurring cost'); await d.back(); await d.notSee('#recurring-screen');
  });
  await step('One-time row opens the one-time form; add Coffee 12', async () => {
    await d.tap('#quick-add'); await d.tap('#quick-add-one-time'); await d.see('#transaction-screen');
    await d.type('#transaction-description', 'Coffee'); await d.type('#transaction-amount', '12'); await d.tap('#transaction-save-bottom'); await d.notSee('#transaction-screen');
  });
  await step('sheet closes when tapping outside', async () => {
    await d.tap('#quick-add'); await d.see('#quick-add-sheet');
    await d.page.getByLabel('Close', { exact: true }).first().click({ position: { x: 10, y: 10 } }); await d.notSee('#quick-add-sheet');
  });
});

add('8b Import: a free user sees the Pro screen', async (d, step) => {
  // The web build has no EXPO_PUBLIC_PRO_PREVIEW, so this is a free user: the screen explains import and offers Pro, and reads nothing.
  let free = true;
  await step('Plan has the Import statements card; it opens the Pro screen with no import actions', async () => {
    await d.tab('Plan'); await d.see('#plan-open-import'); await d.tap('#plan-open-import');
    await d.see('#import-screen');
    // A Pro-preview build (EXPO_PUBLIC_PRO_PREVIEW=1) has no free user: section 13 covers it, this one is skipped.
    if (await d.has('#import-choose-file')) { free = false; console.log('  (Pro-preview build: the free-user checks are skipped)'); await d.back(); return; }
    await d.see('#import-pro-badge'); await d.see('#import-unlock'); await d.see('PDF statements'); await d.see('Excel and CSV');
    for (const id of ['import-choose-file', 'import-take-photo', 'import-choose-photo', 'import-paste-sms', 'import-sms-input', 'import-read']) {
      if (await d.has('#' + id)) throw new Error(`${id} must not show for a free user`);
    }
    await d.shot('import-pro-screen');
  });
  await step('Unlock Pro explains that Pro comes with the next update (no crash)', async () => {
    if (!free) return;
    await d.clearAlerts(); await d.tap('#import-unlock'); await d.settle(300);
    const alerts = JSON.stringify(await d.alerts());
    if (!/Pro comes with the next update/.test(alerts)) throw new Error('no Pro alert: ' + alerts);
    await d.see('#import-screen');
  });
  await step('the review and column screens are the Pro screen for a free user (never parse)', async () => {
    if (!free) return;
    await d.back(); await d.see('#plan-screen');
    await d.tab('Home'); await d.tap('#quick-add'); await d.see('#quick-add-import'); await d.tap('#quick-add-import');
    await d.see('#import-screen'); await d.see('#import-unlock'); await d.back();
  });
});

add('9 Categories', async (d, step) => {
  await step('open Categories from Settings', async () => { await d.tab('Settings'); await d.tap('#settings-categories'); await d.see('#categories-screen'); await d.see('Housing'); await d.shot('categories'); });
  await step('add category "Pets"', async () => {
    await d.tap('#categories-add'); await d.type('#category-name', 'Pets'); await d.tap('#category-save'); await d.see('Pets'); await d.shot('categories-added');
  });
  await step('set a monthly limit on Pets, then clear it', async () => {
    await d.tap('Pets', { exact: true }); await d.type('#category-limit-input', '250'); await d.tap('#category-save');
    await d.see('Limit AED 250.00 a month'); await d.shot('categories-limit');
    await d.tap('Pets', { exact: true }); await d.type('#category-limit-input', ''); await d.tap('#category-save');
    await d.notSee('Limit AED 250.00 a month');
  });
  await step('rename Pets to "Pet care"', async () => {
    await d.tap('Pets', { exact: true }); await d.type('#category-name', 'Pet care'); await d.tap('#category-save'); await d.see('Pet care'); await d.notSee('Pets', { exact: true });
  });
  await step('empty name is refused', async () => {
    await d.tap('#categories-add'); await d.type('#category-name', ' '); await d.tap('#category-save'); await d.see('#category-name'); await d.tap('#category-cancel');
  });
  await step('new category is offered in an item form', async () => {
    await d.back(); await d.tab('Plan'); await d.tap('#plan-add-cost'); await d.tap('#recurring-category'); await d.see('Pet care'); await d.back();
  });
  await step('remove "Pet care"', async () => {
    await d.tab('Settings'); await d.tap('#settings-categories'); await d.tap('Pet care'); await d.alertPick('Remove'); await d.tap('#category-remove');
    await d.notSee('Pet care', { exact: true }); await d.clearAlerts(); await d.back();
  });
});

add('10 Lock (PIN)', async (d, step) => {
  await step('turn Lock on: set PIN 1234 and confirm it', async () => {
    await d.tab('Settings'); await d.tap('#settings-lock-toggle'); await d.see('#pin-prompt'); await d.shot('pin-set');
    await pin(d, 'pin', '1234'); await d.settle(300);
    await pin(d, 'pin', '1234'); await d.see('#settings-lock-change'); await d.shot('lock-on');
  });
  await step('app stays open right after setting the PIN', async () => { await d.see('#settings-screen'); });
  await step('short background (10 s) does not lock', async () => { await d.backgroundFor(10_000); await d.see('#settings-screen'); await d.notSee('#lock-screen'); });
  await step('background over 60 s re-locks; wrong PIN is refused; right PIN opens', async () => {
    await d.tab('Settings'); await d.backgroundFor(65_000); await d.see('#lock-screen'); await d.shot('lock-screen');
    await pin(d, 'lock', '9999'); await d.see('#lock-message'); await d.notSee('#settings-screen'); await d.shot('lock-wrong-pin');
    await pin(d, 'lock', '1234'); await d.see('#dashboard-screen'); await d.shot('unlocked');
  });
  await step('Forgot PIN sheet opens and cancels', async () => {
    await d.backgroundFor(65_000); await d.see('#lock-screen'); await d.tap('#lock-forgot'); await d.see('#lock-forgot-sheet'); await d.shot('lock-forgot'); await d.tap('#lock-forgot-cancel');
    await pin(d, 'lock', '1234'); await d.see('#dashboard-screen'); await d.tab('Settings');
  });
  await step('Change PIN to 5678', async () => {
    await d.tap('#settings-lock-change'); await d.see('#pin-prompt');
    await pin(d, 'pin', '1234'); await d.settle(300);
    await pin(d, 'pin', '5678'); await d.settle(300);
    await pin(d, 'pin', '5678'); await d.settle(400); await d.see('#settings-lock-change');
  });
  await step('turn Lock off (needs the PIN)', async () => {
    await d.tap('#settings-lock-toggle'); await d.see('#pin-prompt'); await pin(d, 'pin', '5678'); await d.settle(400);
    await d.notSee('#settings-lock-change'); await d.shot('lock-off');
    await d.backgroundFor(65_000); await d.notSee('#lock-screen'); await d.see('#settings-screen');
  });
});

add('11 Settings: money, exports and backup', async (d, step) => {
  await step('update balance to 7000', async () => {
    await d.tab('Settings'); await d.type('#settings-balance', '7000'); await d.tap('#settings-balance-save'); await d.settle(300); await d.seeText('#settings-balance-current', /7,000\.00/);
  });
  await step('update buffer to 2500', async () => {
    await d.type('#settings-buffer', '2500'); await d.tap('#settings-buffer-save'); await d.settle(300); await d.seeText('#settings-buffer-current', /2,500\.00/);
  });
  await step('payday change to day 28 is shown', async () => {
    await d.tap('#settings-payday'); await d.tap('#settings-payday-option-28'); await d.settle(300); await d.see('Day 28', { exact: true });
  });
  await step('currency label save keeps the label', async () => {
    await d.type('#settings-currency', 'AED'); await d.settle(100); await d.see('#settings-currency-save');
  });
  await step('Home shows the new balance', async () => { await d.tab('Home'); await d.see('AED 7,000', { exact: true }); await d.tab('Settings'); });
  await step('tap backup and the one CSV export (no crash)', async () => {
    for (const id of ['settings-backup', 'settings-export-csv']) { await d.tap('#' + id); await d.settle(500); }
    for (const id of ['settings-export-debts-csv', 'settings-export-cheques-csv', 'settings-delete-all']) if (await d.has('#' + id)) throw new Error(`${id} should be gone from Settings`);
    await d.see('#settings-screen'); await d.shot('settings-after-exports');
  });
  await step('Restore button opens the picker without crashing', async () => { await d.tap('#settings-restore'); await d.settle(500); await d.see('#settings-screen'); });
  await step('About shows version and the not-advice note', async () => { await d.see('#settings-version'); await d.see('not financial advice'); });
});

add('12 Delete profile', async (d, step) => {
  await step('Settings has no Delete all data; the data note points to Manage profiles', async () => {
    await d.tab('Settings'); await d.notSee('Delete all data'); await d.seeText('#settings-data-note', /Manage profiles/);
  });
  await step('the only profile can be deleted: cancel keeps it', async () => {
    await d.tap('#settings-manage-profiles'); await d.see('#profiles-screen'); await d.tap('#profile-delete-0'); await d.see('#profile-delete-sheet');
    await d.see('only profile'); await d.shot('delete-only-profile');
    await d.tap('#profile-delete-cancel'); await d.see('#profiles-screen');
  });
  await step('typed name deletes it -> a fresh Me starts at the wizard', async () => {
    await d.tap('#profile-delete-0'); await d.type('#profile-delete-input', 'Me'); await d.tap('#profile-delete-confirm');
    await d.see('#onboarding-screen'); await d.see('Welcome', { exact: true }); await d.shot('after-delete-profile');
  });
  await step('skip every step -> empty Home, Plan, Month, Debts', async () => {
    for (let i = 0; i < 6 && !(await d.has('#onboarding-start')); i++) await d.tap('#onboarding-next');
    await d.tap('#onboarding-start'); await d.see('#dashboard-screen'); await d.see('Welcome to Money Planner'); await d.shot('empty-home');
    await d.tab('Plan'); await d.see('Plan your regular money'); await d.shot('empty-plan');
    await d.tab('Month'); await d.see('Nothing in this month'); await d.shot('empty-month');
    await d.tab('Plan'); await d.tap('#plan-open-debts'); await d.see('Track what you owe'); await d.shot('empty-debts');
  });
});

// Runs only on a Pro-preview web build (EXPO_PUBLIC_PRO_PREVIEW=1 npm run walkthrough); on the normal free build it checks
// that the Pro screen shows (section 8b covers it in detail) and passes without importing. Runs last, on the fresh empty profile.
add('13 Import (Pro preview build only)', async (d, step) => {
  let pro = false;
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const SMS = `Purchase of AED 45.00 at CAREEM on ${dd}-${mm}-${today.getFullYear()} 12:30 using card ending 1234. Avl Bal AED 2,345.10.`;
  const CSV = `Date,Description,Debit,Credit,Balance\n${dd}/${mm}/${today.getFullYear()},SALARY ACME,,"1,000.00","1,000.00"\n${dd}/${mm}/${today.getFullYear()},COFFEE BEAN DUBAI,12.50,,987.50\n`;
  const aria = async (id) => (await d.loc(id).getAttribute('aria-label')) ?? '';
  const openImport = async () => { await d.tab('Plan'); await d.tap('#plan-open-import'); await d.see('#import-screen'); };
  /** Imports the open review and goes to Month. */
  const finish = async () => { await d.tap('#review-import'); await d.see('#import-done'); await d.shot('import-done'); await d.tap('#review-done'); await d.see('#month-screen'); };
  const pickCsv = async (name, text) => {
    const [chooser] = await Promise.all([d.page.waitForEvent('filechooser', { timeout: 5000 }), d.tap('#import-choose-file')]);
    await chooser.setFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    await d.see('#review-screen');
  };

  await step('Plan > Import statements opens; a free build shows the Pro screen, a Pro build the import actions', async () => {
    await openImport();
    pro = await d.has('#import-choose-file');
    if (!pro) { await d.see('#import-unlock'); console.log('  (free build: the Pro import steps are skipped; run with EXPO_PUBLIC_PRO_PREVIEW=1 to cover them)'); await d.back(); return; }
    for (const id of ['import-take-photo', 'import-choose-photo', 'import-paste-sms']) await d.see('#' + id);
    if (await d.has('#import-unlock')) throw new Error('a Pro user must not see Unlock Pro');
    await d.shot('import-pro-actions');
  });
  await step('Month starts empty', async () => {
    if (!pro) return;
    await d.back(); await d.tab('Month'); await d.see('Nothing in this month');
  });
  await step('paste a bank SMS: review lists it, import it, Month shows it', async () => {
    if (!pro) return;
    await openImport(); await d.tap('#import-paste-sms'); await d.type('#import-sms-input', SMS); await d.tap('#import-read');
    await d.see('#review-screen'); await d.see('#review-row-0'); await d.seeText('#review-summary', /Import 1 item · AED 45 spending · AED 0 income/); await d.shot('import-review-sms');
    await finish();
    await d.see('CAREEM');
    if (!/AED 45\.00/.test(await aria('#month-spent'))) throw new Error(`Month spent is "${await aria('#month-spent')}", expected AED 45.00`);
  });
  await step('choose a CSV file (debit and credit columns): Month moves by exactly its rows', async () => {
    if (!pro) return;
    await openImport(); await pickCsv('bank.csv', CSV);
    await d.seeText('#review-summary', /Import 2 items · AED 12\.50 spending · AED 1,000 income/); await d.shot('import-review-csv');
    await finish();
    await d.see('COFFEE BEAN');
    const spent = await aria('#month-spent'); const income = await aria('#month-income');
    if (!/AED 57\.50/.test(spent)) throw new Error(`Month spent is "${spent}", expected AED 57.50`);
    if (!/AED 1,000\.00/.test(income)) throw new Error(`Month income is "${income}", expected AED 1,000.00`);
  });
  await step('the same CSV again: its rows are unticked as duplicates and nothing can be imported', async () => {
    if (!pro) return;
    await openImport(); await pickCsv('bank.csv', CSV);
    await d.see('Duplicate?'); await d.seeText('#review-summary', /Import 0 items/);
    if ((await d.loc('#review-import').getAttribute('aria-disabled')) !== 'true') throw new Error('Import selected must be disabled when every row is a duplicate');
    await d.shot('import-duplicates');
  });
});
