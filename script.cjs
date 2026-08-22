const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('request', req => { if(req.url().includes('/api/')) console.log('REQ:', req.method(), req.url()); });
  page.on('response', res => { if(res.url().includes('/api/')) console.log('RES:', res.status(), res.url()); });
  await page.goto('http://localhost:5174');
  await new Promise(r => setTimeout(r, 1000));
  const navBtns = await page.$$('nav button');
  for (const b of navBtns) {
    const text = await page.evaluate(el => el.textContent, b);
    if (text === 'Droptimizer') await b.click();
  }
  await new Promise(r => setTimeout(r, 500));
  const sources = await page.$$('.source-tile');
  if (sources.length) await sources[0].click();
  await new Promise(r => setTimeout(r, 500));
  const difficulties = await page.$$('.target-pills button');
  if (difficulties.length) await difficulties[0].click();
  await new Promise(r => setTimeout(r, 500));
  const startBtn = await page.$('button.primary');
  const disabled = await page.evaluate(el => el.disabled, startBtn);
  console.log('Button disabled?', disabled);
  if (!disabled) {
    await startBtn.click();
    await new Promise(r => setTimeout(r, 2000));
  }
  await browser.close();
})();
