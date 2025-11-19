import * as fs from 'fs';
import * as path from 'path';
import type { PortData } from './gateway-scraper'; // FIXED: Same folder

/**
 * Generates a PDF report from scraped gateway data
 * Uses Playwright's PDF generation capabilities
 */
export async function generatePDF(data: PortData[], errors: string[], outputPath: string): Promise<string> {
  const { chromium } = require('playwright');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const pdfPath = path.join(outputPath, `GW_Inventory_${timestamp}.pdf`);

  // Group data by gateway
  const groupedData: { [gateway: string]: PortData[] } = {};
  data.forEach(port => {
    const gateway = port.port.split('-')[0];
    if (!groupedData[gateway]) {
      groupedData[gateway] = [];
    }
    groupedData[gateway].push(port);
  });

  // Calculate summary stats
  const activeCount = data.filter(p => p.status === 'active').length;
  const weakCount = data.filter(p => p.status === 'weak-signal').length;
  const inactiveCount = data.filter(p => p.status === 'inactive').length;

  // Generate HTML for PDF
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4 landscape;
      margin: 15mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 9pt;
      line-height: 1.3;
      color: #333;
    }
    
    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 3px solid #0066cc;
      margin-bottom: 20px;
    }
    
    .header h1 {
      font-size: 24pt;
      color: #0066cc;
      margin-bottom: 5px;
    }
    
    .header .timestamp {
      font-size: 10pt;
      color: #666;
    }
    
    .summary-box {
      background: #f0f8ff;
      border: 2px solid #0066cc;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-around;
    }
    
    .summary-item {
      text-align: center;
    }
    
    .summary-item .number {
      font-size: 20pt;
      font-weight: bold;
      color: #0066cc;
    }
    
    .summary-item .label {
      font-size: 9pt;
      color: #666;
      margin-top: 5px;
    }
    
    .error-box {
      background: #fff3cd;
      border: 2px solid #ffc107;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .error-box h3 {
      color: #856404;
      margin-bottom: 10px;
    }
    
    .error-box ul {
      list-style: none;
      padding-left: 0;
    }
    
    .error-box li {
      padding: 5px 0;
      color: #856404;
    }
    
    .gateway-section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    
    .gateway-header {
      background: #0066cc;
      color: white;
      padding: 10px 15px;
      font-size: 12pt;
      font-weight: bold;
      border-radius: 5px 5px 0 0;
    }
    
    .gateway-stats {
      background: #e6f2ff;
      padding: 8px 15px;
      font-size: 8pt;
      border-left: 2px solid #0066cc;
      border-right: 2px solid #0066cc;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0;
    }
    
    th {
      background: #f8f9fa;
      padding: 8px;
      text-align: left;
      font-weight: bold;
      border: 1px solid #dee2e6;
      font-size: 8pt;
    }
    
    td {
      padding: 6px 8px;
      border: 1px solid #dee2e6;
      font-size: 8pt;
    }
    
    tr:nth-child(even) {
      background: #f8f9fa;
    }
    
    .status {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      font-weight: bold;
      font-size: 7pt;
    }
    
    .status-active {
      background: #d4edda;
      color: #155724;
    }
    
    .status-weak {
      background: #fff3cd;
      color: #856404;
    }
    
    .status-inactive {
      background: #f8d7da;
      color: #721c24;
    }
    
    .legend {
      margin: 20px 0;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    
    .legend h3 {
      margin-bottom: 10px;
      color: #0066cc;
    }
    
    .legend-item {
      display: inline-block;
      margin-right: 20px;
      margin-bottom: 5px;
    }
    
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 2px solid #dee2e6;
      text-align: center;
      font-size: 8pt;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Gateway Inventory Report</h1>
    <div class="timestamp">Generated: ${new Date().toLocaleString()}</div>
  </div>

  <div class="summary-box">
    <div class="summary-item">
      <div class="number">${data.length}</div>
      <div class="label">Total Ports</div>
    </div>
    <div class="summary-item">
      <div class="number" style="color: #28a745;">${activeCount}</div>
      <div class="label">Active</div>
    </div>
    <div class="summary-item">
      <div class="number" style="color: #ffc107;">${weakCount}</div>
      <div class="label">Weak Signal</div>
    </div>
    <div class="summary-item">
      <div class="number" style="color: #dc3545;">${inactiveCount}</div>
      <div class="label">Inactive</div>
    </div>
  </div>

  ${errors.length > 0 ? `
  <div class="error-box">
    <h3>⚠️ Errors Encountered During Scraping</h3>
    <ul>
      ${errors.map(err => `<li>❌ ${err}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="legend">
    <h3>Legend</h3>
    <div class="legend-item"><span class="status status-active">Active</span> Port has MDN, ICCID, and IMEI</div>
    <div class="legend-item"><span class="status status-weak">Weak Signal</span> Port has IMEI/ICCID but no MDN</div>
    <div class="legend-item"><span class="status status-inactive">Inactive</span> Port is missing data or not responding</div>
  </div>

  ${Object.keys(groupedData).sort().map(gateway => {
    const ports = groupedData[gateway];
    const gwActive = ports.filter(p => p.status === 'active').length;
    const gwWeak = ports.filter(p => p.status === 'weak-signal').length;
    const gwInactive = ports.filter(p => p.status === 'inactive').length;
    
    return `
    <div class="gateway-section">
      <div class="gateway-header">Gateway ${gateway}</div>
      <div class="gateway-stats">
        Active: ${gwActive} | Weak Signal: ${gwWeak} | Inactive: ${gwInactive}
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 10%;">Port</th>
            <th style="width: 15%;">Status</th>
            <th style="width: 15%;">MDN</th>
            <th style="width: 28%;">ICCID</th>
            <th style="width: 20%;">IMEI</th>
          </tr>
        </thead>
        <tbody>
          ${ports.map(port => {
            const statusClass = port.status === 'active' ? 'status-active' : 
                               port.status === 'weak-signal' ? 'status-weak' : 'status-inactive';
            const statusText = port.status === 'active' ? 'Active' : 
                              port.status === 'weak-signal' ? 'Weak Signal' : 'Inactive';
            
            return `
            <tr>
              <td>${port.port}</td>
              <td><span class="status ${statusClass}">${statusText}</span></td>
              <td>${port.mdn || 'N/A'}</td>
              <td>${port.iccid || 'N/A'}</td>
              <td>${port.imei || 'N/A'}</td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    `;
  }).join('')}

  <div class="footer">
    Gateway Inventory Report | AutoM8 Automation System
  </div>
</body>
</html>
  `;

  // Create a temporary HTML file
  const tempHtmlPath = path.join(outputPath, `temp_report_${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, html, 'utf8');

  // Launch browser and generate PDF
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle' });
  
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: {
      top: '15mm',
      right: '15mm',
      bottom: '15mm',
      left: '15mm'
    }
  });

  await browser.close();

  // Clean up temp HTML file
  try {
    fs.unlinkSync(tempHtmlPath);
  } catch (e) {
    console.warn('Could not delete temp HTML file:', (e as Error).message);
  }

  return pdfPath;
}