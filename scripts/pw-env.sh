# Source before running Playwright on this machine (no root): local copies of the browsers' missing system libs.
#   Chromium: libnss3/libnspr4/libasound2 in ~/.local/opt/chromelibs/root (unchanged; first on the path).
#   Firefox:  needs nothing extra (it loads its own NSS from its own directory).
#   WebKit:   ~40 libs (GTK 4, GStreamer base/bad, libsoup 3, AVIF/dav1d, ...) in ~/.local/opt/pwlibs/root, which
#             holds no library the system has, so nothing Chromium loads changes (docs/qa/r3-xbrowser.md).
export LD_LIBRARY_PATH="$HOME/.local/opt/chromelibs/root/usr/lib/x86_64-linux-gnu:$HOME/.local/opt/chromelibs/root/usr/lib/x86_64-linux-gnu/nss:$HOME/.local/opt/pwlibs/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# WebKit only: Playwright's pre-launch check looks for two dlopen()ed libs (libGLESv2.so.2, libx264.so) in the system's
# ldconfig cache, which a user cannot extend, so it would refuse to launch WebKit. The check changes nothing about how
# a browser runs (it prints one "Skipping host requirements validation" line per launch).
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

# WebKit only: its bundle's MiniBrowser wrapper *replaces* LD_LIBRARY_PATH with its own lib dirs, so the libs above
# would never reach it. Make it append the inherited path instead (idempotent; redone after `npx playwright install
# webkit` brings a new build).
for _tsp_mb in "$HOME"/.cache/ms-playwright/webkit-*/minibrowser-*/MiniBrowser; do
  if [ -f "$_tsp_mb" ] && grep -qxF 'export LD_LIBRARY_PATH="${MYDIR}/lib:${MYDIR}/sys/lib"' "$_tsp_mb"; then
    sed -i 's|^export LD_LIBRARY_PATH="\${MYDIR}/lib:\${MYDIR}/sys/lib"$|export LD_LIBRARY_PATH="${MYDIR}/lib:${MYDIR}/sys/lib${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"|' "$_tsp_mb" \
      && echo "pw-env: $_tsp_mb now keeps the inherited LD_LIBRARY_PATH" >&2
  fi
done
unset _tsp_mb
