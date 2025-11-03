<#
  package-standalone-automatic.ps1
  Usage: open PowerShell in project root and run:
    .\package-standalone-automatic.ps1
#>

param(
  [string]$SevenZipExe = "C:\Program Files\7-Zip\7z.exe",
  [string]$OutName = "final-single-standalone.exe",
  [switch]$ForceDownloadNode
)

# Auto-detect available SFX module
$SfxModule = $null
$sfxPriority = @(
  "C:\Program Files\7-Zip\7zS.sfx",      # GUI version (best for auto-run)
  "C:\Program Files\7-Zip\7zSD.sfx",     # Small GUI version
  "C:\Program Files\7-Zip\7z.sfx"        # Console version (fallback)
)

foreach ($sfx in $sfxPriority) {
  if (Test-Path $sfx) {
    $SfxModule = $sfx
    Write-Host "Found SFX module: $sfx" -ForegroundColor Green
    break
  }
}

# --- checks ---
if (-not (Test-Path $SevenZipExe)) {
  Write-Error "7z.exe not found at $SevenZipExe. Install 7-Zip or set -SevenZipExe to the correct path."
  exit 1
}
if (-not $SfxModule) {
  Write-Error "No SFX module found in C:\Program Files\7-Zip\. Please reinstall 7-Zip."
  exit 1
}

$root = (Get-Location).Path
Write-Host "Packaging from root:" $root

# Ensure dist and my-browsers exist (fail early if they don't)
foreach ($needed in @("dist","my-browsers")) {
  if (-not (Test-Path (Join-Path $root $needed))) {
    Write-Error "$needed/ folder not found under project root. Run `npm run build` and `npx playwright install chromium` first."
    exit 1
  }
}

# If portable-node missing, attempt to download matching node version
$portableNodePath = Join-Path $root "portable-node"
if (-not (Test-Path $portableNodePath) -or $ForceDownloadNode) {
  Write-Host "portable-node not found (or forced). Attempting to download portable Node matching installed version..."

  # Check for local node.exe to detect version
  try {
    $nodeVersionRaw = (& node -v) 2>$null
  } catch {
    $nodeVersionRaw = $null
  }

  if (-not $nodeVersionRaw) {
    Write-Host "No local Node found. Please specify a version or install Node on the build machine."
    $answer = Read-Host "Enter Node version to download (e.g. 22.19.0) or press Enter to abort"
    if (-not $answer) { Write-Error "Aborting: Node version required."; exit 1 }
    $nodeVersion = $answer.Trim()
  } else {
    $nodeVersion = $nodeVersionRaw.TrimStart('v').Trim()
    Write-Host "Detected local node version: v$nodeVersion"
  }

  $zipName = "node-v$nodeVersion-win-x64.zip"
  $url = "https://nodejs.org/dist/v$nodeVersion/$zipName"
  $tmpZip = Join-Path $env:TEMP $zipName
  Write-Host "Downloading $url to $tmpZip ..."

  try {
    Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing -ErrorAction Stop
    Write-Host "Downloaded Node zip."
  } catch {
    Write-Error "Failed to download Node from $url. Check the version or network. Error: $($_.Exception.Message)"
    exit 1
  }

  # extract
  $tmpExtract = Join-Path $env:TEMP ("node_extract_" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmpExtract | Out-Null
  try {
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force
  } catch {
    Write-Error "Failed to extract Node zip: $($_.Exception.Message)"
    Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
  }

  # find node.exe in extracted folder
  $nodeExeCandidate = Get-ChildItem -Path $tmpExtract -Recurse -Filter node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $nodeExeCandidate) {
    Write-Error "node.exe not found inside extracted zip. Aborting."
    Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
  }

  # create portable-node and copy node.exe
  if (-not (Test-Path $portableNodePath)) { New-Item -ItemType Directory -Path $portableNodePath | Out-Null }
  Copy-Item -Path $nodeExeCandidate.FullName -Destination (Join-Path $portableNodePath "node.exe") -Force

  Write-Host "Portable node created at $portableNodePath"
  # cleanup
  Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
  Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
}

# Make sure node_modules exists (it may be large)
if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Write-Warning "node_modules not found. Running npm install (this may be very large)."
  npm install
}

# Prepare bundle folder
$bundle = Join-Path $root "bundle_temp"
if (Test-Path $bundle) { Remove-Item $bundle -Recurse -Force }
New-Item -ItemType Directory -Path $bundle | Out-Null

# Copy content
Write-Host "Copying dist/"
Copy-Item -Path (Join-Path $root "dist") -Destination $bundle -Recurse -Force

Write-Host "Copying my-browsers/"
Copy-Item -Path (Join-Path $root "my-browsers") -Destination $bundle -Recurse -Force

Write-Host "Copying portable-node/"
Copy-Item -Path (Join-Path $root "portable-node") -Destination $bundle -Recurse -Force

Write-Host "Copying node_modules/ (this may take a while)"
Copy-Item -Path (Join-Path $root "node_modules") -Destination $bundle -Recurse -Force

