import { type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents enhanced line data (Gateway + IQ combined)
 */
export interface EnhancedLineData {
  // From Gateway Inventory
  port?: string;
  gateway?: string;
  mdn?: string;
  iccid?: string;
  imei?: string;
  carrier?: string;
  gatewayStatus?: string;
  
  // From PrepaidIQ
  iqStatus?: string;
  ratePlan?: string;
  product?: string;
  balance?: string;
  credit?: string;
  expiry?: string;
  expirationDate?: string;
  pinStatus?: string;
  dealerNotes?: string;
  lastUpdated?: string;
  
  // Combined status
  dataSource?: string; // 'gateway-only', 'iq-only', 'combined'
}

/**
 * Finds the latest Gateway Inventory JSON file
 */
function findLatestInventoryFile(outputPath: string): string | null {
  const reportsFolder = path.join(outputPath, 'Inventory Reports');
  
  if (!fs.existsSync(reportsFolder)) {
    console.warn('Inventory Reports folder not found');
    return null;
  }
  
  const files = fs.readdirSync(reportsFolder)
    .filter(f => f.startsWith('GW_Inventory_') && f.endsWith('.json'))
    .sort()
    .reverse(); // Most recent first
  
  if (files.length === 0) {
    console.warn('No inventory JSON files found');
    return null;
  }
  
  const latestFile = path.join(reportsFolder, files[0]);
  console.log(`Found latest inventory file: ${files[0]}`);
  
  return latestFile;
}

/**
 * Logs into PrepaidIQ with credentials
 */
async function loginToIQ(page: Page): Promise<void> {
  console.log('Logging into PrepaidIQ...');
  
  try {
    await page.goto('https://dealers.prepaidiq.com/login', { timeout: 60000 });
    
    // Wait for login form
    await page.waitForTimeout(2000);
    
    // Fill credentials - try multiple selectors
    const emailField = page.locator('input[name="email"], input[type="email"], #email, #username');
    await emailField.waitFor({ state: 'visible', timeout: 10000 });
    await emailField.fill('gatewayhelper-prepaidiq@printersplus.com');
    
    const passwordField = page.locator('input[name="password"], input[type="password"], #password');
    await passwordField.fill('gateway123');
    
    // Submit login
    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    await submitBtn.click();
    
    // Wait for navigation
    await page.waitForTimeout(5000);
    
    console.log('Login completed.');
  } catch (e) {
    console.error('Login failed:', (e as Error).message);
    throw e;
  }
}

/**
 * Scrapes IQ details for a single MDN
 */
async function scrapeIQForMDN(page: Page, mdn: string): Promise<any> {
  console.log(`Scraping IQ data for MDN: ${mdn}...`);
  
  try {
    // Navigate to line search/details page
    await page.goto(`https://dealers.prepaidiq.com/tools/line-details/${mdn}`, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const iqData: any = {
      mdn: mdn,
      iqStatus: null,
      ratePlan: null,
      balance: null,
      expiry: null,
      dealerNotes: null
    };
    
    // Try to extract data from page
    const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? '';

    // Look for common patterns
    if (bodyText.includes('Active') || bodyText.includes('ACTIVE')) {
      iqData.iqStatus = 'Active';
    } else if (bodyText.includes('Inactive') || bodyText.includes('INACTIVE')) {
      iqData.iqStatus = 'Inactive';
    } else if (bodyText.includes('Suspended') || bodyText.includes('SUSPENDED')) {
      iqData.iqStatus = 'Suspended';
    }
    
    // Try to find specific fields
    const labels = await page.locator('label, .label, .field-label, dt, th').allTextContents().catch(() => []);
    const values = await page.locator('input[readonly], .value, .field-value, dd, td').allTextContents().catch(() => []);
    
    for (let i = 0; i < Math.min(labels.length, values.length); i++) {
      const label = labels[i].toLowerCase().trim();
      const value = values[i].trim();
      
      if (value) {
        if (label.includes('plan') || label.includes('product')) iqData.ratePlan = value;
        if (label.includes('balance') || label.includes('credit')) iqData.balance = value;
        if (label.includes('expir') || label.includes('expire')) iqData.expiry = value;
        if (label.includes('note')) iqData.dealerNotes = value;
      }
    }
    
    console.log(`  → Found IQ data: Status=${iqData.iqStatus}, Plan=${iqData.ratePlan}`);
    return iqData;
    
  } catch (e) {
    console.warn(`Failed to scrape IQ for ${mdn}:`, (e as Error).message);
    return { mdn: mdn, iqStatus: 'Error', error: (e as Error).message };
  }
}

/**
 * Main scraping function - combines Gateway + IQ data
 */
export async function scrapeIQEnhanced(page: Page, outputPath: string): Promise<{ data: EnhancedLineData[], errors: string[] }> {
  const errors: string[] = [];
  const enhancedData: EnhancedLineData[] = [];
  
  // Step 1: Load latest Gateway Inventory
  const inventoryFile = findLatestInventoryFile(outputPath);
  
  if (!inventoryFile) {
    errors.push('No Gateway Inventory file found. Run Inventory scrape first.');
    return { data: [], errors };
  }
  
  let gatewayData: any[] = [];
  
  try {
    const inventoryJson = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
    gatewayData = inventoryJson.data || [];
    console.log(`Loaded ${gatewayData.length} ports from inventory.`);
  } catch (e) {
    errors.push(`Failed to read inventory file: ${(e as Error).message}`);
    return { data: [], errors };
  }
  
  // Step 2: Filter ports with MDN (phone numbers)
  const portsWithMDN = gatewayData.filter(port => {
  return port.mdn && 
         port.mdn !== 'N/A' && 
         port.mdn !== 'MISSING' && 
         port.mdn.length >= 10; // Valid phone numbers are at least 10 digits
    });
  console.log(`Found ${portsWithMDN.length} ports with MDN to check in IQ.`);
  
  if (portsWithMDN.length === 0) {
    errors.push('No ports with MDN found in inventory.');
    return { data: [], errors };
  }
  
  // Step 3: Login to IQ
  try {
    await loginToIQ(page);
  } catch (e) {
    errors.push(`IQ Login failed: ${(e as Error).message}`);
    return { data: [], errors };
  }
  
  // Step 4: Scrape IQ data for each MDN (limit to first 50 to avoid timeout)
  const limit = Math.min(portsWithMDN.length, 50);
  console.log(`Scraping IQ data for ${limit} lines...`);
  
  for (let i = 0; i < limit; i++) {
    const port = portsWithMDN[i];
    
    try {
      const iqData = await scrapeIQForMDN(page, port.mdn);
      
      // Combine Gateway + IQ data
      const enhanced: EnhancedLineData = {
        port: port.port,
        gateway: port.port ? port.port.split('-')[0] : undefined,
        mdn: port.mdn,
        iccid: port.iccid,
        imei: port.imei,
        carrier: port.carrier,
        gatewayStatus: port.status,
        iqStatus: iqData.iqStatus,
        ratePlan: iqData.ratePlan,
        balance: iqData.balance,
        expiry: iqData.expiry,
        dealerNotes: iqData.dealerNotes,
        dataSource: 'combined'
      };
      
      enhancedData.push(enhanced);
      
    } catch (e) {
      console.error(`Error processing ${port.port}:`, (e as Error).message);
      errors.push(`${port.port}: ${(e as Error).message}`);
    }
    
    // Rate limiting
    await page.waitForTimeout(1000);
  }
  
  console.log(`IQ scrape complete. Enhanced ${enhancedData.length} lines.`);
  
  return { data: enhancedData, errors };
}

/**
 * Saves enhanced IQ data to JSON file
 */
export function saveEnhancedIQData(data: EnhancedLineData[], errors: string[], outputPath: string): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const jsonPath = path.join(outputPath, `IQ_Enhanced_${timestamp}.json`);
  
  const payload = {
    sourceUrl: 'https://dealers.prepaidiq.com/tools/line-details/',
    timestamp: new Date().toISOString(),
    data: data,
    errors: errors,
    summary: {
      totalLines: data.length,
      withIQData: data.filter(d => d.iqStatus).length,
      errors: errors.length
    }
  };
  
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  
  console.log(`✅ Enhanced IQ data saved to: ${jsonPath}`);
  
  return jsonPath;
}