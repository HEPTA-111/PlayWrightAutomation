// run-my-test.ts
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const isPackaged = typeof (process as any).pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : process.cwd();

const browsersPath = path.join(baseDir, 'my-browsers');
const outputPath = baseDir;
const distPath = path.join(baseDir, 'dist');

// Default runner options (can be changed via env vars)
// IMPORTANT: Default to HEADED mode for standalone distributions
const PLAYWRIGHT_PROJECT = process.env.PLAYWRIGHT_PROJECT || 'chromium'; // chromium | firefox | webkit
const PLAYWRIGHT_WORKERS = process.env.PLAYWRIGHT_WORKERS || '1'; // default single worker
const PLAYWRIGHT_HEADED = (process.env.PLAYWRIGHT_HEADED || 'true').toLowerCase() === 'true'; // CHANGED: default true
const PLAYWRIGHT_TIMEOUT = process.env.PLAYWRIGHT_TIMEOUT || '60000'; // default 60 seconds

function findCompiledTestFile(): string | null {
  if (!fs.existsSync(distPath)) return null;
  const candidates: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.spec.js') || entry.endsWith('.spec.ts')) candidates.push(full);
    }
  }
  walk(distPath);
  if (candidates.length === 0) return null;
  const preferred = candidates.find(c => c.toLowerCase().includes('test-1.spec'));
  return preferred || candidates[0];
}

function toPosixRelative(fromDir: string, absolutePath: string) {
  const rel = path.relative(fromDir, absolutePath);
  return rel.split(path.sep).join('/');
}

function ensureNpxAvailable(): boolean {
  try {
    const check = spawnSync('npx --version', { shell: true, encoding: 'utf8' });
    if (check.error || check.status !== 0) return false;
    const output = (check.stdout || check.stderr || '').toString().trim();
    if (!output) return false;
    console.log(`npx detected: ${output}`);
    return true;
  } catch {
    return false;
  }
}

function checkBrowsersExist(): boolean {
  if (!fs.existsSync(browsersPath)) {
    console.error('ERROR: my-browsers folder not found at:', browsersPath);
    return false;
  }
  
  // Check for chromium specifically
  const chromiumPath = path.join(browsersPath, 'chromium-*');
  try {
    const entries = fs.readdirSync(browsersPath);
    const hasChromium = entries.some(e => e.startsWith('chromium-'));
    if (!hasChromium) {
      console.error('ERROR: No chromium browser found in my-browsers/');
      console.error('Available entries:', entries.join(', '));
      return false;
    }
    console.log('✓ Chromium browser found in my-browsers/');
    return true;
  } catch (err) {
    console.error('ERROR reading my-browsers directory:', err);
    return false;
  }
}

(async () => {
  console.log('---------------------------------');
  console.log('Packaged exe?:', isPackaged);
  console.log('Launcher running from:', baseDir);
  console.log('Looking for browsers in:', browsersPath);
  console.log('Output files will be saved to:', outputPath);
  console.log('dist path:', distPath);
  console.log(`Settings: project=${PLAYWRIGHT_PROJECT} workers=${PLAYWRIGHT_WORKERS} headed=${PLAYWRIGHT_HEADED} timeout=${PLAYWRIGHT_TIMEOUT}ms`);
  console.log('---------------------------------');

  if (!ensureNpxAvailable()) {
    console.error('ERROR: npx (and therefore Node/npm) is not available on this machine or not found in PATH.');
    console.error('Please install Node.js and try again: https://nodejs.org/');
    process.exit(1);
  }

  if (!checkBrowsersExist()) {
    console.error('FATAL: Cannot proceed without browsers.');
    console.error('If you are distributing this, make sure my-browsers/ folder is included.');
    process.exit(1);
  }

  if (!fs.existsSync(distPath)) {
    console.error('ERROR: dist/ folder not found. Did you run `npm run build`?');
    console.log('Top-level entries:', fs.readdirSync(baseDir).join(', '));
    process.exit(1);
  } else {
    console.log('dist/ contents:', fs.readdirSync(distPath).join(', '));
  }

  const testFile = findCompiledTestFile();
  if (!testFile) {
    console.error('ERROR: could not find compiled test file under dist/');
    process.exit(1);
  }
  console.log('Found compiled test file:', testFile);

  const relPathFromDist = toPosixRelative(distPath, testFile);
  console.log('Relative path (from dist) to test file:', relPathFromDist);

  // Build CLI string with enforced project/workers and optional headed
  const headedFlag = PLAYWRIGHT_HEADED ? '--headed' : '';
  const cmdString = `npx playwright test --project=${PLAYWRIGHT_PROJECT} --workers=${PLAYWRIGHT_WORKERS} ${headedFlag} --timeout=${PLAYWRIGHT_TIMEOUT} ${relPathFromDist}`.trim();

  console.log('Spawning via shell in dist folder:', cmdString);
  console.log(`Working directory: ${distPath}`);
  console.log('---------------------------------');

  const env = {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    OUTPUT_PATH: outputPath,
    // Add these to help with browser launching
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    NODE_ENV: 'production'
  };

  const child = spawn(cmdString, { 
    shell: true, 
    env, 
    stdio: 'inherit', 
    cwd: distPath 
  });

  child.on('error', (err) => {
    console.error('Failed to start playwright process:', err);
    try { 
      fs.writeFileSync(
        path.join(outputPath, 'playwright_cli_debug.txt'), 
        `spawn error: ${String(err)}\ncmd=${cmdString}\ncwd=${distPath}\nPLAYWRIGHT_BROWSERS_PATH=${browsersPath}`, 
        'utf8'
      ); 
    } catch {}
    process.exit(1);
  });

  child.on('close', (code) => {
    console.log('---------------------------------');
    console.log(`Playwright runner exited with code ${code}`);
    if (code !== 0) {
      const debug = [
        `exitCode=${code}`,
        `cwd=${distPath}`,
        `cmd=${cmdString}`,
        `PLAYWRIGHT_BROWSERS_PATH=${env.PLAYWRIGHT_BROWSERS_PATH}`,
        `OUTPUT_PATH=${env.OUTPUT_PATH}`,
        `dist_exists=${fs.existsSync(distPath)}`,
        `compiled_test=${fs.existsSync(testFile)}`,
        `browsers_path_exists=${fs.existsSync(browsersPath)}`
      ].join('\n');
      try { 
        fs.writeFileSync(path.join(outputPath, 'playwright_cli_debug.txt'), debug, 'utf8'); 
        console.log('Wrote debug info to playwright_cli_debug.txt'); 
      } catch {}
    }
    console.log('Output files (JSONs and Logs) are at:', outputPath);
    console.log('---------------------------------');
    console.log('Press any key to exit...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(typeof code === 'number' ? code : 0));
  });

  // Handle CTRL+C gracefully
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, terminating...');
    child.kill('SIGINT');
  });
})();