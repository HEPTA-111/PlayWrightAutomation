Playwright Automation Project

This project contains automated scripts running on Playwright. It uses a custom launcher (launcher.js) and requires a specific local browser setup to function correctly.

📋 Prerequisites

Before setting up the project on a new machine, ensure you have:

Node.js: Download and install the LTS version from nodejs.org.

Git: Download and install from git-scm.com.

VS Code (Optional but recommended): For editing the code.

🚀 Installation & Setup (Windows)

Follow these steps exactly to avoid configuration errors.

1. Clone the Repository

Open PowerShell or your terminal and run:

git clone <YOUR_REPO_URL_HERE>
cd PlayWrightAutomation


2. Install Dependencies

IMPORTANT: Do NOT run npm init. This will overwrite the configuration.
Simply run:

npm install


3. Install Portable Browsers (CRITICAL STEP)

This project is configured to run off a local my-browsers folder, not the global computer installation. You must run the following command to download Chromium and necessary dependencies (WinLDD, FFmpeg) directly into the project folder.

Copy and paste this entire block into PowerShell:

# Set download path to the local project folder
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\my-browsers"

# Install Chromium and required Windows dependencies
npx playwright install chromium winldd ffmpeg


Note: This download may take a few minutes (approx 150MB+).

▶️ Running the Automation

To start the custom GUI launcher:

node launcher.js


From here, you can select your process using the User Interface.

🛠️ Troubleshooting

Error: "Executable doesn't exist at ...\my-browsers..."

Cause: The browser files are missing from the project folder or are the wrong version.
Fix: Delete the my-browsers folder and re-run the Step 3 command block above.

Error: "Project(s) 'chromium' not found"

Cause: The playwright.config.ts or package.json files were overwritten (usually by running npm init).
Fix: Revert the changes to the original code:

git checkout .


Error: "Bundled 'my-browsers' folder not found"

Cause: You cloned the repo but haven't downloaded the browsers yet (Git usually ignores the browser folder because it is too large).
Fix: Run Step 3 to download them.

📂 Project Structure

launcher.js: The main entry point for the automation tool.

tests/: Contains the actual scrape/automation logic files.

my-browsers/: Local storage for the Chromium browser (created during setup).

playwright.config.ts: Configuration settings for the browser engine.

selection.json: Stores the user's last choice from the UI.