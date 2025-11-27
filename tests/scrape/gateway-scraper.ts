import { type Page, type FrameLocator } from '@playwright/test';
import * as GatewayConfig from '../reload_ports/gateway-config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents scraped data for a single port
 */
export interface PortData {
  port: string;
  mdn: string | null;
  iccid: string | null;
  imei: string | null;
  carrier: string; // New field for Carrier
  status: 'active' | 'inactive' | 'weak-signal' | 'error';
  missingData: string[]; // To track exactly what is missing
}

/**
 * Detects carrier based on ICCID (SIM Number)
 * Based on IIN (Issuer Identifier Number) and MNC (Mobile Network Code)
 */
function detectCarrier(iccid: string | null): string {
  if (!iccid || iccid.length < 7) return 'Unknown';

  // Remove any non-digit characters
  const cleanIccid = iccid.replace(/\D/g, '');

  // Verizon: Starts with 8914
  if (cleanIccid.startsWith('8914')) return 'Verizon';

  // US Telecom: Starts with 8901
  if (cleanIccid.startsWith('8901')) {
    // Digits 5, 6, 7 represent the MNC (Mobile Network Code)
    // Note: substring(4, 7) gets characters at index 4, 5, 6 (the 5th, 6th, 7th digits)
    const mnc = cleanIccid.substring(4, 7);
    
    // AT&T Common Codes
    if (['030', '150', '170', '280', '380', '410', '560', '680'].includes(mnc)) {
      return 'AT&T';
    }
    
    // T-Mobile Common Codes
    if (['026', '160', '240', '260', '490', '580', '800'].includes(mnc)) {
      return 'T-Mobile';
    }
  }

  return 'Other/Unknown';
}

/**
 * Logs into the gateway using the central config.
 */
async function loginToGateway(page: Page, gatewayId: GatewayConfig.GatewayId) {
  const config = GatewayConfig.GATEWAY_CONFIGS[gatewayId];
  if (!config || !config.url || !config.password) {
    throw new Error(`Config missing or incomplete for gateway ${gatewayId} in gateway-config.ts`);
  }
  
  console.log(`Attempting to log in to: ${config.url} (Gateway ${gatewayId})`);
  
  // Increased timeout for internal IPs which might be slower
  await page.goto(config.url, { timeout: 120000 });
  
  await page.locator('#accountID').click();
  await page.locator('#accountID').fill('root');
  await page.locator('#passwordID2').click();
  await page.locator('#passwordID').fill(config.password);
  await page.locator('#passwordID').press('Enter');
  
  console.log('Login submitted.');
}

/**
 * Sends an AT command and waits for results
 */
async function sendATCommand(page: Page, command: string): Promise<void> {
  console.log(`Sending AT command: ${command}`);
  
  try {
    const rightFrame = page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame();
    await rightFrame.locator('#ID_goip_at_cmd').waitFor({ state: 'visible', timeout: 30000 });
    await rightFrame.locator('#ID_goip_at_cmd').click();
    await rightFrame.locator('#ID_goip_at_cmd').fill(command);
    await rightFrame.getByRole('checkbox', { name: 'All' }).check();
    // Use explicit text matching for the button to avoid regex issues
    await rightFrame.getByRole('cell', { name: `${command}   Send` }).getByRole('button').click();
    
    // Wait for command to process
    await page.waitForTimeout(8000);
  } catch (e) {
    console.warn(`Failed to send command ${command}: ${(e as Error).message}`);
  }
}

/**
 * Extracts data from AT command response rows
 */
