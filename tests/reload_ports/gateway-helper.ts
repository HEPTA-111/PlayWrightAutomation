import { test, expect, type Page, type FrameLocator } from '@playwright/test';
// --- FIX: Change the import style ---
import * as GatewayConfig from './gateway-config'; // <-- Import everything as an object

/**
 * Logs into the gateway using the central config.
 * @param page - The Playwright page object.
 * @param gatewayId - The ID of the gateway (e.g., "101", "102").
 */
// --- FIX: Use the imported object for the type ---
async function loginToGateway(page: Page, gatewayId: GatewayConfig.GatewayId) {
  // --- FIX: Access the config from the imported object ---
  const config = GatewayConfig.GATEWAY_CONFIGS[gatewayId];
  if (!config || !config.url || !config.password) {
    throw new Error(`Config missing or incomplete for gateway ${gatewayId} in gateway-config.ts`);
  }
  
  console.log(`Attempting to log in to: ${config.url} (Gateway ${gatewayId})`);
  await page.goto(config.url, { timeout: 30000 });
  await page.locator('#accountID').fill('root');
  await page.locator('#passwordID2').click();
  await page.locator('#passwordID').fill(config.password);

  console.log('Submitting login...');
  // This just clicks 'Submit'. The *next* function will wait for the page to load.
  await page.getByText('Submit').click();
  console.log('Login submitted.');
}

// --- NEW HELPER FUNCTIONS BASED ON YOUR EXAMPLE ---

/**
 * Sends an AT command.
 */
async function sendAT(rightFrame: FrameLocator, command: string, page: Page) {
  console.log(`Sending AT command: ${command}`);
  await rightFrame.locator('#ID_goip_at_cmd').fill(command);
  await rightFrame.getByRole('checkbox', { name: 'All' }).check();
  
  // --- THIS IS THE FIX ---
  // Removed the 'nonNumeric' flag and the failing RegExp.
  // Using the exact locator from your test-1.spec.ts file,
  // which uses a non-breaking space (\u00a0).
  const buttonName = `${command} \u00a0 Send`;
  console.log(`Clicking send button with name: "${buttonName}"`);
  
  await rightFrame.getByRole('cell', { name: buttonName }).getByRole('button').click();
  // --- END FIX ---

  await page.waitForTimeout(3000); // Wait for command to process
}

/**
 * Saves the "Port Hardware" settings.
 */
async function savePortHardware(rightFrame: FrameLocator, page: Page) {
  console.log('Saving Port Hardware settings...');
  await rightFrame.locator('input[name="btn_goip_port_hwattr"]').click();
  await page.waitForTimeout(2000);
}

/**
 * Saves the "Basic Settings".
 */
async function saveBasicSettings(rightFrame: FrameLocator, page: Page) {
  console.log('Saving Basic settings...');
  await rightFrame.locator('input[name="btn_goip_basic_settings"]').click();
  await page.waitForTimeout(2000);
}

// --- END NEW HELPER FUNCTIONS ---


/**
 * Main reload function for a single gateway.
 * @param page - The Playwright page object.
 * @param gatewayId - The ID of the gateway (e.g., "101", "102").
 */
