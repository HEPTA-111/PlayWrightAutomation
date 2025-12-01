const fs = require('fs');
const path = require('path');

async function generateEnhancedIQPDF(data, errors, outputPath) {
  const { chromium } = require('playwright');
  
  const now = new Date();
  const datePart = now.toISOString().split('T')[0];
  const timePart = now.toISOString().split('T')[1].replace(/[:.]/g, '').substring(0, 6);
  const pdfPath = path.join(outputPath, `IQ_Report_GW_${datePart}_${timePart}.pdf`);

  // --- 1. CALCULATE STATISTICS ---
  const stats = {
    totalLines: data.length,
    carriers: { 'Verizon': 0, 'T-Mobile': 0, 'AT&T': 0, 'Other': 0 },
    // Simplified main status buckets
    status: { 'Active': 0, 'Deactivated': 0, 'Suspended': 0, 'Error': 0 },
    // Detailed sub-status breakdown (The "Cool" Insight)
    subStatus: {},
    simTypes: { 'Physical': 0, 'eSIM': 0 },
    plans: {}
  };

  data.forEach(line => {
    // 1. Carrier Counts
    const carr = line.carrier || 'Other';
    if (stats.carriers[carr] !== undefined) stats.carriers[carr]++;
    else stats.carriers['Other']++;

    // 2. Status Logic (FIXED)
    const st = (line.iqStatus || 'N/A').toUpperCase();
    
    // Check "ACTIVATED" or "ACTIVE" specifically
    if (st === 'ACTIVE' || st === 'ACTIVATED') {
      stats.status['Active']++;
    } 
    else if (st.includes('DEACTIVATED') || st.includes('CANCEL')) {
      stats.status['Deactivated']++;
    }
    else if (st.includes('SUSPEND') || st.includes('BLOCK')) {
      stats.status['Suspended']++;
    }
    else {
      stats.status['Error']++;
    }

    // 3. Sub-Status Insights (New Feature)
    const subSt = (line.subscriptionStatus || 'Unknown').replace(/_/g, ' ');
    if (subSt !== 'Unknown' && subSt !== 'N/A') {
      stats.subStatus[subSt] = (stats.subStatus[subSt] || 0) + 1;
    }

    // 4. SIM Type
    const sim = (line.simType || 'Physical').toUpperCase();
    if (sim.includes('PHYSICAL')) stats.simTypes['Physical']++;
    else if (sim.includes('ESIM')) stats.simTypes['eSIM']++;

    // 5. Plan Distribution
    const plan = line.planId || 'Unknown';
    if(plan !== 'N/A' && plan !== 'Unknown') {
        stats.plans[plan] = (stats.plans[plan] || 0) + 1;
    }
  });

  // Get top 3 sub-statuses for the dashboard
  const topSubStatus = Object.entries(stats.subStatus)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);

  // Group detailed data by gateway
  const byGateway = {};
  data.forEach(line => {
    const gw = line.gateway || (line.port ? line.port.split('-')[0] : 'Unknown');
    if (!byGateway[gw]) byGateway[gw] = [];
    byGateway[gw].push(line);
  });

  // --- 2. GENERATE HTML ---
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
      font-size: 8pt; 
      color: #333; 
      margin: 0; 
      padding: 0; 
      background: #fff; 
    }
    
    /* Header Section */
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #0066cc;
    }
    .main-title {
      font-size: 18pt;
      font-weight: 700;
      color: #0066cc;
      margin: 0;
    }
    .sub-title {
      font-size: 9pt;
      color: #666;
      margin-top: 2px;
    }
    .report-meta {
      text-align: right;
      font-size: 8pt;
      color: #555;
    }

    /* Analytics Dashboard Grid */
    .dashboard {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    
    .card {
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 12px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    .card h3 {
      margin: 0 0 10px 0;
      font-size: 10pt;
      color: #0066cc;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 8.5pt;
    }
    .stat-label { color: #555; }
    .stat-value { font-weight: bold; color: #222; }

    /* Custom Colors for Stats */
    .val-active { color: #28a745; }
    .val-inactive { color: #dc3545; }
    .val-warn { color: #fd7e14; }
    .val-att { color: #0057b8; }
    .val-tmo { color: #ea0a8e; }
    .val-vzw { color: #cd040b; }

    /* Detailed Table Styles */
    .gateway-section {
      margin-top: 25px;
      break-inside: avoid;
      border: 1px solid #ccc;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    }
    
    .gw-header {
      background: #0066cc;
      color: white;
      padding: 8px 12px;
      font-weight: bold;
      font-size: 10pt;
      display: flex;
      justify-content: space-between;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed; /* Ensures columns respect widths */
    }
    
    th {
      background: #e9ecef;
      padding: 6px;
      text-align: left;
      font-weight: bold;
      font-size: 7.5pt;
      border-bottom: 2px solid #ccc;
      color: #444;
    }
    
    td {
      padding: 5px 6px;
      border-bottom: 1px solid #eee;
      font-size: 7pt;
      vertical-align: middle;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    tr:nth-child(even) { background: #fcfcfc; }
    
    /* Status Badges */
    .badge {
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 6.5pt;
      font-weight: bold;
      text-transform: uppercase;
      display: inline-block;
      min-width: 60px;
      text-align: center;
    }
    .bg-active { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .bg-inactive { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .bg-warn { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
    .bg-neutral { background: #e2e3e5; color: #383d41; border: 1px solid #d6d8db; }

    /* Column Width Configuration */
    .col-port { width: 6%; }
    .col-mdn { width: 9%; }
    .col-status { width: 10%; }
    .col-sub { width: 12%; } /* Important Feature: Sub Status */
    .col-acct { width: 10%; }
    .col-plan { width: 12%; }
    .col-sim { width: 6%; }
    .col-iccid { width: 15%; }
    .col-carrier { width: 8%; }
    .col-dealer { width: 8%; }

  </style>
</head>
<body>

  <div class="header-container">
    <div>
      <h1 class="main-title">PrepaidIQ Inventory Report</h1>
      <div class="sub-title">Automated Gateway & Line Analysis</div>
    </div>
    <div class="report-meta">
      <strong>Generated:</strong> ${new Date().toLocaleString()}<br>
      <strong>Total Lines Scanned:</strong> ${stats.totalLines}
    </div>
  </div>

  <div class="dashboard">
    
    <div class="card">
      <h3>📡 Carrier Mix</h3>
      <div class="stat-row">
        <span class="stat-label">Verizon</span>
        <span class="stat-value val-vzw">${stats.carriers['Verizon']}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">T-Mobile</span>
        <span class="stat-value val-tmo">${stats.carriers['T-Mobile']}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">AT&T</span>
        <span class="stat-value val-att">${stats.carriers['AT&T']}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Other/Unknown</span>
        <span class="stat-value">${stats.carriers['Other']}</span>
      </div>
    </div>

    <div class="card">
      <h3>❤️ Line Health</h3>
      <div class="stat-row">
        <span class="stat-label">Active (Activated)</span>
        <span class="stat-value val-active" style="font-size:11pt;">${stats.status['Active']}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Deactivated</span>
        <span class="stat-value val-inactive">${stats.status['Deactivated']}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Suspended</span>
        <span class="stat-value val-warn">${stats.status['Suspended']}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Not Found / Error</span>
        <span class="stat-value">${stats.status['Error']}</span>
      </div>
    </div>

    <div class="card">
      <h3>🔍 Subscription Detail</h3>
      ${topSubStatus.length > 0 ? topSubStatus.map(([k, v]) => `
        <div class="stat-row">
          <span class="stat-label" style="font-size:7.5pt; text-transform:capitalize;">${k.toLowerCase()}</span>
          <span class="stat-value">${v}</span>
        </div>
      `).join('') : '<div class="stat-row">No detail available</div>'}
      <div style="margin-top:5px; border-top:1px dashed #ccc;"></div>
      <div class="stat-row" style="margin-top:5px;">
        <span class="stat-label">eSIMs</span>
        <span class="stat-value">${stats.simTypes['eSIM']}</span>
      </div>
    </div>

    <div class="card">
      <h3>📋 Plan Distribution</h3>
      <div style="max-height: 65px; overflow: hidden;">
        ${Object.keys(stats.plans).length > 0 ? Object.entries(stats.plans)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 3)
          .map(([plan, count]) => `
            <div class="stat-row">
              <span class="stat-label" title="${plan}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%;">${plan}</span>
              <span class="stat-value">${count}</span>
            </div>
          `).join('') : '<div style="color:#999; font-style:italic;">No plan data</div>'}
      </div>
    </div>

  </div>

  ${Object.keys(byGateway).sort().map(gw => `
    <div class="gateway-section">
      <div class="gw-header">
        <span>Gateway ${gw}</span>
        <span style="font-weight:normal; opacity:0.9;">${byGateway[gw].length} Lines</span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="col-port">Port</th>
            <th class="col-mdn">MDN</th>
            <th class="col-status">Status</th>
            <th class="col-sub">Sub Status</th>
            <th class="col-acct">Account #</th>
            <th class="col-plan">Plan ID</th>
            <th class="col-sim">SIM</th>
            <th class="col-iccid">ICCID</th>
            <th class="col-carrier">Carrier</th>
            <th class="col-dealer">Dealer</th>
          </tr>
        </thead>
        <tbody>
          ${byGateway[gw].map(l => {
             // Logic to determine visual badge
             let statusClass = 'bg-neutral';
             const stUpper = (l.iqStatus || '').toUpperCase();
             
             // VISUAL LOGIC: Map "ACTIVATED" to Green
             if(stUpper === 'ACTIVE' || stUpper === 'ACTIVATED') statusClass = 'bg-active';
             else if(stUpper.includes('DEACTIVATED') || stUpper.includes('CANCEL')) statusClass = 'bg-inactive';
             else if(stUpper.includes('SUSPEND') || stUpper.includes('BLOCK')) statusClass = 'bg-warn';

             return `
             <tr>
               <td><strong>${l.port || ''}</strong></td>
               <td>${l.mdn || ''}</td>
               <td><span class="badge ${statusClass}">${l.iqStatus || 'N/A'}</span></td>
               <td style="font-size:6.5pt; color:#666;">${(l.subscriptionStatus || '-').replace(/_/g, ' ')}</td>
               <td>${l.accountNumber || '-'}</td>
               <td title="${l.planId}">${(l.planId || '-').substring(0, 18)}</td>
               <td>${l.simType || '-'}</td>
               <td style="font-family:monospace;">${l.iccid || '-'}</td>
               <td>${l.carrier || '-'}</td>
               <td>${l.dealer || '-'}</td>
             </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `).join('')}

  <div style="margin-top:30px; text-align:center; color:#999; font-size:7pt;">
    End of Report | AutoM8 System
  </div>

</body>
</html>
  `;

  const tempHtmlPath = path.join(outputPath, `temp_iq_dashboard.html`);
  fs.writeFileSync(tempHtmlPath, html, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle' });
  
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' }
  });

  await browser.close();
  try { fs.unlinkSync(tempHtmlPath); } catch(e){}

  return pdfPath;
}

async function main() {
  const outputPath = process.env.OUTPUT_PATH || path.resolve(process.cwd());
  const today = new Date().toISOString().split('T')[0];
  const jsonPath = path.join(outputPath, `IQ_Enhanced_${today}.json`);

  if (!fs.existsSync(jsonPath)) {
    console.error('JSON not found:', jsonPath);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Generating Enhanced Dashboard PDF for ${payload.data.length} lines...`);
  
  try {
    const pdf = await generateEnhancedIQPDF(payload.data, payload.errors, outputPath);
    console.log('✅ Dashboard PDF Generated:', pdf);
  } catch(e) {
    console.error('PDF Error:', e);
    process.exit(1);
  }
}

main();