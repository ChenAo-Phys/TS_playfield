# Source before running Playwright on this machine (no root): local copies of Chromium's system libs.
export LD_LIBRARY_PATH="$HOME/.local/opt/chromelibs/root/usr/lib/x86_64-linux-gnu:$HOME/.local/opt/chromelibs/root/usr/lib/x86_64-linux-gnu/nss${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