async function extractATData(page: Page, command: string): Promise<{ [port: string]: string | null }> {
  console.log(`Extracting data for ${command}...`);
  
  const rightFrame = page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame();
  
  // Wait for OK responses
  try {
    // Wait for at least one OK to appear
    await rightFrame.locator('td:has-text("OK")').first().waitFor({ state: 'visible', timeout: 90000 });
    
    let okCount = 0;
    const maxRetries = 15;
    for(let i = 0; i < maxRetries; i++) {
      okCount = await rightFrame.locator('td:has-text("OK")').count();
      if (okCount > 50) break;
      await page.waitForTimeout(2000);
    }
    console.log(`Found ${okCount} "OK" responses.`);
  } catch (e) {
    console.warn(`Timeout waiting for ${command} responses: ${(e as Error).message}`);
  }
  
  const data: { [port: string]: string | null } = {};
  for (let i = 1; i <= 64; i++) {
    data[`A${i}`] = null;
  }
  
  const rowsWithOk = rightFrame.locator('tr:has(td:has-text("OK"))');
  const rowCount = await rowsWithOk.count();
  console.log(`Found ${rowCount} rows with OK for ${command}`);
  
  for (let i = 0; i < rowCount; i++) {
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
    
    // Extract port number
    const portMatch = txt.match(/\bA\d{1,2}\b|\b\d{1,2}A\b/);
    let portKey: string | null = null;
    if (portMatch) {
      const raw = portMatch[0];
      portKey = /^\d{1,2}A$/.test(raw) ? 'A' + raw.replace(/A$/, '') : raw;
    }
    
    if (!portKey) continue;
    
    // Extract value based on command type
    let value: string | null = null;
    
    if (command === 'at+ccid') {
      const ccidMatch = txt.match(/\+CCID:\s*(\d{10,})/i);
      if (ccidMatch) {
        value = ccidMatch[1];
      } else {
        const matches = txt.match(/\d{10,}/g);
        if (matches && matches.length) {
          value = matches.sort((a, b) => b.length - a.length)[0];
        }
      }
    } else if (command === 'at+cnum') {
      const cnumMatch = txt.match(/\+CNUM:\s*"[^"]*","\+?(\d{10,})"/i);
      if (cnumMatch) {
        value = cnumMatch[1];
      } else {
        const matches = txt.match(/\d{10,}/g);
        if (matches && matches.length) {
          value = matches.sort((a, b) => b.length - a.length)[0];
        }
      }
    } else {
      // For IMEI (at+cgsn)
      const numberMatch = txt.match(/\d{10,}/g);
      value = numberMatch ? numberMatch.sort((a, b) => b.length - a.length)[0] : null;
    }
    
    if (value && portKey) {
      data[portKey] = value;
    }
  }
  
  return data;
}

/**
 * Main scraping function for a single gateway
 */
