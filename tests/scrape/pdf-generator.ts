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

  // Calculate Global Stats
  const activeCount = data.filter(p => p.status === 'active').length;
  const weakCount = data.filter(p => p.status === 'weak-signal').length;
  const inactiveCount = data.filter(p => p.status === 'inactive').length;
  const errorCount = data.filter(p => p.status === 'error').length;

  // Generate HTML for PDF
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 8pt;
      line-height: 1.3;
      color: #333;
    }
    
    .header {
      text-align: center;
      padding: 10px 0;
      border-bottom: 2px solid #0066cc;
      margin-bottom: 15px;
    }
    
    .header h1 {
      font-size: 18pt;
      color: #0066cc;
      margin-bottom: 5px;
    }
    
    /* Global Summary */
    .global-summary {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 5px;
      padding: 10px;
      margin-bottom: 20px;
    }
    
    .summary-title {
      font-weight: bold;
      font-size: 10pt;
      margin-bottom: 8px;
      text-align: center;
      color: #333;
    }

    .summary-flex {
      display: flex;
      justify-content: space-around;
    }
    
    .summary-item {
      text-align: center;
    }
    
    .summary-item .number {
      font-size: 14pt;
      font-weight: bold;
      color: #0066cc;
    }
    
    .summary-item .label {
      font-size: 8pt;
      color: #666;
    }
    
    .gateway-section {
      margin-bottom: 15px;
      page-break-inside: avoid;
      border: 1px solid #ccc;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .gateway-header {
      background: #0066cc;
      color: white;
      padding: 5px 10px;
      font-size: 10pt;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .gateway-sub-report {
      background: #e9ecef;
      padding: 4px 10px;
      font-size: 7.5pt;
      border-bottom: 1px solid #ccc;
      display: flex;
      gap: 15px;
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
      border-bottom: 1px solid #dee2e6;
      font-size: 7pt;
    }
    
    td {
      padding: 4px 5px;
      border-bottom: 1px solid #dee2e6;
      font-size: 7pt;
      vertical-align: middle;
    }
    
    tr:nth-child(even) {
      background: #fdfdfd;
    }
    
    /* Status Badges */
    .status-badge {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 3px;
      font-weight: bold;
      font-size: 6.5pt;
      text-align: center;
      min-width: 60px;
    }
    
    .status-active { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .status-weak { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
    .status-inactive { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .status-error { background: #e2e3e5; color: #383d41; border: 1px solid #d6d8db; }
    
    /* Carrier Styles */
    .carrier-att { color: #0057b8; font-weight: bold; }
    .carrier-tmo { color: #ea0a8e; font-weight: bold; }
    .carrier-verizon { color: #cd040b; font-weight: bold; }
    
    /* Data Status Colors */
    .data-missing { color: #dc3545; font-weight: bold; }
    .data-ok { color: #333; }
    
    /* Simple Dots for Status */
    .dot {
      height: 10px;
      width: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-green { background-color: #28a745; } /* Green */
    .dot-red { background-color: #dc3545; }   /* Red */

    .legend {
      margin-top: 10px;
      font-size: 8pt;
      background: #f8f9fa;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid #ddd;
    }
    
    .legend-item {
      margin-right: 15px;
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Gateway Inventory Report</h1>
    <div>Generated: ${new Date().toLocaleString()}</div>
  </div>

  <div class="global-summary">
    <div class="summary-title">GLOBAL SUMMARY (All 10 Gateways)</div>
    <div class="summary-flex">
      <div class="summary-item">
        <div class="number">${data.length}</div>
        <div class="label">Total Ports</div>
      </div>
      <div class="summary-item">
        <div class="number" style="color: #28a745;">${activeCount}</div>
        <div class="label">Active (Green + Data)</div>
      </div>
      <div class="summary-item">
        <div class="number" style="color: #ffc107;">${weakCount}</div>
        <div class="label">Weak Signal</div>
      </div>
      <div class="summary-item">
        <div class="number" style="color: #dc3545;">${inactiveCount}</div>
        <div class="label">Inactive (Red Dot)</div>
      </div>
      <div class="summary-item">
        <div class="number" style="color: #6c757d;">${errorCount}</div>
        <div class="label">Errors / Missing Data</div>
      </div>
    </div>
  </div>

  ${errors.length > 0 ? `
  <div style="background:#fff3cd; border:1px solid #ffc107; padding:10px; margin-bottom:15px; border-radius:4px;">
    <h3 style="margin:0 0 5px 0; font-size:9pt; color:#856404;">⚠️ Scraper Errors</h3>
    <ul style="margin:0; padding-left:20px; font-size:8pt;">
      ${errors.map(err => `<li>${err}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${Object.keys(groupedData).sort().map(gateway => {
    const ports = groupedData[gateway];
    const gwActive = ports.filter(p => p.status === 'active').length;
    const gwWeak = ports.filter(p => p.status === 'weak-signal').length;
    const gwInactive = ports.filter(p => p.status === 'inactive').length;
    const gwError = ports.filter(p => p.status === 'error').length;
    
    return `
    <div class="gateway-section">
      <div class="gateway-header">
        <span>Gateway ${gateway}</span>
        <span style="font-weight:normal; font-size:8pt;">${ports.length} Ports</span>
      </div>
      <div class="gateway-sub-report">
        <span><strong>Active:</strong> ${gwActive}</span>
        <span><strong>Weak Signal:</strong> ${gwWeak}</span>
        <span><strong>Inactive:</strong> ${gwInactive}</span>
        <span><strong>Errors:</strong> ${gwError}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 6%;">Port</th>
            <th style="width: 10%;">Port Status</th>
            <th style="width: 8%;">Carrier</th>
            <th style="width: 14%;">MDN</th>
            <th style="width: 5%;">MDN Status</th>
            <th style="width: 20%;">ICCID</th>
            <th style="width: 5%;">ICCID Status</th>
            <th style="width: 15%;">IMEI</th>
            <th style="width: 5%;">IMEI Status</th>
            <th style="width: 12%;">Missing</th>
          </tr>
        </thead>
        <tbody>
          ${ports.map(port => {
            // Status Logic for Badge
            let statusClass = 'status-error';
            let statusText = 'ERROR';
            
            if (port.status === 'active') {
              statusClass = 'status-active';
              statusText = 'ACTIVE';
            } else if (port.status === 'weak-signal') {
              statusClass = 'status-weak';
              statusText = 'WEAK';
            } else if (port.status === 'inactive') {
              statusClass = 'status-inactive';
              statusText = 'INACTIVE';
            }

            // Carrier Color
            let carrierClass = '';
            if (port.carrier === 'AT&T') carrierClass = 'carrier-att';
            else if (port.carrier === 'T-Mobile') carrierClass = 'carrier-tmo';
            else if (port.carrier === 'Verizon') carrierClass = 'carrier-verizon';
            
            // Individual Data Status Dots
            const mdnStatusDot = port.mdn ? '<span class="dot dot-green"></span>' : '<span class="dot dot-red"></span>';
            const iccidStatusDot = port.iccid ? '<span class="dot dot-green"></span>' : '<span class="dot dot-red"></span>';
            const imeiStatusDot = port.imei ? '<span class="dot dot-green"></span>' : '<span class="dot dot-red"></span>';
            
            // Data Display
            const mdnDisplay = port.mdn ? `<span class="data-ok">${port.mdn}</span>` : `<span class="data-missing">MISSING</span>`;
            const iccidDisplay = port.iccid ? `<span class="data-ok">${port.iccid}</span>` : `<span class="data-missing">MISSING</span>`;
            const imeiDisplay = port.imei ? `<span class="data-ok">${port.imei}</span>` : `<span class="data-missing">MISSING</span>`;
            
            const missingNotes = port.missingData.length > 0 ? 
              `<span class="data-missing">${port.missingData.join(', ')}</span>` : '';
            
            return `
            <tr>
              <td>${port.port}</td>
              <td><span class="status-badge ${statusClass}">${statusText}</span></td>
              <td class="${carrierClass}">${port.carrier}</td>
              <td>${mdnDisplay}</td>
              <td style="text-align:center;">${mdnStatusDot}</td>
              <td>${iccidDisplay}</td>
              <td style="text-align:center;">${iccidStatusDot}</td>
              <td>${imeiDisplay}</td>
              <td style="text-align:center;">${imeiStatusDot}</td>
              <td>${missingNotes}</td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    `;
  }).join('')}

  <div class="legend">
    <strong>Legend:</strong>
    <span class="legend-item"><span style="color:#28a745">■</span> <strong>Active</strong> (Online Green Dot + All Data)</span>
    <span class="legend-item"><span style="color:#28a745">●</span> <strong>Weak</strong> (Green Circle)</span>
    <span class="legend-item"><span style="color:#dc3545">■</span> <strong>Inactive</strong> (Red Dot)</span>
    <span class="legend-item"><span style="color:#dc3545">!</span> <strong>Error</strong> (Red Exclamation OR Green Dot but missing data)</span>
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
    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
  });

  await browser.close();

  // Clean up
  try { fs.unlinkSync(tempHtmlPath); } catch (e) {}

  return pdfPath;
}