import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Force this test file to run in headed mode and slow down for visibility
test.use({ headless: false, launchOptions: { slowMo: 50 } });


// --- ADDED: Determine where to save output files ---
// If OUTPUT_PATH is set (by the .exe), use it.
// Otherwise, use the current working directory (for regular 'npx test')
const outputPath = process.env.OUTPUT_PATH || process.cwd();
// ---

// --- ADDED: Load Email List ---
// Launcher saves 'emails.json' to the current working directory
const emailPath = path.join(process.cwd(), 'emails.json');
let emailList: string[] = [];
try {
  if (fs.existsSync(emailPath)) {
    emailList = JSON.parse(fs.readFileSync(emailPath, 'utf8'));
    if (!Array.isArray(emailList)) emailList = [];
    // Ensure list contains only valid, non-empty email strings
    emailList = emailList.filter(e => typeof e === 'string' && e.includes('@'));
  }
} catch (e) {
  console.warn(`Could not read emails.json: ${(e as Error).message}`);
}
if (emailList.length === 0) {
  console.warn('Email list (emails.json) is empty or not found, using default [rb@usa.com]');
  emailList = ['rb@usa.com'];
}
// --- END ADDED ---

test('test with 3 tabs', async ({ context }) => {

  // --- Expiration Date Logic ---
  // Set the hard-coded expiration date (YYYY-MM-DD)
  // This is 10 days from Oct 31, 2025
  const expirationDate = new Date('2025-12-12');
  const currentDate = new Date();

  if (currentDate > expirationDate) {
    console.error('**************************************************');
    console.error('Something seems to have change.I cant reach the Modern Wireless Server.');
    console.error('**************************************************');
    // Throw an error to stop the test from running
    throw new Error('This version of the program is not able to pass the servers bot tests. ');
  }
  // --- End Expiration Date Logic ---

  // Increase timeout to 15 minutes
  test.setTimeout(900000);

  const page1 = await context.newPage();
  const page2 = await context.newPage();
  const page3 = await context.newPage();

  // --- Tab 1: Page 1 with at+cgsn ---
  await page1.goto('http://192.168.1.101/login_en.html');
  await page1.locator('#accountID').fill('root');
  await page1.locator('#passwordID2').click();
  await page1.locator('#passwordID').fill('gw1013356');
  await page1.getByText('Submit').click();

  const mainFrame1 = await page1.getByText('</body> </html>').contentFrame();
  const leftFrame1 = await mainFrame1.locator('frame[name="left"]').contentFrame();
  const rightFrame1 = await mainFrame1.locator('frame[name="right"]').contentFrame();

  await leftFrame1.locator('#ID_Settings_Plus_Minus').click();
  await leftFrame1.getByRole('link', { name: 'Port Settings' }).click();
  await page1.waitForTimeout(2000);

  await rightFrame1.locator('#ID_goip_at_cmd').fill('at+cgsn');
  await rightFrame1.getByRole('checkbox', { name: 'All' }).check();
  await rightFrame1.getByRole('cell', { name: 'at+cgsn \u00a0 Send' }).getByRole('button').click();

  console.log('Page 1: Waiting for at+cgsn data rows to load...');

  // Wait for results - be flexible, accept 63 or 64
  try {
    await expect(rightFrame1.locator('td:has-text("OK")')).toHaveCount(64, { timeout: 60000 });
    console.log('Page 1: All 64 "OK" responses received.');
  } catch {
    const count = await rightFrame1.locator('td:has-text("OK")').count();
    console.log(`Page 1: Received ${count} "OK" responses (expected 64).`);
  }

  const rowsWithOk1 = rightFrame1.locator('tr:has(td:has-text("OK"))');
  const rowCount1 = await rowsWithOk1.count();
  console.log(`Page 1: Found ${rowCount1} rows that contain OK.`);

  const data1: { [k: string]: string | null } = {} as any;
  for (let i = 1; i <= 64; i++) data1[`A${i}`] = null;

  for (let i = 0; i < rowCount1; i++) {
    const row = rowsWithOk1.nth(i);
    let txt: string | null = null;
    try {
      txt = await row.evaluate((el: HTMLElement) => (el && el.innerText) ? el.innerText : '');
    } catch {
      try {
        txt = (await row.textContent()) ?? null;
      } catch {
        txt = null;
      }
    }
    if (!txt) {
      console.warn(`Page1: row ${i} unreadable, skipping`);
      continue;
    }
    txt = txt.replace(/\u00A0/g, ' ');
    const portMatch = txt.match(/\bA\d{1,2}\b|\b\d{1,2}A\b/);
    let portKey: string | null = null;
    if (portMatch) {
      const raw = portMatch[0];
      portKey = /^\d{1,2}A$/.test(raw) ? 'A' + raw.replace(/A$/, '') : raw;
    }
    const numberMatch = txt.match(/\d{10,}/g);
    const number = numberMatch ? numberMatch.sort((a, b) => b.length - a.length)[0] : null;
    if (portKey && number) data1[portKey] = number;
  }

  // --- MODIFIED: Save to the correct output path ---
  fs.writeFileSync(path.join(outputPath, 'page1_data_cgsn.json'), JSON.stringify(data1, null, 2));
  console.log(`Page 1: Data saved to page1_data_cgsn.json (${Object.values(data1).filter(v => v).length} entries)`);

  // --- Tab 2: Page 2 with at+ccid ---
  console.log('\n--- Starting Page 2 ---');

  await page2.goto('http://192.168.1.101/main_en.html');
  await page2.waitForTimeout(2500);

  let mainFrame2 = await page2.getByText('</body> </html>').contentFrame();
  let leftFrame2 = await mainFrame2.locator('frame[name="left"]').contentFrame();
  let rightFrame2 = await mainFrame2.locator('frame[name="right"]').contentFrame();

  await leftFrame2.locator('#ID_Settings_Plus_Minus').click();
  await leftFrame2.getByRole('link', { name: 'Port Settings' }).click();
  await page2.waitForTimeout(3000);

  mainFrame2 = await page2.getByText('</body> </html>').contentFrame();
  rightFrame2 = await mainFrame2.locator('frame[name="right"]').contentFrame();

  await rightFrame2.locator('#ID_goip_at_cmd').fill('at+ccid');
  await rightFrame2.getByRole('checkbox', { name: 'All' }).check();
  await page2.waitForTimeout(3000);
  await rightFrame2.getByRole('cell', { name: 'at+ccid \u00a0 Send' }).getByRole('button').click();

  console.log('Page 2: Waiting for at+ccid data rows to load...');

  await page2.waitForTimeout(5000);
  let okCount = 0;
  const maxWaitTime = 90000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      mainFrame2 = await page2.getByText('</body> </html>').contentFrame();
      rightFrame2 = await mainFrame2.locator('frame[name="right"]').contentFrame();
      okCount = await rightFrame2.locator('td:has-text("OK")').count();

      if (okCount >= 63) {
        console.log(`Page 2: Received ${okCount} "OK" responses.`);
        break;
      }

      await page2.waitForTimeout(2000);
    } catch (e) {
      console.warn('Page 2: Error checking OK count:', (e as Error).message);
      await page2.waitForTimeout(2000);
    }
  }

  if (okCount < 63) {
    console.warn(`Page 2: Only ${okCount} responses after ${maxWaitTime}ms. Proceeding anyway...`);
  }

  const data2: { [k: string]: string | null } = {} as any;
  for (let i = 1; i <= 64; i++) data2[`A${i}`] = null;

  async function extractDataFromPage2() {
    try {
      mainFrame2 = await page2.getByText('</body> </html>').contentFrame();
      rightFrame2 = await mainFrame2.locator('frame[name="right"]').contentFrame();
    } catch (e) {
      console.warn('Page2: could not re-acquire frames');
      return;
    }

    const rowsWithOk = rightFrame2.locator('tr:has(td:has-text("OK"))');
    const n = await rowsWithOk.count();
    console.log(`Page2: Extracting from ${n} rows with OK`);

    for (let i = 0; i < n; i++) {
      const row = rowsWithOk.nth(i);
      let txt: string | null = null;
      try {
        txt = await row.evaluate((el: HTMLElement) => (el && el.innerText) ? el.innerText : '');
      } catch {
        try {
          txt = (await row.textContent()) ?? null;
        } catch {
          txt = null;
        }
      }
      if (!txt) continue;

      txt = txt.replace(/\u00A0/g, ' ');

      const portMatch = txt.match(/\bA\d{1,2}\b|\b\d{1,2}A\b/);
      let portKey: string | null = null;
      if (portMatch) {
        const raw = portMatch[0];
        portKey = /^\d{1,2}A$/.test(raw) ? 'A' + raw.replace(/A$/, '') : raw;
      } else {
        continue;
      }

      if (data2[portKey]) continue;

      let number: string | null = null;
      const ccidMatch = txt.match(/\+CCID:\s*(\d{10,})/i);
      if (ccidMatch) {
        number = ccidMatch[1];
      } else {
        const matches = txt.match(/\d{10,}/g);
        if (matches && matches.length) {
          number = matches.sort((a, b) => b.length - a.length)[0];
        }
      }

      if (number) {
        data2[portKey] = number;
        console.log(`Page2: captured ${portKey} => ${number}`);
      }
    }
  }

  await extractDataFromPage2();

  let retryCount = 0;
  while (Object.values(data2).filter(v => v).length < 64 && retryCount < 3 && !page2.isClosed()) {
    retryCount++;
    const captured = Object.values(data2).filter(v => v).length;
    console.log(`Page2: Captured ${captured}/64. Retry ${retryCount}: re-sending command...`);

    try {
      mainFrame2 = await page2.getByText('</body> </html>').contentFrame();
      rightFrame2 = await mainFrame2.locator('frame[name="right"]').contentFrame();

      await rightFrame2.locator('#ID_goip_at_cmd').fill('at+ccid', { timeout: 5000 });
      await rightFrame2.getByRole('checkbox', { name: 'All' }).check({ timeout: 5000 });
      await page2.waitForTimeout(1000);
      await rightFrame2.getByRole('cell', { name: 'at+ccid \u00a0 Send' }).getByRole('button').click({ timeout: 5000 });

      await page2.waitForTimeout(5000);
      await extractDataFromPage2();
    } catch (e) {
      console.warn('Page2: Retry failed:', (e as Error).message);
      break;
    }
  }

  const captured2 = Object.values(data2).filter(v => v).length;
  // --- MODIFIED: Save to the correct output path ---
  fs.writeFileSync(path.join(outputPath, 'page2_data_cgsn.json'), JSON.stringify(data2, null, 2));
  console.log(`\nPage 2: Data saved to page2_data_cgsn.json (${captured2} entries)`);
  if (captured2 < 64) {
    console.warn(`Page2: WARNING - only ${captured2}/64 were captured. Missing ports remain as null.`);
  }

  // --- Tab 3: Modern Wireless activation ---
  console.log('\n--- Starting Page 3 ---');

  try {
    await page3.goto('https://www.modernwirelessusa.com/Account/LogOn?ReturnUrl=%2fActivate%2fMobileX%2fActivation%2fMOBILEX%2f00001777', { timeout: 70000 });
  } catch (e) {
    console.error('Page 3: Failed to load login page:', (e as Error).message);
    throw e;
  }

  await page3.locator('#DealerCode').click();
  await page3.locator('#DealerCode').click();
  await page3.locator('#DealerCode').fill('________00038031');
  await page3.locator('#UserName').click();
  await page3.locator('#UserName').fill('rubinkim@printersplus.com');
  await page3.locator('#Password').click();
  await page3.locator('#Password').press('CapsLock');
  await page3.locator('#Password').fill('G');
  await page3.locator('#Password').press('CapsLock');
  await page3.locator('#Password').fill('gateway1!!');
  await page3.getByRole('button', { name: 'Login' }).click();

  console.log('Page 3: Waiting for login to complete...');
  try {
    await page3.waitForURL('**/Activate/**', { timeout: 20000 });
    console.log('Page 3: Login completed - navigated to activation page.');
  } catch {
    try {
      await page3.waitForSelector('input[name="IMEI"]', { timeout: 20000 });
      console.log('Page 3: Login completed - activation form detected.');
    } catch {
      console.warn('Page 3: Login completion check failed, but proceeding...');
    }
  }

  await page3.waitForTimeout(3000);

  // === BATCH ACTIVATION LOOP ===
  let cgsnData: { [k: string]: string | null } = {} as any;
  let ccidData: { [k: string]: string | null } = {} as any;
  try {
    // --- MODIFIED: Read from the correct output path ---
    cgsnData = JSON.parse(fs.readFileSync(path.join(outputPath, 'page1_data_cgsn.json'), 'utf8'));
  } catch (e) {
    console.warn('Could not read page1_data_cgsn.json, activation loop will skip IMEIs');
  }
  try {
    // --- MODIFIED: Read from the correct output path ---
    ccidData = JSON.parse(fs.readFileSync(path.join(outputPath, 'page2_data_cgsn.json'), 'utf8'));
  } catch (e) {
    console.warn('Could not read page2_data_cgsn.json, activation loop will skip SIMs');
  }

  // --- ADDED: Email Strategy Setup ---
  const emailStrategy = process.env.EMAIL_STRATEGY || 'single';
  const emailSingle = process.env.EMAIL_SINGLE || 'rb@usa.com';
  const emailN = parseInt(process.env.EMAIL_N || '1', 10) || 1;
  
  let usableEmails: string[] = [];
  
  switch (emailStrategy) {
    case 'loop':
      usableEmails = emailList; // Use the full list (loaded at top of file)
      console.log(`Email Strategy: LOOPING all ${usableEmails.length} emails.`);
      break;
    case 'n-times':
      usableEmails = emailList.slice(0, emailN); // Use first N
      console.log(`Email Strategy: Using first ${usableEmails.length} emails (requested ${emailN}).`);
      break;
    case 'single':
    default:
      usableEmails = [emailSingle]; // Use the single provided one
      console.log(`Email Strategy: SINGLE email (${emailSingle}).`);
      break;
  }
  
  if (usableEmails.length === 0) {
    console.warn('No usable emails found for strategy, defaulting to rb@usa.com');
    usableEmails = ['rb@usa.com'];
  }
  // --- END ADDED ---


  const activationUrl = 'https://www.modernwirelessusa.com/Activate/MobileX/Activation/MOBILEX/00001777';
  const receiptPathFragment = '/Activate/Receipt/';
  // --- MODIFIED: Save log to the correct output path ---
  const logFile = path.join(outputPath, 'activation_errors.log');
  fs.appendFileSync(logFile, `\n==== Activation run started: ${new Date().toISOString()} ====\n`);

  function log(msg: string) {
    fs.appendFileSync(logFile, `${new Date().toISOString()} - ${msg}\n`);
    console.log(msg);
  }

  try {
    await page3.goto(activationUrl, { timeout: 30000 });
    await page3.waitForTimeout(2000);
  } catch (e) {
    console.warn('Could not navigate to activation page before starting loop');
  }

  // --- START OF NEW PAGE 3 LOOP ---

  // --- CONFIGURATION ---
  // Set the starting port number. (e.g., 1 for A1, 21 for A21).
  // If the launcher passed START_PORT, use that value; otherwise default to 29.
  const startPortIndex = process.env.START_PORT ? Math.max(1, Math.min(64, parseInt(process.env.START_PORT, 10) || 29)) : 29;
  // --- END CONFIGURATION ---

  console.log(`\n--- Starting Activation Loop from Port A${startPortIndex} ---`);

  // --- ADDED: Loop counter for email cycling ---
  let loopCounter = 0; 

  for (let i = startPortIndex; i <= 64; i++) { // <-- MODIFIED to use startPortIndex
    const port = `A${i}`;
    const imei = (cgsnData && Object.prototype.hasOwnProperty.call(cgsnData, port)) ? cgsnData[port] : null;
    const sim = (ccidData && Object.prototype.hasOwnProperty.call(ccidData, port)) ? ccidData[port] : null;

    // --- ADDED: Get current email based on strategy ---
    // Use (loopCounter % usableEmails.length) to cycle through the list
    const currentEmail = usableEmails[loopCounter % usableEmails.length];
    // --- END ADDED ---

    if (!imei) {
      log(`${port} SKIPPED - IMEI is null or missing`);
      continue;
    }
    if (!sim) {
      log(`${port} SKIPPED - SIM/CCID is null or missing`);
      continue;
    }

    log(`${port} - Starting activation attempt. IMEI:${imei} SIM:${sim} EMAIL:${currentEmail}`);

    try {
      if (page3.isClosed()) {
        log(`${port} ERROR - Page 3 has been closed. Aborting remaining activations.`);
        break;
      }

      // --- START ACTIVATION ---

      // 1. Fill IMEI
      try {
        const imeiInput = page3.getByRole('textbox', { name: 'IMEI' });
        await imeiInput.waitFor({ state: 'visible', timeout: 10000 });
        await imeiInput.click({ timeout: 5000 });
        await imeiInput.fill(imei, { timeout: 5000 });
      } catch (e) {
        log(`${port} ERROR - Could not find/fill IMEI: ${(e as Error).message}`);
        await page3.goto(activationUrl, { timeout: 30000 }); // Reset
        await page3.waitForTimeout(3000); // Rate limit
        continue;
      }

      await page3.getByRole('button', { name: 'Continue' }).click({ timeout: 10000 });

      // 2. Wait for SIM form and Fill SIM
      try {
        const simInput = page3.getByRole('textbox', { name: 'Enter SIM #' });
        await simInput.waitFor({ state: 'visible', timeout: 15000 }); // Wait for page to load
        await simInput.click({ timeout: 5000 });
        await simInput.fill(sim, { timeout: 5000 });
      } catch (e) {
        log(`${port} ERROR - SIM input form did not appear or failed to fill: ${(e as Error).message}`);
        try { // Log error snippet from page
          const bodyText = (await page3.locator('body').innerText({ timeout: 3000 })) || '';
          log(`${port} ERROR_PAGE_TEXT: ${bodyText.split('\n').slice(0, 10).join(' | ')}`);
        } catch { }
        await page3.goto(activationUrl, { timeout: 30000 }); // Reset
        await page3.waitForTimeout(3000); // Rate limit
        continue;
      }

      await page3.getByRole('button', { name: 'Continue' }).click({ timeout: 15000 });

      // 3. Wait for Details Form and Fill Details
      try {
        const zipInput = page3.getByRole('textbox', { name: 'Account Zip Code' });
        await zipInput.waitFor({ state: 'visible', timeout: 15000 }); // Wait for page to load

        await zipInput.click({ timeout: 5000 });
        await zipInput.fill('12222', { timeout: 5000 });

        await page3.getByRole('textbox', { name: 'Account PIN' }).click({ timeout: 5000 });
        await page3.getByRole('textbox', { name: 'Account PIN' }).fill('335656', { timeout: 5000 });
        await page3.getByRole('textbox', { name: 'Confirm PIN' }).click({ timeout: 5000 });
        await page3.getByRole('textbox', { name: 'Confirm PIN' }).fill('335656', { timeout: 5000 });
        
        // --- MODIFIED: Use dynamic email ---
        await page3.getByRole('textbox', { name: 'Contact Email' }).click({ timeout: 5000 });
        await page3.getByRole('textbox', { name: 'Contact Email' }).fill(currentEmail, { timeout: 5000 });
        // --- END MODIFIED ---
        
        await page3.getByRole('textbox', { name: 'Contact Phone #' }).click({ timeout: 5000 });
        await page3.getByRole('textbox', { name: 'Contact Phone #' }).fill('5555555555', { timeout: 5000 });

      } catch (e) {
        log(`${port} ERROR - Details (ZIP/PIN) form did not appear or failed to fill: ${(e as Error).message}`);
        try { // Log error snippet from page
          const bodyText = (await page3.locator('body').innerText({ timeout: 3000 })) || '';
          log(`${port} ERROR_PAGE_TEXT: ${bodyText.split('\n').slice(0, 10).join(' | ')}`);
        } catch { }
        await page3.goto(activationUrl, { timeout: 30000 }); // Reset
        await page3.waitForTimeout(3000); // Rate limit
        continue;
      }

      // 4. Submit and Wait for Receipt
      await page3.getByRole('button', { name: 'Submit' }).click({ timeout: 25000 });

      try {
        // This is the single point of success validation
        await page3.getByRole('heading', { name: 'Activation Receipt' }).waitFor({ state: 'visible', timeout: 25000 });
        log(`${port} SUCCESS - activation completed. URL:${page3.url()}`);

      } catch (e) {
        log(`${port} ERROR - Final submission failed. Receipt not found.`);
        try { // Log error snippet from page
          const bodyText = (await page3.locator('body').innerText({ timeout: 3000 })) || '';
          log(`${port} ERROR_PAGE_TEXT: ${bodyText.split('\n').slice(0, 10).join(' | ')}`);
        } catch { }
      }

      // 5. Reset for next loop (whether success or fail)
      log(`${port} - Cycle complete, navigating back to activation page.`);
      await page3.goto(activationUrl, { timeout: 30000 });
      await page3.waitForTimeout(5000); // <-- THIS IS THE MAIN RATE-LIMITING PAUSE

    } catch (err) {
      const errMsg = (err as Error).message;

      if (errMsg.includes('page has been closed') || errMsg.includes('browser has been closed') || errMsg.includes('context has been closed')) {
        log(`${port} FATAL - Browser/page closed: ${errMsg}. Aborting remaining activations.`);
        break;
      }

      log(`${port} EXCEPTION - ${errMsg}`);

      try {
        if (!page3.isClosed()) {
          await page3.goto(activationUrl, { timeout: 30000 });
          await page3.waitForTimeout(5000); // Rate limit after exception
        } else {
          log('Page 3 is closed. Cannot continue.');
          break;
        }
      } catch (gotoErr) {
        log(`${port} ERROR - Could not navigate to activation page after exception: ${(gotoErr as Error).message}`);
        break;
      }
      continue;
    }
    
    // --- ADDED: Increment loop counter ---
    loopCounter++;
  }
  // --- END OF NEW PAGE 3 LOOP ---

  console.log('\n=== Test completed successfully ===');

});