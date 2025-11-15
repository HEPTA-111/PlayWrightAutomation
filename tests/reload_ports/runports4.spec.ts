import { test, expect } from '@playwright/test';
import { reloadGatewayPorts } from './gateway-helper';

// Force headed mode and slow down
test.use({ headless: false, launchOptions: { slowMo: 50 } });

test('Reload Gateway 104', async ({ page }) => {
  // Set a long timeout (10 minutes) for this test
  test.setTimeout(600000);
  
  const gatewayId = "104";

  console.log(`--- STARTING RELOAD FOR GATEWAY ${gatewayId} ---`);

  try {
    await reloadGatewayPorts(page, gatewayId);
    console.log(`--- GATEWAY ${gatewayId} RELOAD SUCCEEDED ---`);
  } catch (e) {
    console.error(`--- GATEWAY ${gatewayId} RELOAD FAILED: ${(e as Error).message} ---`);
    throw e; // Fail the test
  }
});