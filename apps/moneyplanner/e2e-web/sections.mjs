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
    await d.see('Balance today: AED 6,500.00');
    await d.shot('home-after-wizard');
    await d.dump('home');
  });
});
