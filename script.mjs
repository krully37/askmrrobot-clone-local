
import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5175');
  await new Promise(r => setTimeout(r, 1000));
  
  // Select a character first!
  await page.evaluate(() => {
    const chars = document.querySelectorAll('.character-manager .spec-list button');
    if (chars.length) chars[0].click();
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav button'));
    btns.find(b => b.textContent === 'Droptimizer')?.click();
  });
  
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const sources = document.querySelectorAll('.source-tile');
    if (sources.length) sources[0].click();
  });
  
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const difficulties = document.querySelectorAll('.target-pills button');
    if (difficulties.length) difficulties[0].click();
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  const state = await page.evaluate(() => {
    const startBtn = document.querySelector('button.primary');
    return {
      disabled: startBtn?.disabled,
      classes: startBtn?.className,
      text: startBtn?.textContent,
      diff: document.querySelector('.target-pills button.selected')?.textContent,
      verifiedLength: document.querySelectorAll('.drops > div:not(.unavailable)').length,
      threads: document.querySelector('.compute-power input')?.value,
      errorText: document.querySelector('.result-warnings')?.textContent
    };
  });
  console.log(state);
  
  await browser.close();
})();

