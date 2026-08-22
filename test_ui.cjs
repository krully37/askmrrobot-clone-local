const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    Promise.all(msg.args().map(arg => arg.jsonValue())).then(args => {
      console.log('PAGE LOG:', ...args);
    });
  });
  
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2000);
  
  const navBtns = await page.$$('nav button');
  for (const btn of navBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Droptimizer')) {
      await btn.click();
      break;
    }
  }
  await page.waitForTimeout(1000);
  
  const sources = await page.$$('.source-tile');
  for (const s of sources) {
    const text = await page.evaluate(el => el.textContent, s);
    if (text.includes('Den of Nalorakk')) {
      await s.click();
      break;
    }
  }
  await page.waitForTimeout(1000);
  
  const diffs = await page.$$('.target-pills button');
  for (const d of diffs) {
    const text = await page.evaluate(el => el.textContent, d);
    if (text === 'Mythic+') {
      await d.click();
      break;
    }
  }
  await page.waitForTimeout(1000);
  
  const buttons = await page.$$('button');
  let startBtn;
  for (const b of buttons) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text.includes('Rank verified upgrades')) {
      startBtn = b;
      break;
    }
  }
  
  if (startBtn) {
    await startBtn.click();
  }
  
  await page.waitForTimeout(1000);
  await browser.close();
})();