// --- FIX: Use the imported object for the type ---
export async function reloadGatewayPorts(page: Page, gatewayId: GatewayConfig.GatewayId) {
  await loginToGateway(page, gatewayId); // <-- Pass only the ID

  // --- THIS IS THE FIX ---
  // Replaced the failing page.waitForSelector('frame[name="main"]')
  // with the reliable locator from your reference test-1.spec.ts file.
  console.log('Login submitted. Waiting for frames to load...');
  
  // Wait for the 'main' content frame to be available
  const mainFrameLocator = page.getByText('</body> </html>');
  await mainFrameLocator.waitFor({ state: 'visible', timeout: 30000 });
  const mainFrame = mainFrameLocator.contentFrame();

  // Get the left frame
  const leftFrameLocator = mainFrame.locator('frame[name="left"]');
  await leftFrameLocator.waitFor({ state: 'visible', timeout: 10000 });
  const leftFrame = leftFrameLocator.contentFrame();

  // Get the right frame
  const rightFrameLocator = mainFrame.locator('frame[name="right"]');
  await rightFrameLocator.waitFor({ state: 'visible', timeout: 10000 });
  const rightFrame = rightFrameLocator.contentFrame();
  // --- END FIX ---

  console.log('Frames loaded. Navigating to Port Settings...');
  
  // Navigate to Port Settings
  // Note: Your example doesn't click 'Gateway settings' first, it just clicks 'Port Settings'
  // I will follow your reference test-1.spec.ts
  await leftFrame.locator('#ID_Settings_Plus_Minus').click(); // This is from test-1.spec.ts
  await leftFrame.getByRole('link', { name: 'Port Settings' }).click();

  // Wait for Port Settings page to load
  await rightFrame.locator('#ID_goip_at_cmd').waitFor({ state: 'visible', timeout: 15000 });
  console.log('Port Settings page loaded. Starting reload sequence...');

  // --- NEW RELOAD SEQUENCE (from your example) ---
  const allCheckbox = rightFrame.getByRole('checkbox', { name: 'All' });
  const listFootCheckbox = rightFrame.locator('.listFoot > tbody > tr > td:nth-child(3) > input');
  const enableCheckbox = rightFrame.getByRole('checkbox', { name: 'Enable' });
  const enableCell = rightFrame.getByRole('cell', { name: 'Enable', exact: true });

  // 1. at+ccid
  await sendAT(rightFrame, 'at+ccid', page); // Removed nonNumeric flag
  await listFootCheckbox.check();
  await savePortHardware(rightFrame, page);

  // 2. Refresh and toggle list foot
  await rightFrame.getByRole('button', { name: 'Refresh' }).click();
  await allCheckbox.check();
  await listFootCheckbox.check();
  await listFootCheckbox.uncheck();
  await savePortHardware(rightFrame, page);
  
  // 3. Toggle basic enable
  await enableCheckbox.check();
  await saveBasicSettings(rightFrame, page);
  await enableCell.click();
  await enableCheckbox.uncheck();
  await saveBasicSettings(rightFrame, page);

  // 4. at+cgsn
  await sendAT(rightFrame, 'at+cgsn', page); // Removed nonNumeric flag
  await enableCheckbox.check();
  await saveBasicSettings(rightFrame, page);

  // 5. at+cgsn (again)
  await sendAT(rightFrame, 'at+cgsn', page); // Removed nonNumeric flag
  await listFootCheckbox.check();
  await savePortHardware(rightFrame, page);
  
  // 6. Toggle basic enable
  await enableCheckbox.uncheck();
  await saveBasicSettings(rightFrame, page);
  
  // 7. Toggle list foot
  await listFootCheckbox.check();
  await listFootCheckbox.uncheck();
  await savePortHardware(rightFrame, page);

 // 8. Toggle basic enable
  await enableCell.click();
  await enableCheckbox.check();
  await saveBasicSettings(rightFrame, page);

  // 9. Save port hardware
  await savePortHardware(rightFrame, page);

  // 10. at+cnum
  await sendAT(rightFrame, 'at+cnum', page); // Removed nonNumeric flag
  
  // Your example shows 'at+cum' but the command is 'at+cnum', I am following the command
  // The 'sendAT' function now handles this click, so this line is no longer needed.
  // await rightFrame.getByRole('cell', { name: 'at+cnum   Send' }).getByRole('button').click();
  
  // 11. Toggle list foot
  await rightFrame.locator('.listFoot > tbody > tr > td:nth-child(3)').click();
  await savePortHardware(rightFrame, page);
  await rightFrame.locator('.listFoot > tbody > tr > td:nth-child(3)').click();
  await listFootCheckbox.uncheck();
  await savePortHardware(rightFrame, page);

  // 12. Final toggle
  await enableCheckbox.uncheck();
  await saveBasicSettings(rightFrame, page);
  await enableCell.click();
  await enableCheckbox.check();
  await saveBasicSettings(rightFrame, page);
  await enableCheckbox.uncheck();
  await page.waitForTimeout(1000); // Final pause

  console.log('--- Reload sequence complete. ---');
}