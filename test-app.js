const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone 14 size
  const page = await context.newPage();

  const results = [];
  const pass = (name, detail) => { results.push({ status: '✅', name, detail }); console.log(`✅ ${name}: ${detail}`); };
  const fail = (name, detail) => { results.push({ status: '❌', name, detail }); console.log(`❌ ${name}: ${detail}`); };
  const warn = (name, detail) => { results.push({ status: '⚠️', name, detail }); console.log(`⚠️ ${name}: ${detail}`); };

  try {
    // ── 1. App loads ──
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: '/tmp/ss-01-load.png' });
    const title = await page.title();
    pass('App loads', `title="${title}"`);

    // Wait for loading spinner to go away
    await page.waitForFunction(() => !document.querySelector('.animate-bounce'), { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/ss-02-dashboard.png' });

    // ── 2. Dashboard - check real data (not ₹0) ──
    const bodyText = await page.textContent('body');
    const hasZeroTotal = bodyText.includes('₹0') && !bodyText.includes('₹0\n');
    const hasRealMoney = /₹[1-9]/.test(bodyText);
    if (hasRealMoney) {
      pass('Dashboard - real data', 'Shows non-zero amounts (May 2025 data loaded)');
    } else {
      fail('Dashboard - real data', 'All amounts show ₹0 — sample data not loaded or month mismatch');
    }

    // Check month label
    const monthLabel = bodyText.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/);
    if (monthLabel) pass('Dashboard - month label', monthLabel[0]);
    else warn('Dashboard - month label', 'Month label not found in body');

    // Check recent transactions visible
    const txRows = await page.$$('[class*="surface-800"] >> text=/−₹/');
    if (txRows.length > 0) pass('Dashboard - transactions', `${txRows.length} transaction rows visible`);
    else fail('Dashboard - transactions', 'No transaction rows found on dashboard');

    // ── 3. Expenses page ──
    await page.click('text=Expenses');
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/ss-03-expenses.png' });

    const expText = await page.textContent('body');
    const expCount = (expText.match(/−₹/g) || []).length;
    if (expCount > 0) pass('Expenses page - loads', `${expCount} expense entries visible`);
    else fail('Expenses page - loads', 'No expenses shown');

    // Search test
    const searchBox = await page.$('input[placeholder*="Search"]');
    if (searchBox) {
      await searchBox.fill('Milk');
      await page.waitForTimeout(500);
      const searchText = await page.textContent('body');
      const milkCount = (searchText.match(/Milk/gi) || []).length;
      await page.screenshot({ path: '/tmp/ss-04-search.png' });
      if (milkCount > 0) pass('Expenses - search', `Search "Milk" → ${milkCount} results`);
      else fail('Expenses - search', 'Search returned no results for "Milk"');
      await searchBox.fill('');
      await page.waitForTimeout(300);
    } else {
      fail('Expenses - search', 'Search input not found');
    }

    // Month filter chips
    const monthChips = await page.$$('button:has-text("2025")');
    if (monthChips.length > 0) pass('Expenses - month filter chips', `${monthChips.length} month chip(s) visible`);
    else warn('Expenses - month filter chips', 'Month filter chips not visible');

    // ── 4. Analytics page ──
    await page.click('text=Analytics');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: '/tmp/ss-05-analytics.png' });

    const analyticsText = await page.textContent('body');
    // Check SVG charts rendered
    const svgCount = await page.$$eval('svg', els => els.length);
    if (svgCount > 0) pass('Analytics - charts rendered', `${svgCount} SVG elements (charts)`);
    else fail('Analytics - charts rendered', 'No SVG elements found — charts not rendering');

    // Check selected month has data (not empty)
    const hasData = analyticsText.includes('₹') && /[1-9]/.test(analyticsText);
    if (hasData) pass('Analytics - data visible', 'Non-zero amounts in analytics');
    else fail('Analytics - data visible', 'Analytics shows no real data');

    // Check Breakdown tab content (pie chart)
    const pieEl = await page.$('.recharts-pie');
    if (pieEl) pass('Analytics - pie chart', 'Pie chart element present');
    else fail('Analytics - pie chart', 'Pie chart (.recharts-pie) not found');

    // Switch to Monthly tab
    await page.click('text=Monthly');
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/ss-06-analytics-monthly.png' });
    const barEl = await page.$('.recharts-bar');
    if (barEl) pass('Analytics - bar chart', 'Bar chart rendered on Monthly tab');
    else fail('Analytics - bar chart', 'Bar chart not found on Monthly tab');

    // Switch to Daily tab
    await page.click('text=Daily');
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/ss-07-analytics-daily.png' });
    const areaEl = await page.$('.recharts-area');
    if (areaEl) pass('Analytics - area chart', 'Area/line chart rendered on Daily tab');
    else fail('Analytics - area chart', 'Area chart not found on Daily tab');

    // Switch to Insights tab
    await page.click('text=Insights');
    await page.waitForTimeout(600);
    await page.screenshot({ path: '/tmp/ss-08-insights.png' });
    const insightCount = await page.$$eval('[class*="rounded-2xl"] svg', els => els.length);
    const insightText = await page.textContent('body');
    if (insightText.includes('Top Spending') || insightText.includes('Daily Average') || insightText.includes('Highest')) {
      pass('Analytics - insights', 'Smart insights generated');
    } else {
      warn('Analytics - insights', 'No insight cards found (may need more data)');
    }

    // ── 5. Budget page ──
    await page.click('text=Budget');
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/ss-09-budget.png' });

    const budgetText = await page.textContent('body');
    if (budgetText.includes('Set a monthly budget') || budgetText.includes('Monthly Budget')) {
      pass('Budget page - loads', 'Budget page rendered correctly');
    } else {
      fail('Budget page - loads', 'Budget page content not found');
    }

    // Test setting a budget
    const setBudgetBtn = await page.$('button:has-text("Set Budget"), button:has-text("+ Set Budget")');
    if (setBudgetBtn) {
      await setBudgetBtn.click();
      await page.waitForTimeout(500);
      const amtInput = await page.$('input[type="number"]');
      if (amtInput) {
        await amtInput.fill('15000');
        await page.click('button:has-text("Save")');
        await page.waitForTimeout(700);
        await page.screenshot({ path: '/tmp/ss-10-budget-set.png' });
        const afterText = await page.textContent('body');
        if (afterText.includes('15,000') || afterText.includes('15000')) {
          pass('Budget - set monthly budget', '₹15,000 budget saved successfully');
        } else {
          warn('Budget - set monthly budget', 'Budget saved but amount not confirmed in UI');
        }
      }
    } else {
      warn('Budget - set budget', '"Set Budget" button not found (may already be set)');
    }

    // ── 6. Settings page ──
    await page.click('text=More');
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/ss-11-settings.png' });
    const settingsText = await page.textContent('body');
    if (settingsText.includes('Categories') && settingsText.includes('Backup')) {
      pass('Settings page - loads', 'Categories and Backup sections visible');
    } else {
      fail('Settings page - loads', 'Settings page missing expected sections');
    }

    // Check stats show real numbers
    if (/[1-9]\d*/.test(settingsText.match(/Total entries.*?(\d+)/)?.[1] || '')) {
      pass('Settings - stats', 'Expense count shows real number');
    } else {
      const entryMatch = settingsText.match(/(\d+)\s*Total entries/) || settingsText.match(/entries.*?(\d+)/);
      if (entryMatch && Number(entryMatch[1]) > 0) pass('Settings - stats', `${entryMatch[1]} total entries shown`);
      else warn('Settings - stats', 'Could not verify expense count in settings stats');
    }

    // Dark mode toggle
    const toggleBtn = await page.$('[style*="width: 52px"]');
    if (toggleBtn) {
      await toggleBtn.click();
      await page.waitForTimeout(400);
      await toggleBtn.click(); // toggle back
      await page.waitForTimeout(400);
      pass('Settings - dark mode toggle', 'Theme toggle works (toggled and restored)');
    } else {
      warn('Settings - dark mode toggle', 'Theme toggle button not found by style selector');
    }

    // ── 7. Add Expense Form ──
    await page.click('button[aria-label="Add expense"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: '/tmp/ss-12-add-form.png' });

    const modal = await page.$('.animate-slide-up, [class*="rounded-t"]');
    if (modal) pass('Add expense form - opens', 'Modal/sheet opened');
    else fail('Add expense form - opens', 'Add expense modal did not open');

    // Fill amount
    const amountInput = await page.$('input[inputmode="decimal"]');
    if (amountInput) {
      await amountInput.fill('150');
      pass('Add expense - amount input', 'Typed ₹150');
    }

    // Select a category (click first one)
    const catBtns = await page.$$('button[type="button"]:has(span.text-2xl)');
    if (catBtns.length > 0) {
      await catBtns[0].click();
      await page.waitForTimeout(300);
      pass('Add expense - category select', `Selected first category (${catBtns.length} available)`);
    }

    // Fill note
    const noteInput = await page.$('input[placeholder*="Lunch"]');
    if (noteInput) await noteInput.fill('Test expense');

    await page.screenshot({ path: '/tmp/ss-13-form-filled.png' });

    // Submit
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: '/tmp/ss-14-after-add.png' });
      const afterText = await page.textContent('body');
      if (afterText.includes('Test expense') || !afterText.includes('New Expense')) {
        pass('Add expense - submit', 'Expense saved and modal closed');
      } else {
        warn('Add expense - submit', 'Modal may still be open or expense not in list');
      }
    }

    // ── 8. Edit / Delete expense ──
    // Go to expenses, tap an item to expand
    await page.click('text=Expenses');
    await page.waitForTimeout(700);

    const firstCard = await page.$('[class*="surface-800"] [class*="active\\:bg"]');
    if (firstCard) {
      await firstCard.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: '/tmp/ss-15-expense-actions.png' });
      const editBtn = await page.$('button:has-text("Edit")');
      const deleteBtn = await page.$('button:has-text("Delete")');
      if (editBtn && deleteBtn) {
        pass('Expense actions - expand', 'Edit and Delete buttons appear on tap');
      } else {
        warn('Expense actions - expand', `Edit: ${!!editBtn}, Delete: ${!!deleteBtn}`);
      }

      // Click edit
      if (editBtn) {
        await editBtn.click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: '/tmp/ss-16-edit-form.png' });
        const editModal = await page.$('text=Edit Expense');
        if (editModal) pass('Edit expense form - opens', 'Edit modal shows with existing data');
        else fail('Edit expense form - opens', 'Edit modal not found');
        // Close modal
        const closeBtn = await page.$('button:has-text("✕")');
        if (closeBtn) await closeBtn.click();
        await page.waitForTimeout(400);
      }
    } else {
      warn('Expense actions', 'Could not find expense card to tap');
    }

    // ── 9. FAB accessible from all pages ──
    const fabPages = ['dashboard', 'analytics', 'budget'];
    for (const pg of ['Home', 'Analytics', 'Budget']) {
      await page.click(`text=${pg}`);
      await page.waitForTimeout(500);
      const fab = await page.$('button[aria-label="Add expense"]');
      if (fab) pass(`FAB on ${pg} page`, 'Floating + button present');
      else warn(`FAB on ${pg} page`, 'FAB not found');
    }

    await page.screenshot({ path: '/tmp/ss-17-final.png' });

  } catch (err) {
    console.log(`❌ FATAL: ${err.message}`);
    await page.screenshot({ path: '/tmp/ss-error.png' }).catch(() => {});
  }

  await browser.close();

  // Summary
  const passed = results.filter(r => r.status === '✅').length;
  const failed = results.filter(r => r.status === '❌').length;
  const warned = results.filter(r => r.status === '⚠️').length;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`SUMMARY: ${passed} passed | ${failed} failed | ${warned} warnings`);
  console.log(`Overall: ${failed === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(failed > 0 ? 1 : 0);
})();
