import { test } from '@playwright/test';
import { scrapeIQEnhanced, saveEnhancedIQData } from './iq-scraper';

test.use({ headless: false, launchOptions: { slowMo: 50 } });

const outputPath = process.env.OUTPUT_PATH || process.cwd();

test('Scrape PrepaidIQ Enhanced Line Details', async ({ page }) => {
  test.setTimeout(1800000); // 30 minutes

  console.log('\n================================================');
  console.log('   PREPAIDIQ ENHANCED LINE DETAILS SCRAPER');
  console.log('================================================\n');

  console.log(`Output directory: ${outputPath}\n`);

  // Scrape IQ data (reads latest inventory automatically)
  const { data, errors } = await scrapeIQEnhanced(page, outputPath);

  console.log('\n================================================');
  console.log('   SCRAPING COMPLETE');
  console.log('================================================\n');

  console.log(`Total enhanced lines: ${data.length}`);
  console.log(`Lines with IQ data: ${data.filter(d => d.iqStatus).length}`);
  
  if (errors.length > 0) {
    console.log(`\n⚠️  Errors encountered: ${errors.length}`);
    errors.forEach(err => console.log(`   ${err}`));
  }

  // Save enhanced data
  console.log('\n================================================');
  console.log('   SAVING DATA');
  console.log('================================================\n');
  
  const jsonPath = saveEnhancedIQData(data, errors, outputPath);

  console.log('\n================================================');
  console.log('   ENHANCED IQ SCRAPE COMPLETE');
  console.log('================================================\n');
});