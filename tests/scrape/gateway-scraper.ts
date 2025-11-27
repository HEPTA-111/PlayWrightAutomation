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
  status: 'active' | 'inactive' | 'weak-signal';
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
  
  await page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame().locator('#ID_goip_at_cmd').click();
  await page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame().locator('#ID_goip_at_cmd').fill(command);
  await page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame().getByRole('checkbox', { name: 'All' }).check();
  await page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame().getByRole('cell', { name: `${command}   Send` }).getByRole('button').click();
  
  // Wait for command to process
  await page.waitForTimeout(8000);
}

/**
 * Extracts data from AT command response rows
 */
async function extractATData(page: Page, command: string): Promise<{ [port: string]: string | null }> {
  console.log(`Extracting data for ${command}...`);
  
  const rightFrame = page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame();
  
  // Wait for OK responses
  try {
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
  
  // --- CRITICAL FIX: Click "Gateway settings" FIRST, then "Port Settings" ---
  console.log('Navigating to Gateway settings...');
  try {
    await page.getByText('</body> </html>').contentFrame().locator('frame[name="left"]').contentFrame().getByText('Gateway settings').click();
    console.log('Clicked Gateway settings');
  } catch (e) {
    console.warn('Could not click Gateway settings text, trying alternative...');
    // Fallback to the ID-based approach
    const leftFrame = await page.getByText('</body> </html>').contentFrame().locator('frame[name="left"]').contentFrame();
    await leftFrame.locator('#ID_Settings_Plus_Minus').click();
  }
  
  await page.waitForTimeout(2000);
  
  console.log('Navigating to Port Settings...');
  await page.getByText('</body> </html>').contentFrame().locator('frame[name="left"]').contentFrame().getByRole('link', { name: 'Port Settings' }).click();
  
  console.log('Waiting for Port Settings page to load...');
  await page.waitForTimeout(5000);
  
  // Verify the input field is ready
  const rightFrame = page.getByText('</body> </html>').contentFrame().locator('frame[name="right"]').contentFrame();
  await rightFrame.locator('#ID_goip_at_cmd').waitFor({ state: 'visible', timeout: 60000 });
  console.log('Port Settings page loaded and ready.');
  
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
    
    // Remove leading "1" from MDN if present
    if (mdn && mdn.length === 11 && mdn.startsWith('1')) {
      mdn = mdn.substring(1);
    }
    
    const portData: PortData = {
      port: `${gatewayId}-${portKey}`,
      mdn: mdn,
      iccid: iccidData[portKey],
      imei: imeiData[portKey],
      status: 'inactive'
    };
    
    portDataArray.push(portData);
  }
  
  // Scrape port status
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
      
      try {
        const statusCell = row.locator('td').first();
        const statusHtml = await statusCell.innerHTML().catch(() => '');
        
        if (statusHtml.includes('offline') || statusHtml.includes('red') || statusHtml.includes('#ff0000') || statusHtml.includes('rgb(255, 0, 0)')) {
          portDataArray[portDataIndex].status = 'inactive';
        } else if (statusHtml.includes('weaksignal') || statusHtml.includes('weak') || statusHtml.includes('yellow') || statusHtml.includes('circle')) {
          portDataArray[portDataIndex].status = 'weak-signal';
        } else if (statusHtml.includes('online') || statusHtml.includes('green') || statusHtml.includes('#00ff00') || statusHtml.includes('rgb(0, 255, 0)') || statusHtml.includes('rgb(0, 128, 0)')) {
          portDataArray[portDataIndex].status = 'active';
        }
      } catch (e) {
        console.warn(`Could not determine status for ${portKey}`);
      }
    }
  } catch (e) {
    console.warn('Could not scrape port status:', (e as Error).message);
  }
  
  console.log(`Gateway ${gatewayId} scrape complete. Found data for ${portDataArray.filter(p => p.imei).length}/64 ports`);
  
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
  
  lines.push('='.repeat(100));
  lines.push('GATEWAY INVENTORY REPORT');
  lines.push('Generated: ' + new Date().toISOString());
  lines.push('='.repeat(100));
  lines.push('');
  
  if (errors.length > 0) {
    lines.push('ERRORS ENCOUNTERED:');
    errors.forEach(err => lines.push(`  ❌ ${err}`));
    lines.push('');
    lines.push('='.repeat(100));
    lines.push('');
  }
  
  lines.push('Legend:');
  lines.push('  🟢 Active (Green Dot) - Port has MDN, ICCID, and IMEI');
  lines.push('  🔴 Inactive (Red Dot) - Port is missing data or not responding');
  lines.push('  🟡 Weak Signal (Yellow Circle) - Port has IMEI/ICCID but no MDN');
  lines.push('');
  lines.push('='.repeat(100));
  lines.push('');
  
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
    lines.push('-'.repeat(100));
    lines.push(`${'PORT'.padEnd(12)} ${'STATUS'.padEnd(20)} ${'MDN'.padEnd(15)} ${'ICCID'.padEnd(22)} ${'IMEI'.padEnd(18)}`);
    lines.push('-'.repeat(100));
    
    groupedData[gateway].forEach(port => {
      const statusIcon = port.status === 'active' ? '🟢' : port.status === 'weak-signal' ? '🟡' : '🔴';
      const statusText = port.status === 'active' ? 'Active' : port.status === 'weak-signal' ? 'Weak Signal' : 'Inactive';
      
      lines.push(
        `${port.port.padEnd(12)} ${(statusIcon + ' ' + statusText).padEnd(20)} ${(port.mdn || 'N/A').padEnd(15)} ${(port.iccid || 'N/A').padEnd(22)} ${(port.imei || 'N/A').padEnd(18)}`
      );
    });
  });
  
  lines.push('');
  lines.push('='.repeat(100));
  
  const activeCount = data.filter(p => p.status === 'active').length;
  const weakCount = data.filter(p => p.status === 'weak-signal').length;
  const inactiveCount = data.filter(p => p.status === 'inactive').length;
  
  lines.push('SUMMARY');
  lines.push('-'.repeat(100));
  lines.push(`Total Ports Scanned: ${data.length}`);
  lines.push(`🟢 Active: ${activeCount}`);
  lines.push(`🟡 Weak Signal: ${weakCount}`);
  lines.push(`🔴 Inactive: ${inactiveCount}`);
  lines.push('='.repeat(100));
  
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