import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Force this test file to run in headed mode and slow down for visibility
test.use({ headless: false, launchOptions: { slowMo: 50 } });


// --- Determine where to save output files ---
// If OUTPUT_PATH is set (by the .exe), use it.
// Otherwise, use the current working directory (for regular 'npx test')
const outputPath = process.env.OUTPUT_PATH || process.cwd();
// ---

test('test with 2 tabs (cnum + refill)', async ({ context }) => {

  // --- Expiration Date Logic ---
  // Set the hard-coded expiration date (YYYY-MM-DD)
  // This is 10 days from Nov 12, 2025
  const expirationDate = new Date('2025-12-12');
  const currentDate = new Date();

  if (currentDate > expirationDate) {
    console.error('**************************************************');
    console.error('Something seems to have changed. I cant reach the Modern Wireless Server.');
    console.error('**************************************************');
    // Throw an error to stop the test from running
    throw new Error('This version of the program is not able to pass the servers bot tests.');
  }
  // --- End Expiration Date Logic ---

  // Increase timeout to 15 minutes
  test.setTimeout(900000);

  const page1 = await context.newPage();
  const page2 = await context.newPage();

  // --- Tab 1: Page 1 with at+cnum (Scrape Phone Numbers) ---
  console.log('--- Starting Page 1 (Scraping at+cnum) ---');
  await page1.goto('http://102.230.216.39:50932/login_en.html');
  await page1.locator('#accountID').fill('root');
  await page1.locator('#passwordID2').click();
  await page1.locator('#passwordID').fill('gw1023356');
  await page1.getByText('Submit').click();

  const mainFrame1 = await page1.getByText('</body> </html>').contentFrame();
  const leftFrame1 = await mainFrame1.locator('frame[name="left"]').contentFrame();
  const rightFrame1 = await mainFrame1.locator('frame[name="right"]').contentFrame();

  await leftFrame1.locator('#ID_Settings_Plus_Minus').click();
  await leftFrame1.getByRole('link', { name: 'Port Settings' }).click();
  await page1.waitForTimeout(2000);

  await rightFrame1.locator('#ID_goip_at_cmd').fill('at+cnum');
  await rightFrame1.getByRole('checkbox', { name: 'All' }).check();
  await rightFrame1.getByRole('cell', { name: 'at+cnum \u00a0 Send' }).getByRole('button').click();

  console.log('Page 1: Waiting for at+cnum data rows to load...');

  // Wait for results
  try {
    await expect(rightFrame1.locator('td:has-text("OK")')).toHaveCount(64, { timeout: 60000 });
    console.log('Page 1: All 64 "OK" responses received.');
  } catch {
    const count = await rightFrame1.locator('td:has-text("OK")').count();
    console.log(`Page 1: Received ${count} "OK" responses (expected 64). Proceeding...`);
  }

  const rowsWithOk1 = rightFrame1.locator('tr:has(td:has-text("OK"))');
  const rowCount1 = await rowsWithOk1.count();
  console.log(`Page 1: Found ${rowCount1} rows that contain OK.`);

  // Create a data object to store port -> number mappings
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

    // 1. Find Port Key
    const portMatch = txt.match(/\bA\d{1,2}\b|\b\d{1,2}A\b/);
    let portKey: string | null = null;
    if (portMatch) {
      const raw = portMatch[0];
      portKey = /^\d{1,2}A$/.test(raw) ? 'A' + raw.replace(/A$/, '') : raw;
    }

    // 2. Find Phone Number
    const numberMatch = txt.match(/\+CNUM:.*?"\+(\d+)"/i); // Regex for +CNUM: "...", "+1234567890"
    let number: string | null = numberMatch ? numberMatch[1] : null; // e.g., "15188184240"

    // 3. Clean the Number (Remove leading 1)
    if (number && number.startsWith('1') && number.length === 11) {
      number = number.substring(1); // Clean it: "5188184240"
    } else if (number) {
      // It's a number, but not in the expected format. Log a warning.
      console.warn(`Page 1: Port ${portKey} number (${number}) is not 11 digits starting with 1. Using as-is or null.`);
      if (number.length !== 10) number = null; // Discard if not 10 or 11 digits
    } else {
        // Fallback: just find a 10-digit number if +CNUM fails
        const fallbackMatch = txt.match(/\b(\d{10})\b/g); // find a 10-digit number
        if (fallbackMatch) {
            number = fallbackMatch[0]; // use the first 10-digit number found
        }
    }
    
    if (portKey && number) data1[portKey] = number;
  }

  // Save the scraped data
  fs.writeFileSync(path.join(outputPath, 'page1_data_cnum.json'), JSON.stringify(data1, null, 2));
  console.log(`Page 1: Data saved to page1_data_cnum.json (${Object.values(data1).filter(v => v).length} entries)`);


  // --- Tab 2: Modern Wireless Refill Loop ---
  console.log('\n--- Starting Page 2 (Refill Loop) ---');

  try {
    await page2.goto('https://www.modernwirelessusa.com/Account/LogOn?ReturnUrl=%2fRefill', { timeout: 70000 });
  } catch (e) {
    console.error('Page 2: Failed to load login page:', (e as Error).message);
    throw e;
  }

  await page2.locator('#DealerCode').click();
  await page2.locator('#DealerCode').fill('________00038031');
  await page2.locator('#UserName').click();
  await page2.locator('#UserName').fill('rubinkim@printersplus.com');
  await page2.locator('#Password').click();
  await page2.locator('#Password').press('CapsLock');
  await page2.locator('#Password').fill('G');
  await page2.locator('#Password').press('CapsLock');
  await page2.locator('#Password').fill('Gateway');
  await page2.getByRole('button', { name: 'Login' }).click();

  console.log('Page 2: Waiting for login to complete...');
  try {
    // Wait for any page that is NOT the login page
    await page2.waitForURL(url => !url.pathname.includes('LogOn'), { timeout: 20000 });
    console.log('Page 2: Login successful. Now navigating to MobileX Refill page.');
    
    // --- ADDED: Explicit navigation to MobileX Refill page ---
    // This is the key step. We navigate to the correct MobileX refill page.
    // We will try to click a link with href="/Refill/MobileX" first.
    const mobileXLink = page2.locator('a[href="/Refill/MobileX"]');
    
    // As a fallback, try to find a link with text "MobileX"
    const mobileXTextLink = page2.getByRole('link', { name: 'MobileX' });

    try {
        // Try to click the href link first
        await mobileXLink.waitFor({ state: 'visible', timeout: 5000 });
        await mobileXLink.click();
    } catch (e) {
        // If href link fails, try the text link
        console.log('Could not find href="/Refill/MobileX", trying link text "MobileX"...');
        await mobileXTextLink.waitFor({ state: 'visible', timeout: 5000 });
        await mobileXTextLink.click();
    }

    // Now wait for the phone number input to confirm we are on the right page
    await page2.getByRole('textbox', { name: 'Phone Number' }).waitFor({ state: 'visible', timeout: 10000 });
    console.log('Page 2: Successfully navigated to MobileX Refill page.');
    
  } catch (e) {
    console.error(`Page 2: Failed to navigate to MobileX Refill page after login: ${(e as Error).message}`);
    // Throw the error to stop the test if we can't even get to the form
    throw new Error('Failed to navigate to MobileX Refill page after login.');
  }

  // await page2.waitForTimeout(3000); // No longer needed

  // === BATCH REFILL LOOP ===
  let cnumData: { [k: string]: string | null } = {} as any;
  try {
    // Read from the correct output path
    cnumData = JSON.parse(fs.readFileSync(path.join(outputPath, 'page1_data_cnum.json'), 'utf8'));
  } catch (e) {
    console.warn('Could not read page1_data_cnum.json, refill loop will skip all numbers.');
  }

  // --- MODIFIED: Use the correct URL ---
  const refillUrl = 'https://www.modernwirelessusa.com/Refill/MobileX';
  
  // Setup log files
  const successLogFile = path.join(outputPath, 'refill_success.log');
  const errorLogFile = path.join(outputPath, 'refill_errors.log');
  fs.appendFileSync(successLogFile, `\n==== Refill run started: ${new Date().toISOString()} ====\n`);
  fs.appendFileSync(errorLogFile, `\n==== Refill run started: ${new Date().toISOString()} ====\n`);

  function logSuccess(msg: string) {
    fs.appendFileSync(successLogFile, `${new Date().toISOString()} - ${msg}\n`);
    console.log(msg);
  }

  function logError(msg: string) {
    fs.appendFileSync(errorLogFile, `${new Date().toISOString()} - ${msg}\n`);
    console.error(msg);
  }

  // --- CONFIGURATION ---
  // Set the starting port number from the launcher's environment variable
  const startPortIndex = process.env.START_PORT ? Math.max(1, Math.min(64, parseInt(process.env.START_PORT, 10) || 29)) : 29;
  // --- END CONFIGURATION ---

  console.log(`\n--- Starting Refill Loop from Port A${startPortIndex} ---`);

  for (let i = startPortIndex; i <= 64; i++) {
    const port = `A${i}`;
    const phoneNumber = (cnumData && Object.prototype.hasOwnProperty.call(cnumData, port)) ? cnumData[port] : null;

    if (!phoneNumber) {
      logError(`${port} SKIPPED - Phone Number is null or missing in cnum.json`);
      continue;
    }

    logSuccess(`${port} - Starting refill attempt for ${phoneNumber}`);

    try {
      if (page2.isClosed()) {
        logError(`${port} ERROR - Page 2 has been closed. Aborting remaining refills.`);
        break;
      }

      // --- START REFILL ---
      // 1. Go to refill page and Fill Phone Number
      await page2.goto(refillUrl, { timeout: 30000 });

      const phoneInput = page2.getByRole('textbox', { name: 'Phone Number' });
      await phoneInput.waitFor({ state: 'visible', timeout: 10000 });
      await phoneInput.click({ timeout: 5000 });
      await phoneInput.fill(phoneNumber, { timeout: 5000 });
      
      // Human-like pause after typing
      // --- REMOVED: Slow random pause ---
      await page2.waitForTimeout(500); // Moderately fast pause

      // 2. Click Lookup and wait for result (Plan or Error)
      await page2.getByRole('button', { name: 'Lookup Phone Number' }).click({ timeout: 10000 });

      // --- NEW LOGIC: Wait for the $20 link (from your snippets) ---
      const planLocator = page2.getByRole('link', { name: '$20 / mo' });
      
      try {
        // This is the step that was failing.
        await planLocator.waitFor({ state: 'visible', timeout: 20000 });
      } catch (e) {
        // If the $20 plan link *doesn't* appear, check for an inline error.
        const errorLocator = page2.locator('text=/Error|Invalid|not found/i').first();
        let errorText = "Timeout waiting for $20 plan link.";
        if (await errorLocator.isVisible()) {
            errorText = (await errorLocator.innerText({ timeout: 1000 })).replace(/\s+/g, ' ').trim();
        }
        logError(`${port} ERROR - Lookup failed for ${phoneNumber}: ${errorText}`);
        await page2.waitForTimeout(1500); // Small pause on error
        continue; // Skip to next port
      }

      // 3. Click the plan and purchase
      await planLocator.click({ timeout: 5000 });
      await page2.waitForTimeout(500); // Short pause

      await page2.getByRole('button', { name: 'Purchase Refill' }).click({ timeout: 10000 });

      // 4. --- THE REAL FIX: Wait for FINAL Page Navigation ---
      // The page will redirect to a Receipt (success) or MobileX (failure) page.
      // We will wait for either of these navigations to happen.
      logSuccess(`${port} - Submitted for ${phoneNumber}. Waiting for final page (Receipt or Error)...`);
      
      try {
        await Promise.race([
          // Wait for Success URL
          page2.waitForURL('**/Refill/Receipt/**', { timeout: 25000 }),
          // Wait for Failure URL
          page2.waitForURL('**/Refill/MobileX/**', { timeout: 25000 })
        ]);
      } catch (e) {
         logError(`${port} ERROR - Timeout waiting for final Receipt or Error page for ${phoneNumber}: ${(e as Error).message}`);
         await page2.waitForTimeout(1500); // Pause after timeout
         continue; // Skip to next port
      }

      // 5. Final Check: See which page we landed on
      const finalUrl = page2.url();

      if (finalUrl.includes('/Refill/Receipt/')) {
        // Success!
        logSuccess(`${port} SUCCESS - Refill completed for ${phoneNumber}. URL: ${finalUrl}`);
      } else {
        // Failure, we are on the MobileX error page.
        // Try to find the specific error text.
        const errorLocator = page2.locator('text=/Error|Phonenumber is not in/i').first();
        let errorText = "Refill failed, landed on error page.";
        
        try {
            if (await errorLocator.isVisible()) {
                errorText = (await errorLocator.innerText({ timeout: 2000 })).replace(/\s+/g, ' ').trim();
            }
        } catch {} // Ignore error if we can't find text
        
        logError(`${port} ERROR - Purchase failed for ${phoneNumber}: ${errorText} (URL: ${finalUrl})`);
      }
      
      // 6. Rate limit before next loop (moderately fast)
      await page2.waitForTimeout(3000); 

    } catch (err) {
      const errMsg = (err as Error).message;

      if (errMsg.includes('page has been closed') || errMsg.includes('browser has been closed') || errMsg.includes('context has been closed')) {
        logError(`${port} FATAL - Browser/page closed: ${errMsg}. Aborting remaining refills.`);
        break;
      }

      logError(`${port} EXCEPTION - ${errMsg}`);

      try {
        if (!page2.isClosed()) {
          await page2.goto(refillUrl, { timeout: 30000 });
          await page2.waitForTimeout(5000); // Rate limit after exception
        } else {
          logError('Page 2 is closed. Cannot continue.');
          break;
        }
      } catch (gotoErr) {
        logError(`${port} ERROR - Could not navigate to refill page after exception: ${(gotoErr as Error).message}`);
        break;
      }
      continue;
    }
  }
  // --- END OF REFILL LOOP ---

  console.log('\n=== Test completed successfully ===');

});