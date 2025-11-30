const fs = require('fs');
const path = require('path');

async function generateEnhancedIQPDF(data, errors, outputPath) {
  const { chromium } = require('playwright');
  
  const now = new Date();
  const datePart = now.toISOString().split('T')[0];
  const timePart = now.toISOString().split('T')[1].replace(/[:.]/g, '').substring(0, 6);
  const pdfPath = path.join(outputPath, `IQ_Report_GW_${datePart}_${timePart}.pdf`);

  // Group by gateway
  const byGateway = {};
  data.forEach(line => {
    const gw = line.gateway || 'Unknown';
    if (!byGateway[gw]) byGateway[gw] = [];
    byGateway[gw].push(line);
  });

  // Generate HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 8pt;
      line-height: 1.3;
      color: #333;
    }
    .header {
      text-align: center;
      padding: 15px 0;
      border-bottom: 3px solid #0066cc;
      margin-bottom: 15px;
    }
    .header h1 { font-size: 20pt; color: #0066cc; margin-bottom: 5px; }
    .header .subtitle { font-size: 10pt; color: #666; }
    .summary {
      background: #e7f3ff;
      padding: 12px;
      border-radius: 5px;
      margin-bottom: 15px;
      font-size: 9pt;
      display: flex;
      justify-content: space-around;
    }
    .summary-item { text-align: center; }
    .summary-item .number { font-size: 16pt; font-weight: bold; color: #0066cc; }
    .summary-item .label { font-size: 8pt; color: #666; margin-top: 3px; }
    .gateway-section {
      margin-bottom: 15px;
      page-break-inside: avoid;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    .gateway-header {
      background: #0066cc;
      color: white;
      padding: 5px 10px;
      font-size: 10pt;
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: #f1f3f5;
      padding: 5px;
      text-align: left;
      font-weight: bold;
      border: 1px solid #dee2e6;
      font-size: 7pt;
    }
    td {
      padding: 4px 5px;
      border: 1px solid #dee2e6;
      font-size: 7pt;
    }
    tr:nth-child(even) { background: #fdfdfd; }
    .status-active { background: #d4edda; color: #155724; padding: 2px 5px; border-radius: 3px; font-weight: bold; }
    .status-inactive { background: #f8d7da; color: #721c24; padding: 2px 5px; border-radius: 3px; font-weight: bold; }
    .carrier-att { color: #0057b8; font-weight: bold; }
    .carrier-tmo { color: #ea0a8e; font-weight: bold; }
    .carrier-verizon { color: #cd040b; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>PrepaidIQ Enhanced Line Details Report</h1>
    <div class="subtitle">Gateway Inventory + IQ Data Combined | Generated: ${new Date().toLocaleString()}</div>
  </div>

  <div class="summary">
    <div class="summary-item">
      <div class="number">${data.length}</div>
      <div class="label">Total Lines</div>
    </div>
    <div class="summary-item">
      <div class="number" style="color: #28a745;">${data.filter(d => d.iqStatus === 'Active').length}</div>
      <div class="label">IQ Active</div>
    </div>
    <div class="summary-item">
      <div class="number" style="color: #dc3545;">${data.filter(d => d.iqStatus === 'Inactive').length}</div>
      <div class="label">IQ Inactive</div>
    </div>
    <div class="summary-item">
      <div class="number">${data.filter(d => d.ratePlan).length}</div>
      <div class="label">With Plan Info</div>
    </div>
  </div>

  ${errors.length > 0 ? `
  <div style="background:#fff3cd; border:1px solid #ffc107; padding:8px; margin-bottom:10px; border-radius:4px; font-size:8pt;">
    <strong>⚠️ Errors:</strong> ${errors.slice(0, 5).join(', ')}${errors.length > 5 ? ` (+${errors.length - 5} more)` : ''}
  </div>
  ` : ''}

  ${Object.keys(byGateway).sort().map(gw => {
    const lines = byGateway[gw];
    return `
    <div class="gateway-section">
      <div class="gateway-header">Gateway ${gw} (${lines.length} lines with MDN)</div>
      <table>
        <thead>
          <tr>
            <th style="width: 8%;">Port</th>
            <th style="width: 7%;">Carrier</th>
            <th style="width: 10%;">MDN</th>
            <th style="width: 8%;">GW Status</th>
            <th style="width: 8%;">IQ Status</th>
            <th style="width: 18%;">Rate Plan</th>
            <th style="width: 8%;">Balance</th>
            <th style="width: 10%;">Expiry</th>
            <th style="width: 18%;">ICCID</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map(line => {
            let carrierClass = '';
            if (line.carrier === 'AT&T') carrierClass = 'carrier-att';
            else if (line.carrier === 'T-Mobile') carrierClass = 'carrier-tmo';
            else if (line.carrier === 'Verizon') carrierClass = 'carrier-verizon';
            
            const iqStatusClass = line.iqStatus === 'Active' ? 'status-active' : 'status-inactive';
            
            return `
            <tr>
              <td>${line.port || 'N/A'}</td>
              <td class="${carrierClass}">${line.carrier || 'N/A'}</td>
              <td>${line.mdn || 'N/A'}</td>
              <td>${line.gatewayStatus || 'N/A'}</td>
              <td><span class="${iqStatusClass}">${line.iqStatus || 'Unknown'}</span></td>
              <td>${line.ratePlan || 'N/A'}</td>
              <td>${line.balance || 'N/A'}</td>
              <td>${line.expiry || 'N/A'}</td>
              <td style="font-size: 6.5pt;">${line.iccid || 'N/A'}</td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    `;
  }).join('')}

  <div style="margin-top: 15px; text-align: center; font-size: 7pt; color: #666;">
    PrepaidIQ Enhanced Line Details | AutoM8 System | Data from latest Gateway Inventory + IQ Portal
  </div>
</body>
</html>
  `;

  // Create temp HTML
  const tempHtmlPath = path.join(outputPath, `temp_iq_${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, html, 'utf8');

  // Generate PDF
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle' });
  
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
  });

  await browser.close();

  // Cleanup
  try { fs.unlinkSync(tempHtmlPath); } catch (e) {}

  return pdfPath;
}

async function main() {
  const outputPath = process.env.OUTPUT_PATH || path.resolve(process.cwd());
  const today = new Date().toISOString().split('T')[0];
  const jsonPath = path.join(outputPath, `IQ_Enhanced_${today}.json`);

  if (!fs.existsSync(jsonPath)) {
    console.error('Enhanced IQ JSON file not found:', jsonPath);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const data = payload.data || [];
  const errors = payload.errors || [];

  console.log(`Loaded ${data.length} enhanced lines from ${jsonPath}. Generating IQ PDF...`);

  try {
    const pdfPath = await generateEnhancedIQPDF(data, errors, outputPath);
    console.log('✅ Enhanced IQ PDF generated at:', pdfPath);
    process.exit(0);
  } catch (e) {
    console.error('❌ PDF generation failed:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

main();