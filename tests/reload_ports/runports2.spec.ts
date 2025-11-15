import { test, expect } from '@playwright/test';
import { reloadGatewayPorts } from './gateway-helper';

// Force headed mode and slow down
test.use({ headless: false, launchOptions: { slowMo: 50 } });

test('Reload Gateway 102', async ({ page }) => {
  // Set a long timeout (10 minutes) for this test
  test.setTimeout(600000);
  
  const gatewayId = "102"; // <-- This is the only change needed

  console.log(`--- STARTING RELOAD FOR GATEWAY ${gatewayId} ---`);

  try {
    // Just pass the ID. The helper will find the URL and Password
    // from gateway-config.ts
    await reloadGatewayPorts(page, gatewayId);
    console.log(`--- GATEWAY ${gatewayId} RELOAD SUCCEEDED ---`);
  } catch (e) {
    console.error(`--- GATEWAY ${gatewayId} RELOAD FAILED: ${(e as Error).message} ---`);
    throw e; // Fail the test
  }
});