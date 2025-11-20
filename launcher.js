const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { spawn } = require('child_process');

// --- BEGIN FIX: SET BROWSER PATH FOR LAUNCHER ---
// This ensures the launcher's *own* chromium.launch() call (for the UI)
// finds the browsers bundled inside the 'my-browsers' folder.
const myBrowsersPath = path.join(process.cwd(), 'my-browsers');
if (fs.existsSync(myBrowsersPath)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = myBrowsersPath;
  console.log('[LAUNCHER] Set own browser path to:', myBrowsersPath);
} else {
  console.warn('[LAUNCHER] WARN: Bundled "my-browsers" folder not found!');
}
// --- END FIX ---

// --- Determine where to save output files ---
const outputPath = process.env.OUTPUT_PATH || process.cwd();
// ---

(async () => {
  // --------- CONFIG: gateway -> test index (editable) ----------
  // This map is for ACTIVATION only. Reload logic is now separate.
  const gatewayToTestMap = {
    '101': 3,
    '102': 2,
    '103': 1,
    '104': 4,
    '105': 5,
    '106': 6,
    '107': 7,
    '108': 8,
    '109': 9,
    '110': 10
  };
  // -------------------------------------------------------------

  function log(...args) {
    const msg = ['[LAUNCHER]', ...args].join(' ');
    console.log(msg);
  }

  function errlog(...args) {
    const msg = ['[LAUNCHER ERROR]', ...args].join(' ');
    console.error(msg);
  }

  // Diagnostic helper to list a directory
  function listFolder(folder, limit = 50) {
    try {
      if (!fs.existsSync(folder)) return `${folder} (NOT FOUND)`;
      const entries = fs.readdirSync(folder).slice(0, limit);
      return `${folder} => [${entries.join(', ')}]`;
    } catch (e) {
      return `ERROR listing ${folder}: ${e.message}`;
    }
  }

  // Verify critical paths and log diagnostics
  function verifyEnvironment() {
    log('=== ENVIRONMENT CHECK ===');
    log('Working directory:', process.cwd());
    log('Node version:', process.version);
    log('Platform:', process.platform);

    const critical = [
      'node_modules',
      'tests',
      'my-browsers',
      'portable-node'
    ];

    critical.forEach(dir => {
      const fullPath = path.join(process.cwd(), dir);
      const exists = fs.existsSync(fullPath);
      log(`${exists ? '✓' : '✗'} ${dir}: ${exists ? 'EXISTS' : 'MISSING'}`);
    });

    log('Root contents:', listFolder(process.cwd(), 100));
    log('=========================');
  }

  verifyEnvironment();

  // Launch headed Playwright browser for the UI
  let browser;
  try {
    log('Launching Playwright browser for GUI...');
    browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    });
    log('✓ Browser launched successfully');
  } catch (e) {
    errlog('Failed to launch Playwright browser:', e.message);
    errlog('Stack:', e.stack);
    process.exit(1);
  }

  // --- MODIFIED: Wider viewport for new UI ---
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1024, height: 768 });

  let resolveSelection, rejectSelection;
  const selectionPromise = new Promise((resolve, reject) => {
    resolveSelection = resolve;
    rejectSelection = reject;
  });

  try {
    // --- Main process selection ---
    await page.exposeFunction('onSelection', (selection) => {
      log('Selection received from UI:', JSON.stringify(selection, null, 2));
      resolveSelection(selection);
    });

    // --- ADDED: Email save function ---
    await page.exposeFunction('saveEmails', async (emails) => {
      const emailPath = path.join(process.cwd(), 'emails.json');
      try {
        const validEmails = emails
          .filter(e => typeof e === 'string' && e.includes('@'))
          .slice(0, 100); // Enforce 100 email limit
        fs.writeFileSync(emailPath, JSON.stringify(validEmails, null, 2), 'utf8');
        log(`✓ Saved ${validEmails.length} emails to emails.json`);
        return { success: true, count: validEmails.length, emails: validEmails };
      } catch (e) {
        errlog('Failed to save emails:', e.message);
        return { success: false, error: e.message };
      }
    });

    // --- UPDATED: Run Power Cycle function ---
    await page.exposeFunction('runReloadPorts', (gateway, ports) => {
      return new Promise((resolve) => {

        // --- THIS IS THE NEW MAPPING LOGIC ---
        const gatewayNum = parseInt(gateway, 10);
        if (isNaN(gatewayNum) || gatewayNum < 101 || gatewayNum > 110) {
          errlog(`Invalid gateway number: ${gateway}`);
          return resolve({ success: false, error: `Invalid gateway number: ${gateway}` });
        }
        // 101 -> 1, 102 -> 2, ... 110 -> 10
        const testIndex = gatewayNum - 100;
        // --- END NEW MAPPING LOGIC ---

        const specFileName = `runports${testIndex}.spec.ts`;
        const specPath = path.join(process.cwd(), 'tests', 'reload_ports', specFileName);

        if (!fs.existsSync(specPath)) {
          errlog('TEST FILE NOT FOUND:', specPath);
          return resolve({ success: false, error: `Test file not found: ${specPath}` });
        }

        const relSpec = path.relative(process.cwd(), specPath).split(path.sep).join('/');
        const cmd = `npx playwright test "${relSpec}" --headed --project=chromium --workers=1`;

        const env = Object.assign({}, process.env);
        env.RELOAD_PORTS = ports || ''; // Pass ports as env var
        log('✓ RELOAD_PORTS set to:', env.RELOAD_PORTS);

        // This env var should already be set, but we set it again for the child
        env.PLAYWRIGHT_BROWSERS_PATH = myBrowsersPath;

        log('=== LAUNCHING RELOAD SCRIPT ===');
        log('Command:', cmd);

        const child = spawn(cmd, { shell: true, stdio: 'inherit', env, cwd: process.cwd() });

        child.on('exit', (code) => {
          log('=== RELOAD SCRIPT COMPLETED ===');
          log('Exit code:', code);
          resolve({ success: code === 0, code: code });
        });

        child.on('error', (e) => {
          errlog('=== RELOAD SPAWN ERROR ===');
          errlog('Failed to start script:', e.message);
          resolve({ success: false, error: e.message });
        });
      });
    });

    // --- ADDED: Run Gateway Scrape function ---
    await page.exposeFunction('runGatewayScrape', () => {
      return new Promise((resolve) => {
        const specPath = path.join(process.cwd(), 'tests', 'scrape', 'gateway-scraper.spec.ts');

        if (!fs.existsSync(specPath)) {
          errlog('SCRAPE TEST FILE NOT FOUND:', specPath);
          return resolve({ success: false, error: `Test file not found: ${specPath}` });
        }

        const relSpec = path.relative(process.cwd(), specPath).split(path.sep).join('/');
        const cmd = `npx playwright test "${relSpec}" --headed --project=chromium --workers=1`;

        const env = Object.assign({}, process.env);
        env.PLAYWRIGHT_BROWSERS_PATH = myBrowsersPath;

        // Pass output path to the scraper
        env.OUTPUT_PATH = outputPath;

        log('=== LAUNCHING GATEWAY SCRAPER ===');
        log('Command:', cmd);

        const child = spawn(cmd, { shell: true, stdio: 'inherit', env, cwd: process.cwd() });

        child.on('exit', (code) => {
          log('=== GATEWAY SCRAPER COMPLETED ===');
          log('Exit code:', code);
          resolve({ success: code === 0, code: code });
        });

        child.on('error', (e) => {
          errlog('=== SCRAPER SPAWN ERROR ===');
          errlog('Failed to start scraper:', e.message);
          resolve({ success: false, error: e.message });
        });
      });
    });

  } catch (e) {
    errlog('Failed to expose function(s):', e.message);
    try { await browser.close(); } catch (_) { }
    process.exit(1);
  }

  page.on('close', () => {
    rejectSelection(new Error('UI page closed before selection was made'));
  });

  browser.on('disconnected', () => {
    rejectSelection(new Error('Browser disconnected before selection'));
  });

  const makeGatewayHtml = () =>
    Array.from({ length: 10 }, (_, i) => 101 + i)
      .map(g => `<div class="gateway" data-gateway="${g}">Gateway ${g}</div>`).join('');

  // --- MODIFIED: Complete UI Overhaul ---
  const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AutoM8 Launcher</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root {
      --bg: #f5f7fb;
      --card: #ffffff;
      --muted: #6b7280;
      --accent: #0b63ff;
      --accent-light: #eef2ff;
      --border: #e5e7eb;
      --radius-lg: 12px;
      --radius-md: 8px;
      --shadow: 0 10px 30px rgba(20,25,40,0.08);
      --shadow-sm: 0 4px 12px rgba(20,25,40,0.04);
    }
    html,body {
      height: 100%; margin: 0;
      font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial;
      background: var(--bg);
      color: #111827;
      line-height: 1.5;
    }
    .wrap { max-width: 960px; margin: 28px auto; padding: 28px; }
    .card {
      background: var(--card);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      padding: 24px;
    }
    header {
      display: flex; align-items: center; gap: 14px;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    header h1 { margin: 0; font-size: 20px; }
    .subtitle { color: var(--muted); font-size: 14px; margin-top: 4px; }
    .step { margin-top: 16px; }
    .step-header { font-weight: 700; font-size: 16px; margin-bottom: 12px; }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-top: 12px;
    }
    .option {
      background: #fdfdff;
      border-radius: var(--radius-md);
      padding: 16px;
      display: flex;
      gap: 12px;
      align-items: center;
      cursor: pointer;
      border: 1px solid var(--border);
      transition: all .15s ease;
    }
    .option:hover {
      transform: translateY(-3px);
      box-shadow: var(--shadow-sm);
      border-color: var(--accent);
    }
    .option.selected {
      border-color: var(--accent);
      background: var(--accent-light);
      box-shadow: none;
    }
    .option.disabled {
      background: #f9fafb;
      cursor: not-allowed;
      opacity: 0.6;
    }
    .option.disabled:hover { transform: none; box-shadow: none; border-color: var(--border); }
    
    .swatch {
      width: 24px; height: 24px;
      border-radius: var(--radius-md);
      flex: 0 0 24px;
      display: grid;
      place-items: center;
      color: white;
      font-size: 12px;
      font-weight: 600;
    }
    .swatch.att { background: #007bff; }
    .swatch.tmobile { background: #e20074; }
    .swatch.spectrum { background: #003399; }
    .swatch.mobilex { background: #16a34a; }
    .swatch.reload { background: #fd7e14; }
    .swatch.unassigned { background: #6c757d; }

    .label { font-weight: 600; font-size: 15px; }
    .muted { color: var(--muted); font-size: 13px; }
    
    .controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 24px;
      gap: 8px;
    }
    .btn {
      padding: 10px 16px;
      border-radius: var(--radius-md);
      border: 1px solid transparent;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all .15s ease;
    }
    .btn.ghost {
      background: transparent;
      color: var(--muted);
      border-color: var(--border);
    }
    .btn.ghost:hover { background: #f9fafb; color: #111827; }
    .btn.primary {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }
    .btn.primary:hover { filter: brightness(1.1); }
    .btn.danger {
      background: #fee2e2;
      color: #b91c1c;
      border-color: #fee2e2;
    }
    .btn.danger:hover { background: #fecaca; }
    
    .hidden { display: none; }
    
    .gateway-box {
      display: flex; gap: 10px; flex-wrap: wrap;
      margin-top: 10px;
    }
    .gateway {
      padding: 8px 12px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      cursor: pointer;
      user-select: none;
      transition: all .15s ease;
    }
    .gateway:hover { border-color: #9ca3af; }
    .gateway.selected {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }
    
    .form-group { margin-top: 16px; }
    .form-label {
      font-weight: 600;
      font-size: 14px;
      display: block;
      margin-bottom: 8px;
    }
    input[type=number], input[type=text] {
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      box-sizing: border-box; /* Important for 100% width */
    }
    input[type=number] { width: 120px; }

    .summary {
      margin-top: 12px;
      padding: 16px;
      border-radius: var(--radius-md);
      background: var(--accent-light);
      font-size: 14px;
      border: 1px solid var(--border);
    }
    
    /* --- Email Manager Styles --- */
    .email-manager {
      margin-top: 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }
    .email-list {
      max-height: 200px;
      overflow-y: auto;
      padding: 8px;
    }
    .email-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-bottom: 1px solid #f3f4f6;
    }
    .email-row:last-child { border-bottom: none; }
    .email-text {
      flex: 1;
      font-family: monospace;
      font-size: 14px;
    }
    .email-text input {
      font-family: monospace;
      font-size: 14px;
      padding: 6px 8px;
    }
    .email-actions .btn {
      padding: 6px 10px;
      font-size: 12px;
    }
    .email-add {
      padding: 12px;
      border-top: 1px solid var(--border);
      background: #f9fafb;
      display: flex;
      gap: 8px;
    }
    .email-add input { flex: 1; }
    .email-status {
      padding: 8px 12px;
      font-size: 12px;
      color: var(--muted);
    }
    /* --- End Email Styles --- */

    /* --- Toast Notification --- */
    .toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 20px;
      border-radius: var(--radius-md);
      background: #111827;
      color: white;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      z-index: 1000;
      opacity: 0;
      transition: all .3s ease;
      pointer-events: none;
    }
    .toast.show {
      opacity: 1;
      bottom: 30px;
    }

  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <header>
        <div>
          <h1>AutoM8</h1>
          <div class="subtitle">Configure your automation process</div>
        </div>
        <div style="margin-left:auto;">
          <button class="btn ghost" id="proc-refresh" title="Refresh the launcher">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
          </button>
        </div>
      </header>

      <!-- === STEP 1: CHOOSE PROCESS === -->
      <div id="step-process" class="step">
        <div class="step-header">Step 1 – Choose Process</div>
        <div class="grid">
          <div class="option" id="opt-activation" data-process="Activation">
            <span class="swatch att">+</span>
            <div>
              <div class="label">Activation</div>
              <div class="muted">New device activation</div>
            </div>
          </div>
          <div class="option" id="opt-refill" data-process="Refill">
            <span class="swatch mobilex">$</span>
            <div>
              <div class="label">Refill</div>
              <div class="muted">Top-up / Refill</div>
            </div>
          </div>
          <div class="option" id="opt-reload" data-process="Reload">
            <span class="swatch reload">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </span>
            <div>
              <div class="label">Power Cycle</div>
              <div class="muted">Run power Cycle</div>
            </div>
          </div>

          <div class="option" id="opt-scrape" data-process="Scrape">
            <span class="swatch" style="background: #17a2b8;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </span>
            <div>
              <div class="label"Gateway Scraper>Inventory</div>
              <div class="muted">Inventory all gateways</div>
            </div>
          </div>

          <div class="option disabled" id="opt-unassigned-1">
            <span class="swatch unassigned">?</span>
            <div>
              <div class="label">Unassigned 1</div>
              <div class="muted">Future process</div>
            </div>
          </div>
          <div class="option disabled" id="opt-unassigned-2">
            <span class="swatch unassigned">?</span>
            <div>
              <div class="label">Unassigned 2</div>
              <div class="muted">Future process</div>
            </div>
          </div>
        </div>
        <div class="controls">
          <div class="muted">Pick one to continue</div>
          <div>
            <button class="btn ghost" id="proc-reset">Reset</button>
            <button class="btn primary" id="to-next-step" disabled>Next →</button>
          </div>
        </div>
      </div>

      <!-- === STEP 2: CHOOSE PROVIDER === -->
      <div id="step-provider" class="step hidden">
        <div class="step-header">Step 2 – Choose Provider</div>
        <div class="grid">
          <div class="option provider" data-provider="AT&T"><span class="swatch att"></span><div><div class="label">AT&amp;T</div></div></div>
          <div class="option provider" data-provider="t-mobile"><span class="swatch tmobile"></span><div><div class="label">T-Mobile</div></div></div>
          <div class="option provider" data-provider="Spectrum"><span class="swatch spectrum"></span><div><div class="label">Spectrum</div></div></div>
          <div class="option provider" data-provider="MobileX"><span class="swatch mobilex"></span><div><div class="label">MobileX</div></div></div>
        </div>
        <div class="controls">
          <div class="muted">Provider choice may change next steps</div>
          <div>
            <button class="btn ghost" id="prov-back">← Back</button>
            <button class="btn primary" id="to-next">Next →</button>
          </div>
        </div>
      </div>
      
      <!-- === STEP 3: MOBILEX OPTIONS === -->
      <div id="step-mobilex" class="step hidden">
        <div class="step-header">Step 3 – MobileX Options</div>
        
        <div class="form-group">
          <div class="form-label">Choose Gateway (101–110)</div>
          <div class="gateway-box" id="gateway-box">${makeGatewayHtml()}</div>
        </div>

        <div class="form-group">
          <div class="form-label">Starting Port (A1–A64)</div>
          <input id="start-port" type="number" min="1" max="64" value="1" />
        </div>

        <div class="form-group" id="link-type-section">
          <div class="form-label">Link Type</div>
          <div class="grid" style="grid-template-columns: 1fr 1fr;">
            <div class="option linktype" data-link="external"><div class="label">External</div></div>
            <div class="option linktype" data-link="internal"><div class="label">Internal</div></div>
          </div>
        </div>

        <!-- === ADDED: Email Management Section === -->
        <div class="form-group" id="email-section">
          <div class="form-label">Email Management</div>
          <div class="email-manager">
            <div class="email-list" id="email-list-container">
              <!-- Emails will be rendered here by JS -->
            </div>
            <div class="email-status" id="email-status-display">Loaded 0 emails.</div>
            <div class="email-add">
              <input type="text" id="email-add-input" placeholder="add.new@example.com" />
              <button class="btn primary" id="email-add-btn">Add</button>
            </div>
          </div>
        </div>
        
        <div class="form-group" id="email-strategy-section">
          <div class="form-label">Email Usage Strategy</div>
          <div class="grid" style="grid-template-columns: 1fr; gap: 10px;">
            <div class="option" id="strat-single">
              <label style="display:flex; align-items:center; width:100%; cursor:pointer;">
                <input type="radio" name="email-strategy" value="single" style="margin-right:12px;" checked>
                <div>
                  <div class="label">Use a Single Email</div>
                  <input id="email-single-input" type="text" value="rb@usa.com" style="width:250px; padding: 6px 8px; margin-top: 6px; font-size: 13px;" onclick="event.stopPropagation();">
                </div>
              </label>
            </div>
            <div class="option" id="strat-loop">
              <label style="display:flex; align-items:center; width:100%; cursor:pointer;">
                <input type="radio" name="email-strategy" value="loop" style="margin-right:12px;">
                <div>
                  <div class="label">Loop All Saved Emails</div>
                  <div class="muted" style="margin-top: 4px;">Uses email 1, 2, ... N, then repeats.</div>
                </div>
              </label>
            </div>
            <div class="option" id="strat-n-times">
              <label style="display:flex; align-items:center; width:100%; cursor:pointer;">
                <input type="radio" name="email-strategy" value="n-times" style="margin-right:12px;">
                <div>
                  <div class="label">Loop First 'N' Saved Emails</div>
                  <input id="email-n-input" type="number" value="1" min="1" max="100" style="width:80px; padding: 6px 8px; margin-top: 6px; font-size: 13px;" onclick="event.stopPropagation();">
                </div>
              </label>
            </div>
          </div>
        </div>
        <!-- === END Email Section === -->
        
        <div class="controls">
          <div class="muted">Review and finish</div>
          <div>
            <button class="btn ghost" id="mobilex-back">← Back</button>
            <button class="btn primary" id="mobilex-finish">Finish</button>
          </div>
        </div>
      </div>
      
      <!-- === STEP 4: RELOAD PORTS === -->
      <div id="step-reload" class="step hidden">
        <div class="step-header">Power Cycle</div>
        
        <div class="form-group">
          <div class="form-label">Choose Gateway (101–110)</div>
          <div class="gateway-box" id="reload-gateway-box">${makeGatewayHtml()}</div>
        </div>
        
        <div class="form-group">
          <div class="form-label">Ports to Reload (Optional)</div>
          <input id="reload-ports-input" type="text" placeholder="e.g., 1, 5, 10-15 (leave blank for all)" />
          <div class="muted" style="margin-top: 6px;">
            Leave blank to run for all 64 ports.
          </div>
        </div>
        
        <div class="controls">
          <div class="muted">Run the port reload script</div>
          <div>
            <button class="btn ghost" id="reload-back">← Back</button>
            <button class="btn primary" id="reload-run">Run Reload</button>
          </div>
        </div>
      </div>

      <!-- === STEP 5: CONFIRM & LAUNCH === -->
      <div id="step-confirm" class="step hidden">
        <div class="step-header">Confirm & Launch</div>
        <div class="summary" id="summary"></div>
        <div class="controls">
          <div class="muted">Review your configuration</div>
          <div>
            <button class="btn ghost" id="confirm-back">← Back</button>
            <button class="btn primary" id="confirm-launch">Launch</button>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- Toast Notification element -->
  <div id="toast" class="toast"></div>

  <script>
    const state = { 
      process:null, 
      provider:null, 
      gateway:null, 
      linkType:null, 
      startPortIndex:1,
      // --- ADDED state props ---
      emails: [], // This will be populated from emails.json
      emailStrategy: 'single',
      emailSingle: 'rb@usa.com',
      emailN: 1,
      reloadPorts: '' // For the reload script
    };

    function q(sel, all=false) { return all ? Array.from(document.querySelectorAll(sel)) : document.querySelector(sel); }
    function clearSelected(selector) { q(selector, true).forEach(e=>e.classList.remove('selected')); }

    // --- ADDED: Toast function ---
    let toastTimer;
    function toast(message, duration = 2000) {
      const el = q('#toast');
      if (!el) return;
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        el.classList.remove('show');
      }, duration);
    }
    
    // --- ADDED: Show/Hide Steps ---
    function showStep(stepId) {
      q('.step', true).forEach(s => s.classList.add('hidden'));
      q(stepId) && q(stepId).classList.remove('hidden');
    }

    // --- ADDED: Step 1 Next Button Logic ---
    const toNextStepBtn = q('#to-next-step');
    function updateStep1Next() {
        if (!state.process) {
          toNextStepBtn.disabled = true;
          return;
        }
        toNextStepBtn.disabled = false;
        if (state.process === 'Reload') {
          toNextStepBtn.textContent = 'Configure →';
        } else if (state.process === 'Scrape') {
          toNextStepBtn.textContent = 'Take Inventory →';
        } else {
          toNextStepBtn.textContent = 'Next →';
        }
      }

    // === STEP 1: Process Selection ===
    q('#opt-activation').addEventListener('click', ()=>{ 
      clearSelected('.option'); q('#opt-activation').classList.add('selected'); 
      state.process='Activation'; 
      updateStep1Next();
    });
    q('#opt-refill').addEventListener('click', ()=>{ 
      clearSelected('.option'); q('#opt-refill').classList.add('selected'); 
      state.process='Refill';
      updateStep1Next();
    });
    q('#opt-reload').addEventListener('click', ()=>{ 
      clearSelected('.option'); q('#opt-reload').classList.add('selected'); 
      state.process='Reload';
      updateStep1Next();
    });
    q('#opt-scrape').addEventListener('click', ()=>{ 
      clearSelected('.option'); q('#opt-scrape').classList.add('selected'); 
      state.process='Scrape';
      updateStep1Next();
    });

    q('#proc-reset').addEventListener('click', ()=>{ 
      state.process=null; 
      clearSelected('.option'); 
      updateStep1Next();
    });
    
    q('#proc-refresh').addEventListener('click', () => {
      window.location.reload();
    });
    
   q('#to-next-step').addEventListener('click', () => {
      if (!state.process) return;
      if (state.process === 'Reload') {
        showStep('#step-reload');
      } else if (state.process === 'Scrape') {
        // Run scrape immediately and close UI
        if (typeof window.onSelection === 'function') {
          const payload = { process: 'Scrape' };
          window.onSelection(payload);
        } else {
          alert('ERROR: Launcher bridge not available!');
        }
      } else {
        showStep('#step-provider');
      }
    });

    // === STEP 2: Provider Selection ===
    q('.provider', true).forEach(el=>{
      el.addEventListener('click', () => {
        clearSelected('.provider');
        el.classList.add('selected');
        state.provider = el.dataset.provider;
      });
    });
    q('#prov-back').addEventListener('click', ()=> { showStep('#step-process'); });

    q('#to-next').addEventListener('click', ()=> {
      if (!state.provider) { alert('Please choose a provider'); return; }
      
      if (state.provider === 'MobileX') {
        // Show/hide sections based on Activation/Refill
        const linkSection = q('#link-type-section');
        const emailSection = q('#email-section');
        const emailStrategySection = q('#email-strategy-section');
        
        if (state.process === 'Refill') {
          if (linkSection) linkSection.style.display = 'none';
          if (emailSection) emailSection.style.display = 'none';
          if (emailStrategySection) emailStrategySection.style.display = 'none';
          state.linkType = null;
          clearSelected('.linktype');
        } else {
          // Activation
          if (linkSection) linkSection.style.display = 'block';
          if (emailSection) emailSection.style.display = 'block';
          if (emailStrategySection) emailStrategySection.style.display = 'block';
        }
        showStep('#step-mobilex');
      } else {
        updateSummary();
        showStep('#step-confirm');
      }
    });

    // === STEP 3: MobileX Options ===
    q('#gateway-box').querySelectorAll('.gateway').forEach(g=>{
      g.addEventListener('click', () => {
        clearSelected('#gateway-box .gateway'); 
        g.classList.add('selected'); 
        state.gateway = g.dataset.gateway;
      });
    });

    q('.linktype', true).forEach(l=>{
      l.addEventListener('click', () => {
        clearSelected('.linktype'); 
        l.classList.add('selected'); 
        state.linkType = l.dataset.link;
      });
    });

    const startPortInput = q('#start-port');
    startPortInput.addEventListener('input', () => {
      let v = parseInt(startPortInput.value || '1', 10);
      if (isNaN(v)) v = 1;
      if (v < 1) v = 1;
      if (v > 64) v = 64;
      startPortInput.value = String(v);
      state.startPortIndex = v;
    });

    q('#mobilex-back').addEventListener('click', ()=> { showStep('#step-provider'); });

    q('#mobilex-finish').addEventListener('click', ()=> {
      if (!state.gateway) { alert('Please choose a gateway'); return; }
      if (state.process === 'Activation' && !state.linkType) { alert('Please choose a link type'); return; }
      
      state.startPortIndex = parseInt(startPortInput.value || '1', 10) || 1;
      
      // --- ADDED: Get Email Strategy State ---
      if (state.process === 'Activation') {
        state.emailStrategy = q('input[name="email-strategy"]:checked').value || 'single';
        state.emailSingle = q('#email-single-input').value || 'rb@usa.com';
        state.emailN = parseInt(q('#email-n-input').value, 10) || 1;
      }
      
      updateSummary();
      showStep('#step-confirm');
    });

    // === STEP 4: Power Cycle ===
    q('#reload-gateway-box').querySelectorAll('.gateway').forEach(g=>{
      g.addEventListener('click', () => {
        clearSelected('#reload-gateway-box .gateway'); 
        g.classList.add('selected'); 
        state.gateway = g.dataset.gateway; // Re-use state.gateway
      });
    });
    
    q('#reload-back').addEventListener('click', () => { showStep('#step-process'); });
    
    q('#reload-run').addEventListener('click', async () => {
      if (!state.gateway) { alert('Please choose a gateway to reload'); return; }
      
      state.reloadPorts = q('#reload-ports-input').value || '';
      const gateway = state.gateway;
      
      const btn = q('#reload-run');
      btn.disabled = true;
      btn.textContent = 'Reloading...';
      toast(\`Starting reload for Gateway \${gateway}...\`);

      if (typeof window.runReloadPorts === 'function') {
        const result = await window.runReloadPorts(gateway, state.reloadPorts);
        if (result.success) {
          toast(\`Gateway \${gateway} reload finished successfully.\`, 3000);
        } else {
          toast(\`Reload failed: \${result.error || 'Unknown error'}\`, 4000);
        }
      } else {
        alert('ERROR: runReloadPorts function not found!');
      }
      
      btn.disabled = false;
      btn.textContent = 'Run Reload';
      // Go back to step 1
      showStep('#step-process');
      state.gateway = null;
      clearSelected('#reload-gateway-box .gateway');
    });

    // === STEP 5: Confirmation ===
    function updateSummary() {
      const s = [];
      s.push('<strong>Process:</strong> ' + (state.process || '-'));
      s.push('<strong>Provider:</strong> ' + (state.provider || '-'));
      if (state.provider === 'MobileX') {
        s.push('<strong>Gateway:</strong> ' + (state.gateway || '-'));
        s.push('<strong>Start Port:</strong> A' + (state.startPortIndex || '-'));
        if (state.process === 'Activation') {
          s.push('<strong>Link:</strong> ' + (state.linkType || '-'));
          // --- ADDED: Email Summary ---
          s.push('<strong>Email Strategy:</strong> ' + (state.emailStrategy || '-'));
          if (state.emailStrategy === 'single') {
            s.push('<strong>Email:</strong> ' + (state.emailSingle || '-'));
          } else if (state.emailStrategy === 'n-times') {
            s.push('<strong>Email Count:</strong> Loop first ' + (state.emailN || '1'));
          } else if (state.emailStrategy === 'loop') {
            s.push('<strong>Email Count:</strong> Loop all saved (' + state.emails.length + ')');
          }
        } else {
          s.push('<strong>Link:</strong> N/A (Refill)');
        }
      }
      q('#summary').innerHTML = s.map(x => '<div style="margin-bottom:6px;">'+x+'</div>').join('');
    }

    q('#confirm-back').addEventListener('click', ()=> {
      if (state.provider === 'MobileX') showStep('#step-mobilex');
      else showStep('#step-provider');
    });

    q('#confirm-launch').addEventListener('click', ()=> {
      if (typeof window.onSelection === 'function') {
        const payload = Object.assign({}, state);
        delete payload.emails; // Don't send the full list, just the strategy
        window.onSelection(payload);
      } else {
        alert('ERROR: Launcher bridge not available!');
      }
    });
    
    // === ADDED: Email Manager Logic ===
    const emailListContainer = q('#email-list-container');
    const emailStatusDisplay = q('#email-status-display');
    const emailAddInput = q('#email-add-input');

    function renderEmailList() {
      if (!emailListContainer || !emailStatusDisplay) return;
      
      emailListContainer.innerHTML = ''; // Clear list
      
      if (state.emails.length === 0) {
        emailListContainer.innerHTML = '<div class="muted" style="padding: 12px;">No emails saved. Add one below.</div>';
      }
      
      state.emails.forEach((email, index) => {
        const row = document.createElement('div');
        row.className = 'email-row';
        
        const text = document.createElement('div');
        text.className = 'email-text';
        text.textContent = email;
        
        const editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.className = 'hidden';
        editInput.value = email;
        
        const actions = document.createElement('div');
        actions.className = 'email-actions';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'btn ghost';
        editBtn.textContent = 'Edit';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn danger';
        deleteBtn.textContent = 'Delete';
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn primary hidden';
        saveBtn.textContent = 'Save';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn ghost hidden';
        cancelBtn.textContent = 'Cancel';
        
        // Edit flow
        editBtn.addEventListener('click', () => {
          text.classList.add('hidden');
          editInput.classList.remove('hidden');
          editBtn.classList.add('hidden');
          deleteBtn.classList.add('hidden');
          saveBtn.classList.remove('hidden');
          cancelBtn.classList.remove('hidden');
          editInput.focus();
        });
        
        // Cancel flow
        cancelBtn.addEventListener('click', () => {
          text.classList.remove('hidden');
          editInput.classList.add('hidden');
          editBtn.classList.remove('hidden');
          deleteBtn.classList.remove('hidden');
          saveBtn.classList.add('hidden');
          cancelBtn.classList.add('hidden');
        });
        // Save flow
        saveBtn.addEventListener('click', () => {
          const newEmail = editInput.value.trim();
          if (newEmail && newEmail.includes('@')) {
            state.emails[index] = newEmail;
            text.textContent = newEmail;
            persistEmails(); // Save to file
          }
          // Always revert UI
          cancelBtn.click();
        });

        // Delete flow
        deleteBtn.addEventListener('click', () => {
          // Removed confirm() because Playwright auto-dismisses it
          state.emails.splice(index, 1);
          persistEmails();
        });
        row.appendChild(text);
        row.appendChild(editInput);
        row.appendChild(actions);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        emailListContainer.appendChild(row);
      });
      
      emailStatusDisplay.textContent = \`Loaded \${state.emails.length} of 100 emails.\`;
    }
    
    // Add new email
    q('#email-add-btn').addEventListener('click', () => {
      if (state.emails.length >= 100) {
        alert('Email limit (100) reached.');
        return;
      }
      const newEmail = emailAddInput.value.trim();
      if (newEmail && newEmail.includes('@')) {
        if (state.emails.includes(newEmail)) {
          alert('Email already in list.');
          return;
        }
        state.emails.push(newEmail);
        persistEmails();
        renderEmailList();
        emailAddInput.value = '';
      } else {
        alert('Please enter a valid email.');
      }
    });

    // Persist to Node.js
    async function persistEmails() {
      if (typeof window.saveEmails === 'function') {
        const result = await window.saveEmails(state.emails);
        if (result.success) {
          state.emails = result.emails; // Get back the sanitized list
          toast('Email list saved.');
        } else {
          toast('Error saving emails.');
        }
        renderEmailList(); // Re-render
      }
    }
    
    // Auto-select radio button when clicking option block
    q('#strat-single').addEventListener('click', () => q('input[name="email-strategy"][value="single"]').checked = true);
    q('#strat-loop').addEventListener('click', () => q('input[name="email-strategy"][value="loop"]').checked = true);
    q('#strat-n-times').addEventListener('click', () => q('input[name="email-strategy"][value="n-times"]').checked = true);
    
    // --- Function to receive initial emails from Node.js ---
    window.loadInitialEmails = (emails) => {
      state.emails = emails;
      renderEmailList();
    };

  </script>
</body>
</html>`;

  // --- ADDED: Load existing emails ---
  const emailPath = path.join(process.cwd(), 'emails.json');
  let existingEmails = [];
  try {
    if (fs.existsSync(emailPath)) {
      existingEmails = JSON.parse(fs.readFileSync(emailPath, 'utf8'));
      if (!Array.isArray(existingEmails)) existingEmails = [];
      existingEmails = existingEmails.filter(e => typeof e === 'string' && e.includes('@'));
      log(`✓ Loaded ${existingEmails.length} emails from emails.json`);
    }
  } catch (e) {
    log('Warning: No existing email file or error reading it.', e.message);
  }
  // --- END ADDED ---

  try {
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' });
    log('✓ UI loaded successfully');

    // --- ADDED: Inject loaded emails into the page ---
    await page.evaluate((emails) => {
      window.loadInitialEmails(emails);
    }, existingEmails);
    // --- END ADDED ---

  } catch (e) {
    errlog('Failed to render UI:', e.message);
    try { await browser.close(); } catch (_) { }
    process.exit(1);
  }

  let selection;
  try {
    log('Waiting for user selection...');
    selection = await selectionPromise;
  } catch (e) {
    errlog('Selection failed:', e.message);
    try { await browser.close(); } catch (_) { }
    process.exit(1);
  }

  // Save selection
  const outPath = path.join(process.cwd(), 'selection.json');
  try {
    fs.writeFileSync(outPath, JSON.stringify(selection, null, 2), 'utf8');
    log('✓ Selection saved:', outPath);
  } catch (e) {
    errlog('Failed to save selection.json:', e.message);
  }

  try {
    await browser.close();
    log('✓ UI browser closed');
  } catch (e) {
    log('Warning: Error closing browser:', e.message);
  }

  // ========== TEST EXECUTION SETUP ==========
  // This part only runs for 'Activation' or 'Refill'
  // 'Reload' is handled by the 'runReloadPorts' function

  if (selection.process === 'Reload') {
    log('Reload process was handled by the UI. Launcher is exiting.');
    process.exit(0);
  }

  if (selection.process === 'Scrape') {
    log('=== STARTING GATEWAY SCRAPING ===');

    const specPath = path.join(process.cwd(), 'tests', 'scrape', 'gateway-scraper.spec.ts');

    if (!fs.existsSync(specPath)) {
      errlog('SCRAPE TEST FILE NOT FOUND:', specPath);
      errlog('Expected location:', specPath);
      process.exit(1);
    }

    const relSpec = path.relative(process.cwd(), specPath).split(path.sep).join('/');
    const cmd = `npx playwright test "${relSpec}" --headed --project=chromium --workers=1`;

    const env = Object.assign({}, process.env);
    env.PLAYWRIGHT_BROWSERS_PATH = myBrowsersPath;
    env.OUTPUT_PATH = outputPath;

    log('Command:', cmd);
    log('Output path:', outputPath);

    const child = spawn(cmd, {
      shell: true,
      stdio: 'inherit',
      env,
      cwd: process.cwd()
    });


    child.on('exit', async (code) => {
      log('=== GATEWAY SCRAPER COMPLETED ===');
      log('Exit code:', code);
      
      if (code === 0) {
        const today = new Date().toISOString().split('T')[0];
        
        // Create "Inventory Reports" folder
        const reportsFolder = path.join(outputPath, 'Inventory Reports');
        if (!fs.existsSync(reportsFolder)) {
          fs.mkdirSync(reportsFolder, { recursive: true });
          log('Created "Inventory Reports" folder');
        }
        
        // Source files (in project root)
        const sourceFiles = {
          pdf: path.join(outputPath, `GW_Inventory_${today}.pdf`),
          txt: path.join(outputPath, `GW_Inventory_${today}.txt`),
          json: path.join(outputPath, `GW_Inventory_${today}.json`),
          errors: path.join(outputPath, `GW_Inventory_Errors_${today}.log`)
        };
        
        // Destination files (in Inventory Reports folder)
        const destFiles = {
          pdf: path.join(reportsFolder, `GW_Inventory_${today}.pdf`),
          txt: path.join(reportsFolder, `GW_Inventory_${today}.txt`),
          json: path.join(reportsFolder, `GW_Inventory_${today}.json`),
          errors: path.join(reportsFolder, `GW_Inventory_Errors_${today}.log`)
        };
        
        // Copy files to Inventory Reports folder
        let copiedFiles = [];
        for (const [type, sourcePath] of Object.entries(sourceFiles)) {
          if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destFiles[type]);
            copiedFiles.push({
              name: path.basename(destFiles[type]),
              type: type,
              size: fs.statSync(destFiles[type]).size
            });
            log(`Copied: ${path.basename(destFiles[type])}`);
          }
        }
        
        // Read summary statistics from JSON
        let stats = { total: 0, active: 0, weakSignal: 0, inactive: 0, errors: 0 };
        const jsonPath = destFiles.json;
        if (fs.existsSync(jsonPath)) {
          try {
            const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            if (jsonData.data) {
              stats.total = jsonData.data.length;
              stats.active = jsonData.data.filter(p => p.status === 'active').length;
              stats.weakSignal = jsonData.data.filter(p => p.status === 'weak-signal').length;
              stats.inactive = jsonData.data.filter(p => p.status === 'inactive').length;
            }
            if (jsonData.errors) {
              stats.errors = jsonData.errors.length;
            }
          } catch (e) {
            log('Could not read statistics from JSON');
          }
        }
        
        log('All reports saved to "Inventory Reports" folder');
        
        // Clean up - delete original files from root
        log('🧹 Cleaning up temporary files...');
        for (const [type, sourcePath] of Object.entries(sourceFiles)) {
          if (fs.existsSync(sourcePath)) {
            try {
              fs.unlinkSync(sourcePath);
              log(`   Deleted: ${path.basename(sourcePath)}`);
            } catch (e) {
              log(`   Could not delete: ${path.basename(sourcePath)}`);
            }
          }
        }
        log('Cleanup complete');
        
        // Show success page
        const successBrowser = await chromium.launch({ headless: false });
        const successPage = await successBrowser.newPage();
        
        // Format file size
        function formatBytes(bytes) {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        }
        
        const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Gateway Inventory - Reports Saved</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root {
      --bg: #f5f7fb;
      --card: #ffffff;
      --muted: #6b7280;
      --accent: #0b63ff;
      --accent-light: #eef2ff;
      --border: #e5e7eb;
      --success: #28a745;
      --success-light: #d4edda;
      --radius-lg: 12px;
      --radius-md: 8px;
      --shadow: 0 10px 30px rgba(20,25,40,0.08);
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body { 
      font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial;
      background: var(--bg);
      color: #111827;
      line-height: 1.5;
      padding: 40px 20px;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: var(--card);
      padding: 40px;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      animation: slideUp 0.4s ease-out;
    }
    
    @keyframes slideUp {
      from { 
        opacity: 0;
        transform: translateY(20px);
      }
      to { 
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .success-header {
      text-align: center;
      margin-bottom: 30px;
    }
    
    .success-icon {
      font-size: 64px;
      margin-bottom: 15px;
      animation: scaleIn 0.5s ease-out;
    }
    
    @keyframes scaleIn {
      from { transform: scale(0); }
      to { transform: scale(1); }
    }
    
    h1 { 
      color: var(--success);
      font-size: 28px;
      margin-bottom: 8px;
    }
    
    .subtitle {
      color: var(--muted);
      font-size: 16px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin: 25px 0;
    }
    
    .stat-card {
      background: var(--bg);
      padding: 16px;
      border-radius: var(--radius-md);
      text-align: center;
      border: 2px solid var(--border);
    }
    
    .stat-number {
      font-size: 28px;
      font-weight: bold;
      color: var(--accent);
    }
    
    .stat-label {
      font-size: 12px;
      color: var(--muted);
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .location-box {
      background: var(--accent-light);
      padding: 20px;
      border-radius: var(--radius-md);
      border-left: 4px solid var(--accent);
      margin: 25px 0;
    }
    
    .location-label {
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 10px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .location-path {
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 14px;
      background: var(--card);
      padding: 12px;
      border-radius: 6px;
      word-break: break-all;
      color: #333;
      cursor: text;
      user-select: all;
    }
    
    .files-section {
      margin: 25px 0;
    }
    
    .section-title {
      font-weight: 600;
      color: #333;
      margin-bottom: 15px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .file-item {
      padding: 14px;
      margin: 10px 0;
      background: var(--bg);
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 12px;
      transition: all 0.2s ease;
    }
    
    .file-item:hover {
      border-color: var(--accent);
      transform: translateX(4px);
    }
    
    .file-icon {
      font-size: 24px;
      flex-shrink: 0;
    }
    
    .file-info {
      flex: 1;
    }
    
    .file-name {
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      color: #495057;
      font-weight: 500;
    }
    
    .file-size {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }
    
    .actions {
      text-align: center;
      margin-top: 30px;
      padding-top: 30px;
      border-top: 1px solid var(--border);
    }
    
    .btn {
      display: inline-block;
      padding: 12px 24px;
      border-radius: var(--radius-md);
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      margin: 0 6px;
    }
    
    .btn-primary {
      background: var(--accent);
      color: white;
    }
    
    .btn-primary:hover {
      background: #0052d9;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(11, 99, 255, 0.3);
    }
    
    .btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    .btn-secondary:hover {
      background: #5a6268;
    }
    
    .success-note {
      margin-top: 25px;
      padding: 16px;
      background: var(--success-light);
      border-radius: var(--radius-md);
      border-left: 4px solid var(--success);
      color: #155724;
      font-size: 14px;
    }
    
    .timestamp {
      text-align: center;
      color: var(--muted);
      font-size: 12px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-header">
      <div class="success-icon">✅</div>
      <h1>Reports Saved Successfully!</h1>
      <p class="subtitle">Gateway inventory has been scraped and saved</p>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${stats.total}</div>
        <div class="stat-label">Total Ports</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" style="color: #28a745;">${stats.active}</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" style="color: #ffc107;">${stats.weakSignal}</div>
        <div class="stat-label">Weak Signal</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" style="color: #dc3545;">${stats.inactive}</div>
        <div class="stat-label">Inactive</div>
      </div>
      ${stats.errors > 0 ? `<div class="stat-card">
        <div class="stat-number" style="color: #fd7e14;">${stats.errors}</div>
        <div class="stat-label">Errors</div>
      </div>` : ''}
    </div>
    
    <div class="location-box">
      <div class="location-label">📂 Saved To</div>
      <div class="location-path">${reportsFolder}</div>
    </div>
    
    <div class="files-section">
      <div class="section-title">📄 Files Saved</div>
      ${copiedFiles.map(file => {
        let icon = '📄';
        if (file.type === 'pdf') icon = '📕';
        else if (file.type === 'txt') icon = '📝';
        else if (file.type === 'json') icon = '📊';
        else if (file.type === 'errors') icon = '⚠️';
        
        return `<div class="file-item">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-size">${formatBytes(file.size)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
    
    <div class="success-note">
      <strong>✓ Complete!</strong> All inventory reports have been saved to the "Inventory Reports" folder. 
      Original files have been cleaned up from the project root.
    </div>
    
    <div class="actions">
      <button class="btn btn-primary" onclick="copyPath()">📋 Copy Path</button>
      <button class="btn btn-secondary" onclick="closeAndExit()">Close & Exit</button>
    </div>
    
    <div class="timestamp">
      Generated on ${new Date().toLocaleString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}
    </div>
  </div>
  
  <script>
    function copyPath() {
      const path = \`${reportsFolder.replace(/\\/g, '\\\\')}\`;
      navigator.clipboard.writeText(path).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.background = '#28a745';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '';
        }, 2000);
      }).catch(() => {
        alert('Path: ' + path);
      });
    }
    
    function closeAndExit() {
      window.close();
    }
  </script>
</body>
</html>
        `;
        
        await successPage.setContent(html);
        
        log('Success page displayed.');
        
        // Exit when browser closes
        successBrowser.on('disconnected', () => {
          log('Browser closed. Exiting application...');
          process.exit(0);
        });
        
        // Also handle page close
        successPage.on('close', () => {
          log('Page closed. Exiting application...');
          successBrowser.close().then(() => process.exit(0));
        });
        
      } else {
        process.exit(code === null ? 0 : code);
      }
    });


child.on('error', (e) => {
  errlog('=== SCRAPER SPAWN ERROR ===');
  errlog('Failed to start scraper:', e.message);
  process.exit(1);
});

// Exit early - don't continue to test execution
return;
  }

log('=== CONFIGURING TEST EXECUTION ===');

const procFolder = String(selection.process || 'Activation').toLowerCase().startsWith('ref') ? 'refill' : 'activate';
const gateway = String(selection.gateway || '');
const testIndex = gatewayToTestMap[gateway];

if (typeof testIndex === 'undefined') {
  errlog(`No test mapping for gateway ${gateway}`);
  errlog('Valid gateways:', Object.keys(gatewayToTestMap).join(', '));
  process.exit(1);
}

const link = String(selection.linkType || '').toLowerCase();
const isLocal = (selection.process === 'Activation') && (link === 'internal' || link === 'local');
const specFileName = isLocal ? `test-${testIndex}-local.spec.ts` : `test-${testIndex}.spec.ts`;
const specPath = path.join(process.cwd(), 'tests', 'mobilex', procFolder, specFileName);

log('Process folder:', procFolder);
log('Gateway:', gateway, '→ Test index:', testIndex);
log('Spec file:', specFileName);
log('Full spec path:', specPath);

if (!fs.existsSync(specPath)) {
  errlog('TEST FILE NOT FOUND:', specPath);
  errlog('Tests folder contents:', listFolder(path.join(process.cwd(), 'tests'), 200));
  errlog('MobileX folder contents:', listFolder(path.join(process.cwd(), 'tests', 'mobilex'), 200));
  errlog(`${procFolder} folder contents:`, listFolder(path.join(process.cwd(), 'tests', 'mobilex', procFolder), 200));
  process.exit(1);
}

log('✓ Test file exists');

const relSpec = path.relative(process.cwd(), specPath).split(path.sep).join('/');

// ========== PLAYWRIGHT CONFIG SETUP ==========
log('=== PLAYWRIGHT CONFIG SETUP ===');

let configArg = '';
const cfgTs = path.join(process.cwd(), 'playwright.config.ts');
const cfgJs = path.join(process.cwd(), 'playwright.config.js');

if (fs.existsSync(cfgTs)) {
  configArg = ` --config="${cfgTs.split(path.sep).join('/')}"`;
  log('✓ Using playwright.config.ts');
} else if (fs.existsSync(cfgJs)) {
  configArg = ` --config="${cfgJs.split(path.sep).join('/')}"`;
  log('✓ Using playwright.config.js');
} else {
  errlog('⚠ NO CONFIG FOUND! Creating emergency fallback...');

  const emergencyConfig = `// Emergency config created by launcher
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    headless: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`;

  const emergencyPath = path.join(process.cwd(), 'playwright.config.js');
  try {
    fs.writeFileSync(emergencyPath, emergencyConfig, 'utf8');
    log('✓ Emergency config created:', emergencyPath);
    configArg = ` --config="${emergencyPath.split(path.sep).join('/')}"`;
  } catch (e) {
    errlog('✗ FAILED to create emergency config:', e.message);
    errlog('Cannot proceed without config file');
    process.exit(1);
  }
}

// ========== BROWSER PATH SETUP ==========
// This is already set for the parent process.
// We just need to ensure the child process (spawn) also gets it.
const env = Object.assign({}, process.env);

if (fs.existsSync(myBrowsersPath)) {
  env.PLAYWRIGHT_BROWSERS_PATH = myBrowsersPath;
  log('✓ Child process PLAYWRIGHT_BROWSERS_PATH set to:', myBrowsersPath);
} else {
  log('⚠ Child process: my-browsers folder not found - will use system Playwright browsers');
}
// --- END BROWSER PATH SETUP ---

// --- SET ALL ENV VARS ---
env.START_PORT = String(selection.startPortIndex || '1');
log('✓ START_PORT set to:', env.START_PORT);

// --- ADDED: Set Email strategy environment variables ---
env.EMAIL_STRATEGY = String(selection.emailStrategy || 'single');
env.EMAIL_SINGLE = String(selection.emailSingle || 'rb@usa.com');
env.EMAIL_N = String(selection.emailN || '1');
log('✓ EMAIL_STRATEGY set to:', env.EMAIL_STRATEGY);
log('✓ EMAIL_SINGLE set to:', env.EMAIL_SINGLE);
log('✓ EMAIL_N set to:', env.EMAIL_N);
// --- END ADDED ---

// ========== FINAL COMMAND ==========
const cmd = `npx playwright test "${relSpec}"${configArg} --headed --project=chromium --workers=1`;

log('=== LAUNCHING PLAYWRIGHT ===');
log('Command:', cmd);
log('Working dir:', process.cwd());
log('============================');

const child = spawn(cmd, {
  shell: true,
  stdio: 'inherit',
  env,
  cwd: process.cwd()
});

child.on('exit', (code) => {
  log('=== TEST EXECUTION COMPLETED ===');
  log('Exit code:', code);
  process.exit(code === null ? 0 : code);
});

child.on('error', (e) => {
  errlog('=== SPAWN ERROR ===');
  errlog('Failed to start Playwright:', e.message);
  errlog('Stack:', e.stack);
  process.exit(1);
});

}) ();