export async function scrapeGateway(page: Page, gatewayId: GatewayConfig.GatewayId): Promise<PortData[]> {
  console.log(`\n=== Starting scrape for Gateway ${gatewayId} ===`);
  
  await loginToGateway(page, gatewayId);
  
  // Wait for frames to load after login
  console.log('Waiting for frames to load after login...');
  await page.waitForTimeout(5000);
  
  // --- ROBUST NAVIGATION (Fixes hanging on internal IPs) ---
  console.log('Navigating to Gateway settings...');
  try {
    await page.getByText('</body> </html>').contentFrame().locator('frame[name="left"]').contentFrame().getByText('Gateway settings').click({ timeout: 10000 });
    console.log('Clicked Gateway settings');
  } catch (e) {
    console.warn('Could not click Gateway settings text, trying alternative ID...');
    // Fallback to the ID-based approach
    const leftFrame = await page.getByText('</body> </html>').contentFrame().locator('frame[name="left"]').contentFrame();
    await leftFrame.locator('#ID_Settings_Plus_Minus').click({ timeout: 5000 });
  }
  
  await page.waitForTimeout(2000);
  
  console.log('Navigating to Port Settings...');
  await page.getByText('</body> </html>').contentFrame().locator('frame[name="left"]').contentFrame().getByRole('link', { name: 'Port Settings' }).click();
  
  console.log('Waiting for Port Settings page to load...');
  await page.waitForTimeout(5000);
  
  // Verify the input field is ready to prevent stuck logic
  const rightFrame = page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame();
  await rightFrame.locator('#ID_goip_at_cmd').waitFor({ state: 'visible', timeout: 60000 });
  console.log('Port Settings page loaded and ready.');
  // --- END ROBUST NAVIGATION ---
  
  // Scrape IMEI (at+cgsn)
  await sendATCommand(page, 'at+cgsn');
  const imeiData = await extractATData(page, 'at+cgsn');
  
  // Scrape ICCID (at+ccid)
  await sendATCommand(page, 'at+ccid');
  const iccidData = await extractATData(page, 'at+ccid');
  
  // Scrape MDN (at+cnum)
  await sendATCommand(page, 'at+cnum');
  const mdnData = await extractATData(page, 'at+cnum');
  
  // Combine data for all ports
  const portDataArray: PortData[] = [];
  
  for (let i = 1; i <= 64; i++) {
    const portKey = `A${i}`;
    let mdn = mdnData[portKey];
    const iccid = iccidData[portKey];
    const imei = imeiData[portKey];
    
    // Remove leading "1" from MDN if present (e.g. 15551234567 -> 5551234567)
    if (mdn && mdn.length === 11 && mdn.startsWith('1')) {
      mdn = mdn.substring(1);
    }
    
    // Detect Carrier
    const carrier = detectCarrier(iccid);
    
    // Calculate missing data
    const missingData: string[] = [];
    if (!mdn) missingData.push('MDN');
    if (!iccid) missingData.push('ICCID');
    if (!imei) missingData.push('IMEI');
    
    const portData: PortData = {
      port: `${gatewayId}-${portKey}`,
      mdn: mdn,
      iccid: iccid,
      imei: imei,
      carrier: carrier,
      status: 'inactive', // Default
      missingData: missingData
    };
    
    portDataArray.push(portData);
  }
  
  // Scrape port status visuals
  console.log('Navigating to Port Status...');
  await page.getByText('</body> </html>').contentFrame().locator('frame[name="left"]').contentFrame().getByRole('link', { name: 'Port Status' }).click();
  await page.waitForTimeout(10000);
  
  // Get status for each port
  const rightFrameStatus = page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame();
  
  try {
    await rightFrameStatus.locator('table').first().waitFor({ state: 'visible', timeout: 60000 });
    
    const statusRows = rightFrameStatus.locator('tr:has(td)');
    const statusRowCount = await statusRows.count();
    
    for (let i = 0; i < statusRowCount; i++) {
      const row = statusRows.nth(i);
      const rowText = await row.textContent().catch(() => '');
      
      if (!rowText) continue;
      
      const portMatch = rowText.match(/(\d{1,2})A/);
      if (!portMatch) continue;
      
      const portNum = parseInt(portMatch[1], 10);
      const portKey = `A${portNum}`;
      
      const portDataIndex = portDataArray.findIndex(p => p.port === `${gatewayId}-${portKey}`);
      if (portDataIndex === -1) continue;
      
      const currentPort = portDataArray[portDataIndex];
      
      try {
        const statusCell = row.locator('td').first();
        const statusHtml = (await statusCell.innerHTML().catch(() => '')).toLowerCase();
        
        // --- Determine Visual State ---
        let visualState = 'unknown';
        
        if (statusHtml.includes('offline') || statusHtml.includes('red') || statusHtml.includes('#ff0000') || statusHtml.includes('rgb(255, 0, 0)')) {
          visualState = 'red-dot';
        } else if (statusHtml.includes('exclamation') || statusHtml.includes('error') || statusHtml.includes('alert')) {
          visualState = 'error';
        } else if (statusHtml.includes('weaksignal') || statusHtml.includes('weak') || statusHtml.includes('yellow') || statusHtml.includes('circle')) {
          visualState = 'green-circle';
        } else if (statusHtml.includes('online') || statusHtml.includes('green') || statusHtml.includes('#00ff00') || statusHtml.includes('rgb(0, 255, 0)') || statusHtml.includes('rgb(0, 128, 0)')) {
          visualState = 'green-dot';
        }

        // --- Apply Strict Business Logic ---
        // "Active" only if Green Dot AND all data present
        const hasAllData = currentPort.missingData.length === 0;

        if (visualState === 'red-dot') {
          currentPort.status = 'inactive';
        } else if (visualState === 'error') {
          currentPort.status = 'error'; // Red exclamation is always an error
        } else if (visualState === 'green-circle') {
          currentPort.status = 'weak-signal'; // Online but weak
        } else if (visualState === 'green-dot') {
          if (hasAllData) {
            currentPort.status = 'active'; // The only true ACTIVE state
          } else {
            currentPort.status = 'error'; // Green dot but missing data = Error/Partial
          }
        }

      } catch (e) {
        console.warn(`Could not determine status for ${portKey}`);
      }
    }
  } catch (e) {
    console.warn('Could not scrape port status:', (e as Error).message);
  }
  
  console.log(`Gateway ${gatewayId} scrape complete. Active: ${portDataArray.filter(p => p.status === 'active').length}`);
  
  return portDataArray;
}

