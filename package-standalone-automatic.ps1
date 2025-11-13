<#
  package-standalone-automatic.ps1
  COMPLETE FIXED VERSION - No syntax errors
  
  Usage: 
    powershell -NoProfile -ExecutionPolicy Bypass -File .\package-standalone-automatic.ps1
#>

param(
  [string]$SevenZipExe = "C:\Program Files\7-Zip\7z.exe",
  [string]$OutName = "final-single-standalone.exe",
  [switch]$ForceDownloadNode
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Playwright Automation Packager" -ForegroundColor Cyan
Write-Host "COMPLETE FIXED VERSION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Auto-detect SFX module
$SfxModule = $null
$sfxPriority = @(
  "C:\Program Files\7-Zip\7zS.sfx",
  "C:\Program Files\7-Zip\7zSD.sfx",
  "C:\Program Files\7-Zip\7z.sfx"
)

foreach ($sfx in $sfxPriority) {
  if (Test-Path $sfx) {
    $SfxModule = $sfx
    Write-Host "Found SFX module: $sfx" -ForegroundColor Green
    break
  }
}

# Verify prerequisites
if (-not (Test-Path $SevenZipExe)) {
  Write-Error "7z.exe not found at $SevenZipExe"
  Write-Host "Install 7-Zip from https://www.7-zip.org/" -ForegroundColor Yellow
  exit 1
}

if (-not $SfxModule) {
  Write-Error "No SFX module found. Please reinstall 7-Zip."
  exit 1
}

$root = (Get-Location).Path
Write-Host "Working directory: $root" -ForegroundColor Cyan
Write-Host ""

# Check required files
Write-Host "=== CHECKING REQUIRED FILES ===" -ForegroundColor Yellow

$requiredItems = @{
  "dist" = "Build output"
  "launcher.js" = "Launcher script"
  "tests" = "Test files directory"
  "node_modules" = "Dependencies"
}

$allPresent = $true
foreach ($item in $requiredItems.Keys) {
  $itemPath = Join-Path $root $item
  $exists = Test-Path $itemPath
  
  if ($exists) {
    Write-Host "  OK: $item" -ForegroundColor Green
  }
  else {
    Write-Host "  MISSING: $item - $($requiredItems[$item])" -ForegroundColor Red
    $allPresent = $false
  }
}

if (-not $allPresent) {
  Write-Error "Missing required files. Fix the issues above and try again."
  exit 1
}

Write-Host ""

# Playwright config check
Write-Host "=== PLAYWRIGHT CONFIG CHECK ===" -ForegroundColor Yellow

$cfgTsSrc = Join-Path $root "playwright.config.ts"
$cfgJsSrc = Join-Path $root "playwright.config.js"
$configExists = $false

if (Test-Path $cfgTsSrc) {
  Write-Host "  OK: playwright.config.ts found" -ForegroundColor Green
  $configExists = $true
}
elseif (Test-Path $cfgJsSrc) {
  Write-Host "  OK: playwright.config.js found" -ForegroundColor Green
  $configExists = $true
}
else {
  Write-Host "  No Playwright config found - creating default..." -ForegroundColor Yellow
  
  $defaultConfig = @'
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
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
'@
  
  $defaultConfig | Out-File -FilePath $cfgTsSrc -Encoding UTF8
  Write-Host "  OK: Created playwright.config.ts" -ForegroundColor Green
  $configExists = $true
}

Write-Host ""

# Browsers check
Write-Host "=== PLAYWRIGHT BROWSERS CHECK ===" -ForegroundColor Yellow

$myBrowsersPath = Join-Path $root "my-browsers"
if (-not (Test-Path $myBrowsersPath)) {
  Write-Host "  my-browsers not found - installing..." -ForegroundColor Yellow
  
  $env:PLAYWRIGHT_BROWSERS_PATH = $myBrowsersPath
  
  Write-Host "  Running: npx playwright install chromium" -ForegroundColor Gray
  & npx playwright install chromium 2>&1 | ForEach-Object { 
    Write-Host "    $_" -ForegroundColor DarkGray 
  }
  
  if (Test-Path $myBrowsersPath) {
    Write-Host "  OK: Browsers installed" -ForegroundColor Green
  }
  else {
    Write-Error "Browser installation failed"
    exit 1
  }
}
else {
  Write-Host "  OK: my-browsers exists" -ForegroundColor Green
}

Write-Host ""

# Portable Node
Write-Host "=== PORTABLE NODE CHECK ===" -ForegroundColor Yellow

$portableNodePath = Join-Path $root "portable-node"
if ((-not (Test-Path $portableNodePath)) -or $ForceDownloadNode) {
  Write-Host "  Downloading portable Node.js..." -ForegroundColor Yellow
  
  $nodeVersionRaw = $null
  try { 
    $nodeVersionRaw = (& node -v) 2>$null 
  }
  catch { 
    # Ignore error
  }

  if (-not $nodeVersionRaw) {
    $nodeVersion = "22.13.0"
    Write-Host "  Using default Node version: v$nodeVersion" -ForegroundColor Gray
  }
  else {
    $nodeVersion = $nodeVersionRaw.TrimStart('v').Trim()
    Write-Host "  Matching local Node: v$nodeVersion" -ForegroundColor Gray
  }

  $zipName = "node-v$nodeVersion-win-x64.zip"
  $url = "https://nodejs.org/dist/v$nodeVersion/$zipName"
  $tmpZip = Join-Path $env:TEMP $zipName

  Write-Host "  Downloading from nodejs.org..." -ForegroundColor Gray
  Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing
  
  $tmpExtract = Join-Path $env:TEMP ("node_" + [System.Guid]::NewGuid().ToString("N"))
  Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force
  
  $nodeExe = Get-ChildItem -Path $tmpExtract -Recurse -Filter node.exe | Select-Object -First 1
  
  if (-not $nodeExe) {
    Write-Error "node.exe not found in downloaded archive"
    exit 1
  }
  
  if (-not (Test-Path $portableNodePath)) {
    New-Item -ItemType Directory -Path $portableNodePath | Out-Null
  }
  
  Copy-Item -Path $nodeExe.FullName -Destination (Join-Path $portableNodePath "node.exe") -Force
  
  Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
  Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
  
  Write-Host "  OK: Portable Node installed" -ForegroundColor Green
}
else {
  Write-Host "  OK: portable-node exists" -ForegroundColor Green
}

Write-Host ""

# Create bundle
Write-Host "=== CREATING BUNDLE ===" -ForegroundColor Yellow

$bundle = Join-Path $root "bundle_temp"
if (Test-Path $bundle) { 
  Remove-Item $bundle -Recurse -Force 
}
New-Item -ItemType Directory -Path $bundle | Out-Null

Write-Host "  Copying dist..." -ForegroundColor Gray
Copy-Item -Path (Join-Path $root "dist") -Destination $bundle -Recurse -Force

Write-Host "  Copying my-browsers..." -ForegroundColor Gray
Copy-Item -Path (Join-Path $root "my-browsers") -Destination $bundle -Recurse -Force

Write-Host "  Copying portable-node..." -ForegroundColor Gray
Copy-Item -Path (Join-Path $root "portable-node") -Destination $bundle -Recurse -Force

Write-Host "  Copying node_modules..." -ForegroundColor Gray
Copy-Item -Path (Join-Path $root "node_modules") -Destination $bundle -Recurse -Force

Write-Host "  Copying launcher.js..." -ForegroundColor Gray
Copy-Item -Path (Join-Path $root "launcher.js") -Destination (Join-Path $bundle "launcher.js") -Force

Write-Host "  Copying tests..." -ForegroundColor Gray
Copy-Item -Path (Join-Path $root "tests") -Destination (Join-Path $bundle "tests") -Recurse -Force

# Copy config
Write-Host "  Copying Playwright config..." -ForegroundColor Gray

$configCopied = $false
if (Test-Path $cfgTsSrc) {
  Copy-Item -Path $cfgTsSrc -Destination (Join-Path $bundle "playwright.config.ts") -Force
  Write-Host "    OK: Copied playwright.config.ts" -ForegroundColor Green
  $configCopied = $true
}
elseif (Test-Path $cfgJsSrc) {
  Copy-Item -Path $cfgJsSrc -Destination (Join-Path $bundle "playwright.config.js") -Force
  Write-Host "    OK: Copied playwright.config.js" -ForegroundColor Green
  $configCopied = $true
}

if (-not $configCopied) {
  Write-Host "    Creating fallback config in bundle..." -ForegroundColor Yellow
  
  $fallbackConfig = @'
// Fallback config for bundle
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
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
'@
  
  $fallbackPath = Join-Path $bundle "playwright.config.js"
  $fallbackConfig | Out-File -FilePath $fallbackPath -Encoding UTF8
  Write-Host "    OK: Created fallback config" -ForegroundColor Green
}

# Copy package.json
$pkgJson = Join-Path $root "package.json"
if (Test-Path $pkgJson) {
  Copy-Item -Path $pkgJson -Destination (Join-Path $bundle "package.json") -Force
  Write-Host "  OK: Copied package.json" -ForegroundColor Green
}

# Create run.bat
Write-Host "  Creating run.bat..." -ForegroundColor Gray

$runBatContent = @'
@echo off
SETLOCAL
TITLE Playwright Automation Launcher
COLOR 0A

SET BASE=%~dp0

echo ========================================
echo   Playwright Automation Runner
echo ========================================
echo.
echo Starting launcher...
echo.

REM Use bundled portable node to run launcher
"%BASE%portable-node\node.exe" "%BASE%launcher.js"

IF ERRORLEVEL 1 (
    echo.
    echo ========================================
    echo   ERROR: Launcher failed
    echo ========================================
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Execution completed
echo ========================================
pause
'@

$runBatPath = Join-Path $bundle "run.bat"
$runBatContent | Out-File -FilePath $runBatPath -Encoding ASCII
Write-Host "  OK: Created run.bat" -ForegroundColor Green

# Create README
$readmeContent = @'
Playwright Automation Runner - Standalone Package
==================================================

USAGE:
------
1. Double-click the .exe file
2. Files will extract automatically
3. The automation GUI will launch
4. Follow the on-screen instructions

CONTENTS:
---------
- Portable Node.js runtime
- Playwright browsers (Chromium)
- All test scripts and dependencies
- Launcher GUI for easy configuration

TROUBLESHOOTING:
----------------
If the .exe doesn't work:
1. Right-click the .exe -> Run as administrator
2. Check if antivirus is blocking execution
3. Manually extract with 7-Zip and run run.bat

SYSTEM REQUIREMENTS:
--------------------
- Windows 10/11 (64-bit)
- 2GB free disk space
- Internet connection (optional)

For support, check the logs created during execution.
'@

$readmePath = Join-Path $bundle "README.txt"
$readmeContent | Out-File -FilePath $readmePath -Encoding UTF8
Write-Host "  OK: Created README.txt" -ForegroundColor Green

Write-Host ""

# Create archive
Write-Host "=== CREATING ARCHIVE ===" -ForegroundColor Yellow

$archive = Join-Path $root "my-package.7z"
if (Test-Path $archive) { Remove-Item $archive -Force }

Write-Host "  Compressing files..." -ForegroundColor Gray
& $SevenZipExe a -t7z -mx1 -mmt=on $archive (Join-Path $bundle '*') | Out-Null

if (-not (Test-Path $archive)) {
  Write-Error "Failed to create 7z archive"
  exit 1
}

$archiveSize = (Get-Item $archive).Length / 1MB
Write-Host "  OK: Archive created - $([math]::Round($archiveSize, 2)) MB" -ForegroundColor Green

Write-Host ""

# Create SFX config
Write-Host "=== CREATING SELF-EXTRACTOR ===" -ForegroundColor Yellow

$isGuiSfx = $SfxModule -match "7zS"

if ($isGuiSfx) {
  $config = @'
;!@Install@!UTF-8!
Title="Playwright Automation"
BeginPrompt="Extract and run Playwright automation?\n\nThis will:\n- Extract all files\n- Launch the configuration GUI\n- Run your selected tests"
ExtractDialogText="Extracting automation files..."
ExtractPathText="Extract to:"
ExtractTitle="Playwright Automation Setup"
GUIMode="1"
OverwriteMode="2"
ExecuteFile="run.bat"
ExecuteParameters=""
;!@InstallEnd@!
'@
}
else {
  $config = @'
;!@Install@!UTF-8!
Title="Playwright Automation"
BeginPrompt="Extract and run Playwright automation?"
RunProgram="run.bat"
;!@InstallEnd@!
'@
}

$configFile = Join-Path $root "sfx_config.txt"
$config | Out-File -FilePath $configFile -Encoding UTF8 -NoNewline

# Build SFX
$outPath = Join-Path $root $OutName
if (Test-Path $outPath) { Remove-Item $outPath -Force }

Write-Host "  Building executable..." -ForegroundColor Gray

$buildSuccess = $false

# Try file stream method
try {
  Copy-Item $SfxModule -Destination $outPath -Force
  
  $configBytes = [System.IO.File]::ReadAllBytes($configFile)
  $archiveBytes = [System.IO.File]::ReadAllBytes($archive)
  
  $stream = [System.IO.File]::Open($outPath, [System.IO.FileMode]::Append)
  $stream.Write($configBytes, 0, $configBytes.Length)
  $stream.Write($archiveBytes, 0, $archiveBytes.Length)
  $stream.Close()
  
  $buildSuccess = $true
  Write-Host "  OK: SFX created (stream method)" -ForegroundColor Green
}
catch {
  Write-Host "  Stream method failed, trying CMD..." -ForegroundColor Yellow
  
  # Try CMD method
  $cmdCopy = "copy /b `"$SfxModule`"+`"$configFile`"+`"$archive`" `"$outPath`""
  cmd /c $cmdCopy 2>&1 | Out-Null
  
  if (Test-Path $outPath) {
    $buildSuccess = $true
    Write-Host "  OK: SFX created (CMD method)" -ForegroundColor Green
  }
}

if (-not $buildSuccess) {
  Write-Error "Failed to create SFX"
  exit 1
}

$exeSize = (Get-Item $outPath).Length / 1MB
Write-Host ""
Write-Host "  Final size: $([math]::Round($exeSize, 2)) MB" -ForegroundColor Cyan

# Cleanup
Write-Host ""
Write-Host "=== CLEANING UP ===" -ForegroundColor Yellow

Remove-Item $bundle -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $archive -Force -ErrorAction SilentlyContinue
Remove-Item $configFile -Force -ErrorAction SilentlyContinue

Write-Host "  OK: Temporary files removed" -ForegroundColor Green

# Success message
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SUCCESS!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Created: $OutName" -ForegroundColor Cyan
Write-Host "Size: $([math]::Round($exeSize, 2)) MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "USAGE:" -ForegroundColor Yellow
Write-Host "  1. Share the .exe file" -ForegroundColor White
Write-Host "  2. Recipients double-click to run" -ForegroundColor White
Write-Host "  3. GUI launches automatically" -ForegroundColor White
Write-Host ""
Write-Host "Package includes:" -ForegroundColor Yellow
Write-Host "  - Portable Node.js" -ForegroundColor White
Write-Host "  - Playwright browsers" -ForegroundColor White
Write-Host "  - All dependencies" -ForegroundColor White
Write-Host "  - Configuration GUI" -ForegroundColor White
Write-Host "  - All test scripts" -ForegroundColor White
Write-Host ""