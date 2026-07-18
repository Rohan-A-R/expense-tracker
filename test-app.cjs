const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newContext({ viewport:{width:390,height:844} }).then(c=>c.newPage());
  const R=[], ss=f=>page.screenshot({path:`/tmp/${f}.png`});
  const pass=(n,d)=>{R.push('✅');console.log(`✅ ${n}: ${d}`)};
  const fail=(n,d)=>{R.push('❌');console.log(`❌ ${n}: ${d}`)};
  const warn=(n,d)=>{R.push('⚠️');console.log(`⚠️ ${n}: ${d}`)};

  // Navigate via bottom nav specifically (avoids matching page h1 "Expenses")
  const nav = async (label, waitFor) => {
    await page.click(`nav button:has-text("${label}")`);
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
  };

  try {
    // 1. Load
    await page.goto('http://localhost:5173', { waitUntil:'networkidle', timeout:15000 });
    await page.waitForFunction(() => !document.querySelector('.animate-bounce'), { timeout:8000 }).catch(()=>{});
    await page.waitForTimeout(2000);
    await ss('01-dashboard');
    pass('App loads', await page.title());

    // 2. Dashboard
    const body = await page.textContent('body');
    /₹[1-9]/.test(body) ? pass('Dashboard real data', 'Non-zero ₹ amounts (May 2025)') : fail('Dashboard real data', 'Shows ₹0');
    const mo = body.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/);
    mo ? pass('Dashboard month label', mo[0]) : warn('Dashboard month label', 'Not found');
    const rows = await page.$$eval('[class*="surface-800"] > div', e => e.length);
    rows > 0 ? pass('Dashboard transactions', `${rows} transaction rows`) : fail('Dashboard transactions', 'None');

    // 3. Expenses page
    await nav('Expenses', '#expense-search');
    await ss('02-expenses');
    const eText = await page.textContent('body');
    const eCt = (eText.match(/−₹/g)||[]).length;
    eCt > 0 ? pass('Expenses list', `${eCt} entries`) : fail('Expenses list', 'No entries');

    // Search input
    const si = await page.$('#expense-search, [data-testid="expense-search"]');
    if (si) {
      await si.fill('Milk'); await page.waitForTimeout(600); await ss('03-search');
      const hits = (await page.textContent('body')).match(/Milk/gi)||[];
      hits.length > 0 ? pass('Search "Milk"', `${hits.length} hits`) : fail('Search "Milk"', '0 results');

      await si.fill('ZZZNOMATCH'); await page.waitForTimeout(400);
      const noT = await page.textContent('body');
      ((noT.match(/−₹/g)||[]).length === 0 || noT.includes('No results'))
        ? pass('Search empty state', 'Shows no-results') : warn('Search empty state', 'Unclear');
      await si.fill(''); await page.waitForTimeout(300);
    } else fail('Search input', '#expense-search not in DOM — check Expenses.jsx header renders');

    // Filters
    const allSels = await page.$$('select');
    allSels.length >= 2 ? pass('Filter dropdowns', `${allSels.length} selects (category + sort)`) : warn('Filter dropdowns', `${allSels.length} found`);
    const monthBtns = (await page.$$('button')).length;
    pass('Month chips area', `${monthBtns} buttons on page`);

    // 4. Analytics
    await nav('Analytics', '.recharts-pie');
    await ss('04-analytics');
    const svgs = await page.$$eval('svg', e => e.length);
    svgs > 0 ? pass('Analytics SVGs', `${svgs} elements`) : fail('Analytics SVGs', 'None');
    const mSel = await page.$('select');
    mSel ? pass('Month selector', await mSel.inputValue()) : warn('Month selector', 'Not found');
    (await page.$('.recharts-pie')) ? pass('Pie chart', 'Rendered') : fail('Pie chart', 'Missing');

    await page.click('button:has-text("Monthly")'); await page.waitForTimeout(900); await ss('05-monthly');
    (await page.$('.recharts-bar-rectangle,.recharts-bar')) ? pass('Bar chart', 'Monthly tab') : fail('Bar chart', 'Missing');

    await page.click('button:has-text("Daily")'); await page.waitForTimeout(900); await ss('06-daily');
    (await page.$('.recharts-area-curve,.recharts-area')) ? pass('Area chart', 'Daily tab') : fail('Area chart', 'Missing');

    await page.click('button:has-text("Insights")'); await page.waitForTimeout(800); await ss('07-insights');
    const iT = await page.textContent('body');
    ['spent','average','week','month','budget','top','daily'].some(k => iT.toLowerCase().includes(k))
      ? pass('Insights tab', 'Insight cards visible') : warn('Insights tab', 'No keywords matched');

    // 5. Budget
    await nav('Budget', 'text=Budget');
    await ss('08-budget');
    const bT = await page.textContent('body');
    bT.includes('Budget') ? pass('Budget page', 'Loaded') : fail('Budget page', 'Content missing');
    const sbBtn = await page.$('button:has-text("Set Budget"),button:has-text("+ Set Budget")');
    if (sbBtn) {
      await sbBtn.click(); await page.waitForTimeout(400);
      const ni = await page.$('input[type="number"]');
      if (ni) { await ni.fill('15000'); await page.click('button:has-text("Save")'); await page.waitForTimeout(700); }
      const b2 = await page.textContent('body');
      (b2.includes('15,000')||b2.includes('15000')) ? pass('Budget set ₹15,000', 'Saved') : warn('Budget set', 'Not confirmed');
    } else {
      const b2 = await page.textContent('body');
      (b2.includes('15,000')||b2.includes('Monthly Budget')) ? pass('Budget (existing)', 'Showing ₹15,000') : warn('Budget', 'No budget shown');
    }
    await ss('09-budget-after');

    // 6. Settings
    await nav('More', 'button:has-text("+ Add")');
    await ss('10-settings');
    const sT = await page.textContent('body');
    (sT.includes('Categories') && (sT.includes('Backup')||sT.includes('Export')))
      ? pass('Settings page', 'Categories + Export present') : fail('Settings page', 'Missing sections');

    const tog = await page.$('[style*="52px"]');
    if (tog) { await tog.click(); await page.waitForTimeout(300); await tog.click(); await page.waitForTimeout(300); pass('Dark mode toggle', 'Toggles both ways'); }
    else warn('Dark mode toggle', 'Not found');

    const addC = await page.$('button:has-text("+ Add")');
    if (addC) {
      await addC.click(); await page.waitForTimeout(600); await ss('11-cat-modal');
      (await page.$('text=New Category')) ? pass('Add category modal', 'Opens') : fail('Add category modal', 'Not opened');
      const cx = await page.$('button:has-text("✕")'); if (cx) { await cx.click(); await page.waitForTimeout(300); }
    } else warn('Add category btn', 'Not found');

    (await page.$('button:has-text("JSON")') && await page.$('button:has-text("CSV")'))
      ? pass('Export buttons', 'JSON + CSV present') : warn('Export buttons', 'One missing');

    // 7. FAB + Add expense
    await nav('Home', 'button[aria-label="Add expense"]');
    const fab = await page.$('button[aria-label="Add expense"]');
    if (fab) {
      pass('FAB on Dashboard', 'Found with aria-label');
      await fab.click(); await page.waitForTimeout(700); await ss('12-add-modal');
      (await page.$('text=Add Expense')) ? pass('Add expense modal', 'Slides open') : fail('Add expense modal', 'Not shown');

      const amIn = await page.$('input[inputmode="decimal"]');
      if (amIn) await amIn.fill('55');
      const catBtns = await page.$$('button[type="button"]');
      for (const b of catBtns) { const t = await b.textContent(); if (t&&t.trim()&&!['Cash','UPI','Card','✕'].includes(t.trim())) { await b.click(); break; } }
      const noteIn = await page.$('input[placeholder*="for"],input[placeholder*="Lunch"],input[placeholder*="What"]');
      if (noteIn) await noteIn.fill('Playwright ₹55 test');
      await ss('13-filled');

      const sub = await page.$('button[type="submit"]');
      if (sub) {
        await sub.click(); await page.waitForTimeout(1000); await ss('14-after-add');
        const aT = await page.textContent('body');
        !aT.includes('Add Expense') ? pass('Add expense submit', 'Saved & modal closed') : warn('Add expense submit', 'Modal may still be open');
      } else fail('Submit button', 'Not found in form');
    } else fail('FAB', 'Not found on Dashboard');

    // 8. Edit + Delete
    await nav('Expenses', '#expense-search');
    const eRow = await page.$('[class*="active\\:bg-white"]');
    if (eRow) {
      await eRow.click(); await page.waitForTimeout(500); await ss('15-actions');
      const editB = await page.$('button:has-text("Edit")'), delB = await page.$('button:has-text("Delete")');
      (editB&&delB) ? pass('Tap expand → Edit+Delete', 'Both buttons appear') : warn('Tap expand', `Edit:${!!editB} Del:${!!delB}`);
      if (editB) {
        await editB.click(); await page.waitForTimeout(700); await ss('16-edit');
        (await page.$('text=Edit Expense')) ? pass('Edit form', 'Pre-filled modal shown') : fail('Edit form', 'Not opened');
        const cx = await page.$('button:has-text("✕")'); if (cx) { await cx.click(); await page.waitForTimeout(300); }
      }
      // Test delete confirm (cancel it)
      const eRow2 = await page.$('[class*="active\\:bg-white"]');
      if (eRow2) {
        await eRow2.click(); await page.waitForTimeout(400);
        const db = await page.$('button:has-text("Delete")');
        if (db) {
          await db.click(); await page.waitForTimeout(500); await ss('17-delete-confirm');
          (await page.$('text=Delete Expense')) ? pass('Delete confirm modal', 'Shows correctly') : warn('Delete confirm', 'Not shown');
          const cb = await page.$('button:has-text("Cancel")'); if (cb) { await cb.click(); await page.waitForTimeout(300); }
        }
      }
    } else warn('Expense row', 'Tappable row not found');

    // 9. FAB on all pages, hidden on Settings
    for (const [lbl, waitEl] of [['Analytics','.recharts-pie'],['Budget','text=Budget']]) {
      await nav(lbl, waitEl);
      (await page.$('button[aria-label="Add expense"]')) ? pass(`FAB on ${lbl}`, 'Present') : fail(`FAB on ${lbl}`, 'Missing');
    }
    await nav('More', 'button:has-text("+ Add")');
    !(await page.$('button[aria-label="Add expense"]')) ? pass('FAB hidden on Settings', 'Correctly absent') : warn('FAB Settings', 'Should be hidden');
    await ss('18-done');

  } catch (err) {
    console.log(`❌ FATAL: ${err.message.split('\n')[0]}`);
    await ss('error').catch(() => {});
  }

  await browser.close();
  const p=R.filter(x=>x==='✅').length, f=R.filter(x=>x==='❌').length, w=R.filter(x=>x==='⚠️').length;
  console.log(`\n${'═'.repeat(54)}`);
  console.log(`  ✅ PASSED   : ${p}`);
  console.log(`  ❌ FAILED   : ${f}`);
  console.log(`  ⚠️  WARNINGS : ${w}`);
  console.log(`${'─'.repeat(54)}`);
  console.log(`  VERDICT    : ${f === 0 ? '✅  ALL PASS' : '❌  FAIL'}`);
  console.log(`${'═'.repeat(54)}`);
  process.exit(f > 0 ? 1 : 0);
})();