/**
 * Scrapes all configured gateways
 */
export async function scrapeAllGateways(page: Page): Promise<{ data: PortData[], errors: string[] }> {
  const allData: PortData[] = [];
  const errors: string[] = [];
  const gatewayIds = Object.keys(GatewayConfig.GATEWAY_CONFIGS) as GatewayConfig.GatewayId[];
  
  console.log(`\n=== Starting scrape for ${gatewayIds.length} gateways ===`);
  
  for (const gatewayId of gatewayIds) {
    try {
      const gatewayData = await scrapeGateway(page, gatewayId);
      allData.push(...gatewayData);
    } catch (error) {
      const errorMsg = `Gateway ${gatewayId} FAILED: ${(error as Error).message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }
  
  return { data: allData, errors };
}

/**
 * Formats scraped data as a text report
 */
export function formatScrapedData(data: PortData[], errors: string[]): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(120));
  lines.push('GATEWAY INVENTORY REPORT');
  lines.push('Generated: ' + new Date().toISOString());
  lines.push('='.repeat(120));
  lines.push('');
  
  if (errors.length > 0) {
    lines.push('ERRORS ENCOUNTERED:');
    errors.forEach(err => lines.push(`  ❌ ${err}`));
    lines.push('');
    lines.push('='.repeat(120));
    lines.push('');
  }
  
  // Group by gateway
  const groupedData: { [gateway: string]: PortData[] } = {};
  data.forEach(port => {
    const gateway = port.port.split('-')[0];
    if (!groupedData[gateway]) {
      groupedData[gateway] = [];
    }
    groupedData[gateway].push(port);
  });
  
  Object.keys(groupedData).sort().forEach(gateway => {
    lines.push(`\nGATEWAY ${gateway}`);
    lines.push('-'.repeat(120));
    lines.push(`${'PORT'.padEnd(12)} ${'STATUS'.padEnd(15)} ${'CARRIER'.padEnd(12)} ${'MDN'.padEnd(15)} ${'ICCID'.padEnd(22)} ${'IMEI'.padEnd(18)} ${'NOTES'}`);
    lines.push('-'.repeat(120));
    
    groupedData[gateway].forEach(port => {
      let statusIcon = '🔴';
      let statusText = 'Inactive';
      
      if (port.status === 'active') {
        statusIcon = '🟢';
        statusText = 'Active';
      } else if (port.status === 'weak-signal') {
        statusIcon = '🟡';
        statusText = 'Weak Sig';
      } else if (port.status === 'error') {
        statusIcon = '⚠️ ';
        statusText = 'Error';
      }
      
      const missingStr = port.missingData.length > 0 ? `MISSING: ${port.missingData.join(',')}` : '';
      
      lines.push(
        `${port.port.padEnd(12)} ${(statusIcon + ' ' + statusText).padEnd(15)} ${port.carrier.padEnd(12)} ${(port.mdn || 'N/A').padEnd(15)} ${(port.iccid || 'N/A').padEnd(22)} ${(port.imei || 'N/A').padEnd(18)} ${missingStr}`
      );
    });
  });
  
  return lines.join('\n');
}

/**
 * Saves scraped data to files
 */
export function saveScrapedData(data: PortData[], errors: string[], outputPath: string): { txtPath: string, jsonPath: string, errorPath: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const txtPath = path.join(outputPath, `GW_Inventory_${timestamp}.txt`);
  const jsonPath = path.join(outputPath, `GW_Inventory_${timestamp}.json`);
  const errorPath = path.join(outputPath, `GW_Inventory_Errors_${timestamp}.log`);
  
  const formattedText = formatScrapedData(data, errors);
  fs.writeFileSync(txtPath, formattedText, 'utf8');
  
  fs.writeFileSync(jsonPath, JSON.stringify({ data, errors, timestamp: new Date().toISOString() }, null, 2), 'utf8');
  
  if (errors.length > 0) {
    fs.writeFileSync(errorPath, errors.join('\n'), 'utf8');
  }
  
  console.log(`\n✅ Scrape data saved:`);
  console.log(`   TXT: ${txtPath}`);
  console.log(`   JSON: ${jsonPath}`);
  if (errors.length > 0) {
    console.log(`   ERRORS: ${errorPath}`);
  }
  
  return { txtPath, jsonPath, errorPath };
}