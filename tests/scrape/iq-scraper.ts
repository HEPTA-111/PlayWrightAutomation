import { type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents enhanced line data (Gateway + IQ combined)
 */
export interface EnhancedLineData {
  port?: string;
  gateway?: string;
  mdn?: string;
  iccid?: string;
  imei?: string;
  carrier?: string;
  gatewayStatus?: string;
  iqStatus?: string;
  accountNumber?: string;
  simType?: string;
  activationCode?: string;
  dealer?: string;
  pin?: string;
  portIn?: string;
  subscriptionStatus?: string;
  planId?: string;
  startDate?: string;
  endDate?: string;
  purchasedData?: string;
  consumedData?: string;
  dataSource?: string;
}

function findLatestInventoryFile(outputPath: string): string | null {
  const reportsFolder = path.join(outputPath, 'Inventory Reports');
  if (!fs.existsSync(reportsFolder)) return null;
  const files = fs.readdirSync(reportsFolder)
    .filter(f => f.startsWith('GW_Inventory_') && f.endsWith('.json'))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(reportsFolder, files[0]) : null;
}

async function loginAndNavigateToTool(page: Page): Promise<void> {
  console.log('Logging into PrepaidIQ...');
  try {
    // 1. Go to the specific tool URL requested
    await page.goto('https://dealers.prepaidiq.com/tools/line-details/197', { timeout: 60000 });
    
    // 2. Fill Credentials
    await page.locator('input[name="email"]').fill('gatewayhelper-prepaidiq@printersplus.com');
    await page.locator('input[name="password"]').fill('gateway123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    console.log('Login submitted. Waiting for tool to load...');
    
    // 3. Verify we are on the correct page
    await page.waitForTimeout(5000); // Give it a moment to redirect
    
    // Check if the MDN input is visible. If we got redirected to dashboard, click the tool manually.
    if (!(await page.locator('#mdn').isVisible())) {
       console.log('Redirected to dashboard? Navigating to Line Details...');
       await page.goto('https://dealers.prepaidiq.com/tools/line-details/197');
    }

    // Final check
    await page.locator('#mdn').waitFor({ state: 'visible', timeout: 30000 });
    console.log('Ready to scrape: MDN Input is visible.');

  } catch (e) {
    console.error('Login/Navigation failed:', (e as Error).message);
    throw e;
  }
}

/**
 * Robustly grabs the value from the table row corresponding to the header
 * Structure: <tr> <th>Header</th> <td>Value</td> </tr>
 */
async function getTableValue(page: Page, headerText: string): Promise<string> {
  try {
    // XPath: Find a 'th' containing the text, then get the immediately following 'td'
    const locator = page.locator(`//tr[th[contains(normalize-space(.), "${headerText}")]]/td`);
    if (await locator.count() > 0) {
      const text = await locator.first().innerText();
      return text.trim();
    }
    return 'N/A';
  } catch (e) {
    return 'N/A';
  }
}

async function scrapeIQForMDN(page: Page, mdn: string): Promise<any> {
  console.log(`  Scraping IQ data for MDN: ${mdn}...`);
  
  const iqData: any = {
    mdn: mdn,
    iqStatus: 'N/A',
    accountNumber: 'N/A',
    simType: 'N/A',
    activationCode: 'N/A',
    dealer: 'N/A',
    pin: 'N/A',
    portIn: 'N/A',
    subscriptionStatus: 'N/A',
    planId: 'N/A',
    startDate: 'N/A',
    endDate: 'N/A',
    purchasedData: 'N/A',
    consumedData: 'N/A'
  };

  try {
    const mdnInput = page.locator('#mdn');
    await mdnInput.click();
    await mdnInput.fill(''); 
    await mdnInput.fill(mdn);
    await page.getByRole('button', { name: 'Submit' }).click();
    
    // === SYNCHRONIZATION FIX ===
    // We must wait for the table to populate with THIS MDN.
    // The result usually includes the MDN in the first row.
    // We wait for the table container (#apiData) to contain the MDN we just typed.
    // Note: The result might have a +1 prefix (e.g., +1518...), so we match the last 10 digits.
    const rawMdn = mdn.slice(-10); // Last 10 digits
    
    try {
      await page.locator(`//div[@id="apiData"]//td[contains(text(), "${rawMdn}")]`)
                .waitFor({ state: 'visible', timeout: 8000 });
    } catch (e) {
      // If we timed out waiting for the MDN to appear, check if an error message appeared instead
      const bodyText = await page.locator('body').innerText();
      if (bodyText.includes('No result') || bodyText.includes('Error')) {
        console.warn(`  → API returned "No Result" or Error for ${mdn}`);
        iqData.iqStatus = 'Not Found';
        return iqData;
      }
      console.warn(`  → Timeout waiting for data table for ${mdn}`);
      return iqData;
    }

    // === DATA EXTRACTION ===
    // Now we know the table is visible and has our data.
    iqData.iqStatus = await getTableValue(page, 'Status');
    iqData.accountNumber = await getTableValue(page, 'Account Number');
    iqData.simType = await getTableValue(page, 'SIM Type');
    iqData.activationCode = await getTableValue(page, 'Activation Code');
    iqData.dealer = await getTableValue(page, 'Dealer');
    iqData.pin = await getTableValue(page, 'PIN');
    iqData.portIn = await getTableValue(page, 'Port In');
    iqData.subscriptionStatus = await getTableValue(page, 'Subscription Status');
    iqData.planId = await getTableValue(page, 'Plan ID');
    iqData.startDate = await getTableValue(page, 'Start Date');
    iqData.endDate = await getTableValue(page, 'End Date');
    iqData.purchasedData = await getTableValue(page, 'Purchased Data');
    iqData.consumedData = await getTableValue(page, 'Consumed Data');

    console.log(`  → Success: Status=${iqData.iqStatus}, Plan=${iqData.planId}`);
    
    // === SLOW DOWN ===
    // Pause for 2 seconds to make the process observable and reliable
    await page.waitForTimeout(2000);
    
    return iqData;
    
  } catch (e) {
    console.warn(`  → Failed: ${(e as Error).message}`);
    return { ...iqData, iqStatus: 'Error' };
  }
}

export async function scrapeIQEnhanced(page: Page, outputPath: string): Promise<{ data: EnhancedLineData[], errors: string[] }> {
  const errors: string[] = [];
  const enhancedData: EnhancedLineData[] = [];
  
  const inventoryFile = findLatestInventoryFile(outputPath);
  if (!inventoryFile) return { data: [], errors: ['No inventory file found'] };
  
  console.log(`Loading inventory from: ${inventoryFile}`);
  const inventoryJson = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
  const gatewayData = inventoryJson.data || [];
  
  // Filter for valid MDNs
  const portsWithMDN = gatewayData.filter((port: any) => port.mdn && port.mdn.length >= 10 && port.mdn !== 'N/A');
  console.log(`Processing ${portsWithMDN.length} lines with MDNs...`);

  await loginAndNavigateToTool(page);
  
  for (let i = 0; i < portsWithMDN.length; i++) {
    const port = portsWithMDN[i];
    
    // Log progress
    if (i % 5 === 0) console.log(`Processing line ${i + 1} of ${portsWithMDN.length}...`);
    
    const iqResult = await scrapeIQForMDN(page, port.mdn);
    
    enhancedData.push({
      ...port, 
      ...iqResult, 
      gatewayStatus: port.status,
      dataSource: 'combined'
    });
  }
  
  return { data: enhancedData, errors };
}

export function saveEnhancedIQData(data: EnhancedLineData[], errors: string[], outputPath: string): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const jsonPath = path.join(outputPath, `IQ_Enhanced_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ data, errors }, null, 2), 'utf8');
  console.log(`✅ Saved enhanced data: ${jsonPath}`);
  return jsonPath;
}