const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { spawn } = require('child_process');

(async () => {
  // --------- CONFIG: gateway -> test index (editable) ----------
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

  function log(...args) { console.log('Launcher:', ...args); }
  function errlog(...args) { console.error('Launcher:', ...args); }

  // Diagnostic helper to list a directory (best-effort)
  function listFolder(folder, limit = 50) {
    try {
      if (!fs.existsSync(folder)) return `${folder} (not found)`;
      const entries = fs.readdirSync(folder).slice(0, limit);
      return `${folder} => ${entries.join(', ')}`;
    } catch (e) {
      return `Error listing ${folder}: ${String(e)}`;
    }
  }

  // Launch headed Playwright browser for the small UI
  let browser;
  try {
    browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  } catch (e) {
    errlog('Failed to launch Playwright browser for UI:', e);
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.setViewportSize({ width: 920, height: 740 });

  let resolveSelection, rejectSelection;
  const selectionPromise = new Promise((resolve, reject) => {
    resolveSelection = resolve;
    rejectSelection = reject;
  });

  try {
    await page.exposeFunction('onSelection', (selection) => {
      resolveSelection(selection);
    });
  } catch (e) {
    errlog('Failed to expose onSelection to page:', e);
    try { await browser.close(); } catch (_) {}
    process.exit(1);
  }

  page.on('close', () => {
    rejectSelection(new Error('UI page closed before selection'));
  });
  browser.on('disconnected', () => {
    rejectSelection(new Error('Browser disconnected before selection'));
  });

  const makeGatewayHtml = () =>
    Array.from({ length: 10 }, (_, i) => 101 + i)
      .map(g => `<div class="gateway" data-gateway="${g}">Gateway ${g}</div>`).join('');

  // Full HTML (modern styled) — the page will call window.onSelection(...) when the user confirms
  const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Playwright Launcher</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{--bg:#f5f7fb;--card:#ffffff;--muted:#6b7280;--accent:#0b63ff;}
    html,body{height:100%;margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial;background:linear-gradient(180deg,#eef2ff 0%,#f8fafc 100%);}
    .wrap{max-width:920px;margin:28px auto;padding:28px;}
    .card{background:var(--card);border-radius:12px;box-shadow:0 10px 30px rgba(20,25,40,0.08);padding:20px;}
    header{display:flex;align-items:center;gap:14px;margin-bottom:16px;}
    header h1{margin:0;font-size:18px;}
    .subtitle{color:var(--muted);font-size:13px;margin-top:6px;}
    .step{margin-top:12px;}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px;}
    .option{background:linear-gradient(180deg,rgba(255,255,255,0.6),rgba(250,250,252,0.6));border-radius:10px;padding:12px;display:flex;gap:10px;align-items:center;cursor:pointer;border:1px solid rgba(16,24,40,0.04);transition:transform .12s ease,box-shadow .12s ease;}
    .option:hover{transform:translateY(-4px);box-shadow:0 10px 30px rgba(10,15,40,0.06);}
    .swatch{width:18px;height:18px;border-radius:4px;flex:0 0 18px;}
    .swatch.att{background:#ADD8E6;}
    .swatch.tmobile{background:#FFC0CB;}
    .swatch.spectrum{background:#003399;}
    .swatch.mobilex{background:#28a745;}
    .label{font-weight:600;font-size:14px;}
    .muted{color:var(--muted);font-size:12px;}
    .controls{display:flex;justify-content:space-between;align-items:center;margin-top:18px;gap:8px;}
    .btn{padding:10px 14px;border-radius:10px;border:0;cursor:pointer;font-weight:600;}
    .btn.ghost{background:transparent;color:var(--muted);border:1px solid rgba(16,24,40,0.04);}
    .btn.primary{background:var(--accent);color:white;box-shadow:0 6px 20px rgba(11,99,255,0.18);}
    .small{font-size:13px;padding:8px 10px;border-radius:8px;}
    .hidden{display:none;}
    .gateway-box{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
    .gateway{padding:8px 10px;border-radius:8px;border:1px solid rgba(16,24,40,0.06);cursor:pointer;user-select:none;}
    .option.selected,.gateway.selected{outline:3px solid rgba(11,99,255,0.08);}
    .field{margin-top:10px;display:flex;gap:10px;align-items:center;}
    input[type=number]{width:110px;padding:8px;border-radius:8px;border:1px solid #ddd;}
    .summary{margin-top:12px;padding:12px;border-radius:8px;background:linear-gradient(180deg,rgba(11,99,255,0.06),rgba(11,99,255,0.02));font-size:13px;}
    footer{margin-top:18px;display:flex;justify-content:space-between;align-items:center;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <header>
        <div>
          <h1>Automata</h1>
          <div class="subtitle">Pick a process, provider, MobileX options and starting port.</div>
        </div>
      </header>

      <div id="step-process" class="step">
        <div style="display:flex;justify-content:space-between;">
          <div style="font-weight:700">Step 1 — Choose Process</div>
          <div class="muted">Activation or Refill</div>
        </div>
        <div class="grid">
          <div class="option" id="opt-activation" data-process="Activation"><div class="label">Activation</div><div style="margin-left:auto" class="muted">device activation</div></div>
          <div class="option" id="opt-refill" data-process="Refill"><div class="label">Refill</div><div style="margin-left:auto" class="muted">top-up</div></div>
        </div>
        <div class="controls"><div class="muted">Pick one to continue</div><div><button class="btn ghost small" id="proc-reset">Reset</button><button class="btn primary small" id="to-provider">Next →</button></div></div>
      </div>

      <div id="step-provider" class="step hidden">
        <div style="display:flex;justify-content:space-between;"><div style="font-weight:700">Step 2 — Choose Provider</div><div class="muted">AT&T • t-mobile • Spectrum • MobileX</div></div>
        <div class="grid" style="margin-top:12px;">
          <div class="option provider" data-provider="AT&T"><span class="swatch att"></span><div><div class="label">AT&amp;T</div></div></div>
          <div class="option provider" data-provider="t-mobile"><span class="swatch tmobile"></span><div><div class="label">t-mobile</div></div></div>
          <div class="option provider" data-provider="Spectrum"><span class="swatch spectrum"></span><div><div class="label">Spectrum</div></div></div>
          <div class="option provider" data-provider="MobileX"><span class="swatch mobilex"></span><div><div class="label">MobileX</div></div></div>
        </div>
        <div class="controls"><div class="muted">Provider choice may change next steps</div><div><button class="btn ghost small" id="prov-back">← Back</button><button class="btn primary small" id="to-next">Next →</button></div></div>
      </div>

      <div id="step-mobilex" class="step hidden">
        <div style="display:flex;justify-content:space-between;"><div style="font-weight:700">Step 3 — MobileX Options</div><div class="muted">Choose gateway (101–110) and link type (Activation only)</div></div>
        <div style="margin-top:12px;">
          <div style="font-weight:600;margin-bottom:8px;">Choose Gateway</div>
          <div class="gateway-box" id="gateway-box">${makeGatewayHtml()}</div>

          <div style="font-weight:600;margin-top:12px;">Choose starting port (A1–A64)</div>
          <div class="field">
            <label class="muted">Start port index:</label>
            <input id="start-port" type="number" min="1" max="64" value="1" />
            <div class="muted">This will be used as A{index} in the test loop</div>
          </div>

          <!-- Link type section: hidden for Refill -->
          <div id="link-type-section" style="margin-top:12px;">
            <div style="font-weight:600;margin-bottom:8px;">Link type</div>
            <div style="display:flex;gap:10px;">
              <div class="option linktype" data-link="external"><div class="label">External</div><div class="muted" style="margin-left:auto">external link</div></div>
              <div class="option linktype" data-link="internal"><div class="label">Internal</div><div class="muted" style="margin-left:auto">internal</div></div>
            </div>
          </div>

          <div class="controls" style="margin-top:14px;"><div class="muted">When ready, finish to save & run</div><div><button class="btn ghost small" id="mobilex-back">← Back</button><button class="btn primary small" id="mobilex-finish">Finish</button></div></div>
        </div>
      </div>

      <div id="step-confirm" class="step hidden">
        <div style="font-weight:700">Confirm & Launch</div>
        <div class="summary" id="summary"></div>
        <div class="controls"><div class="muted">Review choices</div><div><button class="btn ghost small" id="confirm-back">← Back</button><button class="btn primary small" id="confirm-launch">Launch</button></div></div>
      </div>

    </div>
  </div>

  <script>
    const state = { process:null, provider:null, gateway:null, linkType:null, startPortIndex:29 };

    function q(sel, all=false) { return all ? Array.from(document.querySelectorAll(sel)) : document.querySelector(sel); }
    function clearSelected(selector) { q(selector, true).forEach(e=>e.classList.remove('selected')); }

    // Process selection
    q('#opt-activation').addEventListener('click', ()=>{ clearSelected('.option'); q('#opt-activation').classList.add('selected'); state.process='Activation'; });
    q('#opt-refill').addEventListener('click', ()=>{ clearSelected('.option'); q('#opt-refill').classList.add('selected'); state.process='Refill'; });
    q('#proc-reset').addEventListener('click', ()=>{ state.process=null; clearSelected('.option'); });

    q('#to-provider').addEventListener('click', ()=> {
      if (!state.process) { alert('Please choose a process'); return; }
      q('#step-process').classList.add('hidden');
      q('#step-provider').classList.remove('hidden');
    });

    // Provider selection
    q('.provider', true).forEach(el=>{
      el.addEventListener('click', () => {
        clearSelected('.provider');
        el.classList.add('selected');
        state.provider = el.dataset.provider;
      });
    });
    q('#prov-back').addEventListener('click', ()=> {
      q('#step-provider').classList.add('hidden'); q('#step-process').classList.remove('hidden');
    });

    q('#to-next').addEventListener('click', ()=> {
      if (!state.provider) { alert('Please choose a provider'); return; }
      q('#step-provider').classList.add('hidden');
      if (state.provider === 'MobileX') {
        // Show MobileX options; show/hide link-type depending on process
        q('#step-mobilex').classList.remove('hidden');
        if (state.process === 'Refill') {
          // For Refill, hide link-type selection and clear any previous linkType
          const linkSection = q('#link-type-section');
          if (linkSection) linkSection.style.display = 'none';
          state.linkType = null;
          clearSelected('.linktype');
        } else {
          // For Activation, show link-type
          const linkSection = q('#link-type-section');
          if (linkSection) linkSection.style.display = '';
        }
      } else {
        updateSummary();
        q('#step-confirm').classList.remove('hidden');
      }
    });

    // MobileX interactions
    q('#gateway-box').querySelectorAll('.gateway').forEach(g=>{
      g.addEventListener('click', () => {
        clearSelected('.gateway'); g.classList.add('selected'); state.gateway = g.dataset.gateway;
      });
    });

    q('.linktype', true).forEach(l=>{
      l.addEventListener('click', () => {
        clearSelected('.linktype'); l.classList.add('selected'); state.linkType = l.dataset.link;
      });
    });

    // Start port input
    const startPortInput = q('#start-port');
    startPortInput.addEventListener('input', () => {
      let v = parseInt(startPortInput.value || '29', 10);
      if (isNaN(v)) v = 29;
      if (v < 1) v = 1;
      if (v > 64) v = 64;
      startPortInput.value = String(v);
      state.startPortIndex = v;
    });

    q('#mobilex-back').addEventListener('click', ()=> { q('#step-mobilex').classList.add('hidden'); q('#step-provider').classList.remove('hidden'); });

    q('#mobilex-finish').addEventListener('click', ()=> {
      if (!state.gateway) { alert('Please choose a gateway'); return; }
      // Only require linkType for Activation; Refill skips link-type
      if (state.process === 'Activation' && !state.linkType) { alert('Please choose a link type'); return; }
      state.startPortIndex = parseInt(startPortInput.value || '29', 10) || 29;
      updateSummary();
      q('#step-mobilex').classList.add('hidden'); q('#step-confirm').classList.remove('hidden');
    });

    function updateSummary() {
      const s = [];
      s.push('<strong>Process:</strong> ' + (state.process || '-'));
      s.push('<strong>Provider:</strong> ' + (state.provider || '-'));
      if (state.provider === 'MobileX') {
        s.push('<strong>Gateway:</strong> ' + (state.gateway || '-'));
        if (state.process === 'Activation') {
          s.push('<strong>Link:</strong> ' + (state.linkType || '-'));
        } else {
          s.push('<strong>Link:</strong> (not applicable for Refill)');
        }
        s.push('<strong>Start port (index):</strong> A' + (state.startPortIndex || '-'));
      }
      q('#summary').innerHTML = s.map(x => '<div style="margin-bottom:6px;">'+x+'</div>').join('');
    }

    q('#confirm-back').addEventListener('click', ()=> {
      q('#step-confirm').classList.add('hidden');
      if (state.provider === 'MobileX') q('#step-mobilex').classList.remove('hidden'); else q('#step-provider').classList.remove('hidden');
    });

    // Final launch — call node-exposed function
    q('#confirm-launch').addEventListener('click', ()=> {
      // call the Node-side function if available
      if (typeof window.onSelection === 'function') {
        // ensure the selection's linkType remains null for Refill
        const payload = Object.assign({}, state, { timestamp: Date.now() });
        window.onSelection(payload);
      } else {
        // fallback if not available
        window.__selection = Object.assign({}, state, { timestamp: Date.now() });
        alert('Launcher bridge not available; selection stored to window.__selection');
      }
    });
  </script>
</body>
</html>`;

  try {
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    errlog('Failed to render UI content:', e);
    try { await browser.close(); } catch(_) {}
    process.exit(1);
  }

  let selection;
  try {
    selection = await selectionPromise;
  } catch (e) {
    errlog('wait for selection failed:', e);
    try { await browser.close(); } catch (_) {}
    process.exit(1);
  }

  // Save selection to disk (useful when running from package)
  const outPath = path.join(process.cwd(), 'selection.json');
  try {
    fs.writeFileSync(outPath, JSON.stringify(selection, null, 2), 'utf8');
    log('selection saved to', outPath);
    log('selection =>', selection);
  } catch (e) {
    errlog('Failed to write selection.json:', e);
  }

  try { await browser.close(); } catch (e) {}

  // decide which test file to run
  const procFolder = String(selection.process || 'Activation').toLowerCase().startsWith('ref') ? 'refill' : 'activate';
  const gateway = String(selection.gateway || '');
  const testIndex = gatewayToTestMap[gateway];

  if (typeof testIndex === 'undefined') {
    errlog(`No mapping found for gateway ${gateway}. Edit gatewayToTestMap at top of launcher.js.`);
    process.exit(1);
  }

  const link = String(selection.linkType || '').toLowerCase();
  const isLocal = (selection.process === 'Activation') && (link === 'internal' || link === 'local');
  const specFileName = isLocal ? `test-${testIndex}-local.spec.ts` : `test-${testIndex}.spec.ts`;
  const specPath = path.join(process.cwd(), 'tests', 'mobilex', procFolder, specFileName);

  if (!fs.existsSync(specPath)) {
    // helpful diagnostics if spec missing inside extracted bundle
    errlog(`Expected test file not found: ${specPath}`);
    errlog('Listing bundle root and tests folder for debugging:');
    errlog('Root listing: ' + listFolder(process.cwd(), 200));
    errlog('tests listing: ' + listFolder(path.join(process.cwd(), 'tests'), 200));
    process.exit(1);
  }

  let relSpec = path.relative(process.cwd(), specPath).split(path.sep).join('/');

  // If a playwright config exists in the bundle, instruct Playwright to use it explicitly
  let configArg = '';
  const cfgTs = path.join(process.cwd(), 'playwright.config.ts');
  const cfgJs = path.join(process.cwd(), 'playwright.config.js');
  if (fs.existsSync(cfgTs)) {
    configArg = ` --config="${cfgTs.split(path.sep).join('/')}"`;
  } else if (fs.existsSync(cfgJs)) {
    configArg = ` --config="${cfgJs.split(path.sep).join('/')}"`;
  } else {
    // no config found — provide helpful diagnostics (we will still try to run without config)
    log('Warning: No playwright.config.ts/js found in current folder. Playwright may not have projects defined.');
    log('Bundle root listing:', listFolder(process.cwd(), 200));
  }

  // If my-browsers exists in bundle, set PLAYWRIGHT_BROWSERS_PATH so Playwright will use bundled browsers
  const myBrowsersPath = path.join(process.cwd(), 'my-browsers');
  const env = Object.assign({}, process.env);
  if (fs.existsSync(myBrowsersPath)) {
    env.PLAYWRIGHT_BROWSERS_PATH = myBrowsersPath;
    log('Set PLAYWRIGHT_BROWSERS_PATH to bundled my-browsers');
  }

  // Pass START_PORT env var for tests
  env.START_PORT = String(selection.startPortIndex || '29');

  // Build the command
  const cmd = `npx playwright test "${relSpec}"${configArg} --headed --project=chromium --workers=1`;
  log('Spawning:', cmd);

  // Spawn in shell so quoting works on Windows
  const child = spawn(cmd, { shell: true, stdio: 'inherit', env });

  child.on('exit', (code) => {
    log('Playwright test process exited with code', code);
    process.exit(code === null ? 0 : code);
  });

  child.on('error', (e) => {
    errlog('Failed to start Playwright test process:', e);
    process.exit(1);
  });

})();