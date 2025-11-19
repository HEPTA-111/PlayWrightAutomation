import { test } from '@playwright/test';
import { scrapeAllGateways, saveScrapedData } from './gateway-scraper'; // FIXED: Same folder
import { generatePDF } from './pdf-generator'; // FIXED: Same folder
import * as path from 'path';

// Force this test file to run in headed mode
test.use({ headless: false, launchOptions: { slowMo: 50 } });

// Determine where to save output files
const outputPath = process.env.OUTPUT_PATH || process.cwd();

test('Scrape All Gateways and Generate Inventory Report', async ({ page }) => {
  // Set a longer timeout for this operation (30 minutes)
  test.setTimeout(1800000);

  console.log('\n================================================');
  console.log('   GATEWAY INVENTORY SCRAPER');
  console.log('================================================\n');

  console.log(`Output directory: ${outputPath}\n`);

  // Scrape all gateways
  console.log('Starting gateway scraping process...\n');
  const { data, errors } = await scrapeAllGateways(page);

  console.log('\n================================================');
  console.log('   SCRAPING COMPLETE');
  console.log('================================================\n');

  console.log(`Total ports scraped: ${data.length}`);
  console.log(`Active ports: ${data.filter(p => p.status === 'active').length}`);
  console.log(`Weak signal ports: ${data.filter(p => p.status === 'weak-signal').length}`);
  console.log(`Inactive ports: ${data.filter(p => p.status === 'inactive').length}`);
  
  if (errors.length > 0) {
    console.log(`\n⚠️  Errors encountered: ${errors.length}`);
    errors.forEach(err => console.log(`   ${err}`));
  }

  // Save raw data (TXT, JSON, error log)
  console.log('\n================================================');
  console.log('   SAVING DATA');
  console.log('================================================\n');
  
  const { txtPath, jsonPath, errorPath } = saveScrapedData(data, errors, outputPath);

  // Generate PDF report
  console.log('\n================================================');
  console.log('   GENERATING PDF REPORT');
  console.log('================================================\n');

  try {
    const pdfPath = await generatePDF(data, errors, outputPath);
    console.log(`✅ PDF Report generated: ${pdfPath}`);
  } catch (error) {
    console.error(`❌ PDF generation failed: ${(error as Error).message}`);
    console.error('   TXT and JSON files are still available.');
  }

  console.log('\n================================================');
  console.log('   INVENTORY REPORT COMPLETE');
  console.log('================================================\n');
});