export const sections = [];
const add = (name, fn) => sections.push([name, fn]);

add('1 Wizard', async (d, step) => {
  await step('welcome shown', async () => { await d.see('#onboarding-screen'); await d.see('Welcome', { exact: true }); await d.shot('welcome'); });
  await step('next to salary', async () => { await d.tap('#onboarding-next'); await d.see('Your salary'); });
  await step('type salary 18000', async () => { await d.type('#onboarding-salary', '18000'); });
  await step('pick payday 25', async () => { await d.tap('#onboarding-payday'); await d.tap('#onboarding-payday-option-25'); });
  await step('next to balance', async () => { await d.tap('#onboarding-next'); await d.see('Your balance today'); });
  await step('balance 6500 buffer 2000', async () => { await d.type('#onboarding-balance', '6500'); await d.type('#onboarding-buffer', '2000'); });
  await step('through to Start', async () => {
    for (let i = 0; i < 6 && !(await d.has('#onboarding-start')); i++) await d.tap('#onboarding-next');
    await d.see('#onboarding-summary');
    await d.seeText('#onboarding-summary', /Salary: AED 18,000\.00 every month, on day 25/);
    await d.shot('wizard-summary');
  });
  await step('start -> Home with balance', async () => {
    await d.tap('#onboarding-start');
    await d.see('#dashboard-screen');
    await d.see('AED 6,500', { exact: true }); await d.see('Coming up'); await d.see('Salary', { exact: true });
    await d.shot('home-after-wizard');
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
  await step('edit Rent amount to 9600', async () => {
    await d.tab('Plan'); await d.tap('Rent'); await d.see('#recurring-screen');
    await d.type('#recurring-amount', '9600'); await d.tap('#recurring-save-bottom');
    await d.see('#plan-screen'); await d.seeText('#plan-total-cost', /9,600\.00/);
  });
  await step('Discard changes? prompt: keep editing, then discard', async () => {
    await d.clearAlerts();
    await d.tap('Rent'); await d.see('#recurring-screen');
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
    await d.tap('Rent'); await d.see('#recurring-screen'); await d.see('Upcoming', { exact: true });
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
    await d.tab('Month'); await d.see('#month-screen'); await d.see('November 2026'); await d.see('Rent'); await d.shot('month-nov');
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
  await step('month stepper: next, next, previous, Today', async () => {
    await d.tap('#month-next'); await d.see('December 2026'); await d.see('Rent'); await d.shot('month-dec');
    await d.tap('#month-next'); await d.see('January 2027');
    await d.tap('#month-prev'); await d.see('December 2026');
    await d.tap('#month-today'); await d.see('November 2026');
  });
  await step('past month is empty or lists items without error', async () => {
    await d.tap('#month-prev'); await d.tap('#month-prev'); await d.tap('#month-prev'); await d.see('August 2026');
    await d.shot('month-aug'); await d.tap('#month-today'); await d.see('November 2026');
  });
});