# Ensure run.bat exists or create a default
$runBatSrc = Join-Path $root "run.bat"
if (-not (Test-Path $runBatSrc)) {
  Write-Host "run.bat not found. Creating a default run.bat..."
  @'
@echo off
SET BASE=%~dp0
"%BASE%portable-node\node.exe" "%BASE%dist\run-my-test.js"
pause
'@ | Out-File -FilePath $runBatSrc -Encoding ASCII
}
Copy-Item -Path $runBatSrc -Destination $bundle -Force

# README
$readmeSrc = Join-Path $root "README.txt"
if (-not (Test-Path $readmeSrc)) {
  @'
Playwright Automation Runner (Standalone)

1. Double-click the .exe file - it will extract and run automatically.
2. This bundle includes a portable Node, node_modules and Playwright browsers.
3. If antivirus blocks execution, extract the archive manually and run run.bat.

'@ | Out-File -FilePath $readmeSrc -Encoding UTF8
}
Copy-Item -Path $readmeSrc -Destination $bundle -Force

# Create 7z archive with faster compression
$archive = Join-Path $root "my-package.7z"
if (Test-Path $archive) { Remove-Item $archive -Force }
Write-Host "Creating 7z archive (this may take a while for large files)..."
& $SevenZipExe a -t7z -mx1 $archive (Join-Path $bundle '*') | Out-Null
Write-Host "Created archive:" $archive

# Create SFX config
$isGuiSfx = $SfxModule -match "7zS"
if ($isGuiSfx) {
  # GUI SFX config (7zS.sfx or 7zSD.sfx)
  $config = @"
;!@Install@!UTF-8!
Title="Playwright Automation - Standalone"
BeginPrompt="This will extract and run the Playwright automation. Continue?"
ExtractDialogText="Extracting files, please wait..."
ExtractPathText="Extract to:"
ExtractTitle="Extracting Playwright Automation"
GUIMode="1"
OverwriteMode="2"
ExecuteFile="run.bat"
ExecuteParameters=""
;!@InstallEnd@!
"@
} else {
  # Console SFX config (7z.sfx) - simpler, no auto-run
  $config = @"
;!@Install@!UTF-8!
Title="Playwright Automation - Standalone"
BeginPrompt="This package will extract to the current folder and run the test. Continue?"
RunProgram="run.bat"
;!@InstallEnd@!
"@
  Write-Warning "Using console SFX (7z.sfx). The executable will extract files but may not auto-run."
  Write-Warning "For better auto-run support, install 7-Zip with GUI SFX modules (7zS.sfx)."
}

$configFile = Join-Path $root "sfx_config.txt"
$config | Out-File -FilePath $configFile -Encoding UTF8 -NoNewline

# Create final SFX
$outPath = Join-Path $root $OutName
if (Test-Path $outPath) { Remove-Item $outPath -Force }

Write-Host "Building SFX executable..."

try {
  # Method 1: Using file streams for large files
  $tempSfx = Join-Path $root "temp_combined.exe"
  
  # Copy SFX module as base
  Copy-Item $SfxModule -Destination $tempSfx -Force
  
  # Append config and archive
  $configBytes = [System.IO.File]::ReadAllBytes($configFile)
  $archiveBytes = [System.IO.File]::ReadAllBytes($archive)
  
  $stream = [System.IO.File]::Open($tempSfx, [System.IO.FileMode]::Append)
  $stream.Write($configBytes, 0, $configBytes.Length)
  $stream.Write($archiveBytes, 0, $archiveBytes.Length)
  $stream.Close()
  
  Move-Item $tempSfx -Destination $outPath -Force
  
  Write-Host "Created SFX successfully!" -ForegroundColor Green
}
catch {
  Write-Warning "Stream method failed: $($_.Exception.Message)"
  Write-Host "Trying CMD copy method..."
  
  # Fallback: Use CMD copy /b for binary concatenation
  $cmdCopy = "copy /b `"$SfxModule`"+`"$configFile`"+`"$archive`" `"$outPath`""
  cmd /c $cmdCopy 2>&1 | Out-Null
  
  if (Test-Path $outPath) {
    Write-Host "Created SFX using CMD copy!" -ForegroundColor Green
  }
  else {
    Write-Error "Failed to create SFX with both methods."
    exit 1
  }
}

# Verify the file was created
if (-not (Test-Path $outPath)) {
  Write-Error "SFX file was not created. Check for errors above."
  exit 1
}

$fileSize = (Get-Item $outPath).Length / 1MB
Write-Host "Final size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan

Write-Host "Cleaning up temporary files..."
Remove-Item $bundle -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $archive -Force -ErrorAction SilentlyContinue
Remove-Item $configFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "SUCCESS! Created: $OutName" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To use:"
Write-Host "  1. Share '$OutName' with recipients"
Write-Host "  2. When they double-click it:"
if ($isGuiSfx) {
  Write-Host "     - It will show extraction dialog"
  Write-Host "     - Extract files to chosen location"
  Write-Host "     - Automatically run run.bat"
} else {
  Write-Host "     - It will ask for extraction location"
  Write-Host "     - Extract files"
  Write-Host "     - They may need to manually run run.bat"
}
Write-Host ""