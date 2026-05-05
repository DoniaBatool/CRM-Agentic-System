#!/usr/bin/env bash
# Force-stop browsers launched by Playwright (Ayla / Echo / workflow export).
# Safe: targets only Playwright cache paths in the process command line, not your normal Chrome profile.

set +e
echo "Stopping Playwright-controlled Chromium processes..."

# Bundled Chromium (macOS path contains chrome-mac/Chromium or ms-playwright/chromium)
pkill -f "ms-playwright/chromium" 2>/dev/null
pkill -f "chrome-mac/Chromium" 2>/dev/null
pkill -f "chromium_headless_shell" 2>/dev/null

echo "Done."
echo ""
echo "If a window is STILL stuck:"
echo "  • macOS: Activity Monitor → search 'Chromium' or 'Chrome' → Force Quit"
echo "  • Or: Cmd+Option+Esc → pick the frozen app → Force Quit"
echo ""
echo "Note: If you set PLAYWRIGHT_SURVEY_BROWSER=chrome, Playwright uses Google Chrome;"
echo "      Force Quit may close all Chrome windows (save work in other tabs first)."
