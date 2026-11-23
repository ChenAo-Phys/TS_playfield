/* Mobile-clarity mockup renderer. Plain JS so the page works from file:// (no build, no server).
   URL params: ?lang=en|zh  &state=influence|card|coup|ai|headline|scoring|over  &focus=auto|world */
(function () {
  "use strict";
  const Q = new URLSearchParams(location.search);
  const LANG = Q.get("lang") === "zh" ? "zh" : "en";
  const STATE = Q.get("state") || "influence";
  // "compact" = phone portrait or a short landscape screen: one-handed layout, smart map focus, bottom sheets
  const PHONE = matchMedia("(max-width: 699px), (max-height: 500px) and (orientation: landscape)").matches;
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
  const C = window.MC_COUNTRIES;
  const CARDS = window.MC_CARDS;
  const byId = (id) => C[id];
  const IMG = (id) => `../../public/cards/${LANG}/${String(id).padStart(3, "0")}.webp`;
  const L = (en, zh) => (LANG === "zh" ? zh : en);
  const cname = (id, short) => { const c = byId(id); return LANG === "zh" ? (short ? c.zhS : c.zh) : (short ? c.enS : c.en); };
  const card = (id) => (LANG === "zh" ? CARDS[id].zh : CARDS[id].en);
  const SIDE = { US: L("US", "美国"), USSR: L("USSR", "苏联") };

  // ───────────────────────────── icons & glyphs ─────────────────────────────
  const SYMBOLS = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <symbol id="g-us" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.2l2.7 6.3 6.8.6-5.2 4.5 1.6 6.7L12 16.7l-5.9 3.6 1.6-6.7-5.2-4.5 6.8-.6z"/></symbol>
    <symbol id="g-ussr" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round"><path d="M7.1 16.1A7.1 7.1 0 1 0 9 4.6" stroke-width="2.5"/><path d="M7.1 16.1 3.6 19.8" stroke-width="3.2"/><path d="M9.6 9.6 19.4 19.4" stroke-width="2.7"/></g><path fill="currentColor" d="M10.2 4.4 13 7.2 7.2 13 4.4 10.2z"/></symbol>
    <symbol id="i-undo" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></symbol>
    <symbol id="i-list" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M12 5v14M5 12h14"/></symbol>
    <symbol id="i-minus" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M5 12h14"/></symbol>
    <symbol id="i-fit" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></symbol>
    <symbol id="i-gear" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" stroke-linecap="round"/></g></symbol>
    <symbol id="i-menu" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"/></symbol>
    <symbol id="i-book" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></symbol>
    <symbol id="i-tap" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 10.5V9a1.5 1.5 0 0 1 3 0v2M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.3 15.4a1.6 1.6 0 0 1 2.4-2.1L9 15.6"/></g></symbol>
    <symbol id="i-warn" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5 1.8 20.5h20.4zM11 9h2v6h-2zm0 7.5h2v2h-2z"/></symbol>
    <symbol id="i-info" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9.2"/><path d="M12 11v6M12 7.2v.1" stroke-linecap="round"/></g></symbol>
    <symbol id="i-inf" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8v8M8 12h8" stroke-linecap="round"/></g></symbol>
    <symbol id="i-coup" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 1.8v4M12 18.2v4M1.8 12h4M18.2 12h4"/></g></symbol>
    <symbol id="i-realign" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/></symbol>
    <symbol id="i-event" viewBox="0 0 24 24"><path fill="currentColor" d="M13.5 2 4 13.5h6.5L9 22l10-12h-6.6z"/></symbol>
    <symbol id="i-space" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5c3.5 2.6 5 6.3 4.4 11.2l-2 2.4H9.6l-2-2.4C7 8.8 8.5 5.1 12 2.5z"/><circle cx="12" cy="9.5" r="1.8"/><path d="M7.7 13.6 4.5 16.5l3.6.5M16.3 13.6l3.2 2.9-3.6.5M10.5 18.6 12 21.5l1.5-2.9" stroke-linecap="round"/></g></symbol>
    <symbol id="i-chev" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m9 5 7 7-7 7"/></symbol>
    <symbol id="i-up" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m5 15 7-7 7 7"/></symbol>
    <symbol id="i-ff" viewBox="0 0 24 24"><path fill="currentColor" d="M3 5.5v13l8.5-6.5zm9 0v13l8.5-6.5z"/></symbol>
    <symbol id="i-eye" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M1.8 12S5.5 5 12 5s10.2 7 10.2 7-3.7 7-10.2 7S1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3"/></g></symbol>
    <symbol id="i-lock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2.1"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></g></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
  </defs></svg>`;
  const ico = (id, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const glyph = (side, cls = "glyph") => `<svg class="${cls}" style="color:#fff" aria-hidden="true"><use href="#g-${side === "US" ? "us" : "ussr"}"/></svg>`;
  function die(n, color = "#fff", pip = "#111") {
    const P = { 1: [[12, 12]], 2: [[7.5, 7.5], [16.5, 16.5]], 3: [[7, 7], [12, 12], [17, 17]], 4: [[7.5, 7.5], [16.5, 7.5], [7.5, 16.5], [16.5, 16.5]], 5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]], 6: [[7.5, 6.5], [16.5, 6.5], [7.5, 12], [16.5, 12], [7.5, 17.5], [16.5, 17.5]] };
    return `<svg class="die" viewBox="0 0 24 24" aria-label="die ${n}"><rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="${color}" stroke="rgba(0,0,0,.35)"/>${P[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.1" fill="${pip}"/>`).join("")}</svg>`;
  }

  // ───────────────────────────── scenario ─────────────────────────────
  // Turn 4, Mid War, US (human) is in Action Round 3 playing Shuttle Diplomacy for 3 Ops of Influence; 1 placed in Iran.
  const INF = {
    0: [2, 0], 1: [5, 0], 5: [0, 1], 6: [3, 0], 7: [4, 0], 8: [1, 1], 10: [3, 1], 11: [2, 0], 12: [0, 1], 13: [0, 1],
    14: [0, 4], 15: [0, 4], 16: [0, 3], 17: [0, 3], 18: [0, 1], 19: [0, 3], 20: [0, 2],
    21: [0, 1], 22: [0, 2], 23: [2, 0], 24: [0, 3], 25: [1, 0], 28: [2, 0], 29: [1, 2], 30: [0, 2],
    31: [0, 2], 32: [2, 0], 33: [1, 1], 34: [0, 1], 36: [2, 0], 37: [0, 2], 38: [1, 0], 40: [1, 0], 41: [4, 0], 42: [1, 0], 43: [0, 3], 44: [3, 0], 45: [4, 0],
    47: [0, 2], 53: [1, 0], 54: [0, 1], 57: [0, 1], 59: [2, 0], 63: [1, 2],
    64: [1, 0], 69: [0, 1], 70: [2, 0], 71: [0, 3],
    77: [0, 2], 79: [1, 0], 81: [0, 3], 82: [1, 0],
  };
  const inf = (id) => INF[id] || [0, 0];
  const ctrl = (id) => {
    const [u, s] = inf(id); const st = byId(id).st;
    if (u >= st && u >= s + st) return "US";
    if (s >= st && s >= u + st) return "USSR";
    return null;
  };
  const PLACED_THIS_PLAY = { 25: 1 }; // Iran +1
  const HUMAN = "US";
  // Legal targets for US influence (computed here only to dress the mockup; the real UI reads prompt.countries).
  const legalInfluence = (() => {
    const set = new Set();
    for (const c of C) {
      if (inf(c.id)[0] > 0) { set.add(c.id); c.nb.forEach((n) => set.add(n)); }
      if (c.sp === "US") set.add(c.id);
    }
    return set;
  })();
  const costs2 = (id) => ctrl(id) === "USSR";

  // ───────────────────────────── map ─────────────────────────────
  const W = 104, H = 70;
  const REGION = [
    { key: "eu", en: "Europe", zh: "欧洲", fill: "var(--rg-we)", land: "#e2daf0", chip: [1115, 88], net: ["even", 0] },
    { key: "as", en: "Asia", zh: "亚洲", fill: "var(--rg-as)", land: "#f6dcb9", chip: [1840, 655], net: ["US", 7] },
    { key: "me", en: "Middle East", zh: "中东", fill: "var(--rg-me)", land: "#d4ebf3", chip: [1640, 880], net: ["USSR", 7] },
    { key: "af", en: "Africa", zh: "非洲", fill: "var(--rg-af)", land: "#f2ead0", chip: [950, 1040], net: ["even", 0], hold: 79 },
    { key: "ca", en: "Central America", zh: "中美洲", fill: "var(--rg-ca)", land: "#e5ebcc", chip: [600, 655], net: ["USSR", 1] },
    { key: "sa", en: "South America", zh: "南美洲", fill: "var(--rg-sa)", land: "#d5e6c9", chip: [300, 1335], net: ["USSR", 4] },
    { key: "sea", en: "Southeast Asia", zh: "东南亚", fill: "var(--rg-sea)", land: "#f6e4b0", chip: [1815, 990], net: ["US", 1] },
  ];
  const bodyFill = (c) => {
    if (c.r === 0) return c.we && c.ee ? "url(#we-ee)" : c.ee ? "var(--rg-ee)" : "var(--rg-we)";
    if (c.r === 1) return c.sea ? "var(--rg-sea)" : "var(--rg-as)";
    return ["", "", "var(--rg-me)", "var(--rg-af)", "var(--rg-ca)", "var(--rg-sa)"][c.r];
  };
  const USA = [262, 520], USSR = [1462, 330];

  function token(side, n, controlled, cx, cy, S) {
    if (!n) return "";
    const s = S.tok, h = s / 2, ch = s * 0.25;
    const fill = controlled ? (side === "US" ? "var(--us-700)" : "var(--ussr-600)") : "#fff";
    const stroke = side === "US" ? "var(--us-700)" : "var(--ussr-600)";
    const txt = controlled ? "#fff" : stroke;
    const shape = side === "US"
      ? `<rect x="${cx - h}" y="${cy - h}" width="${s}" height="${s}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`
      : `<path d="M${cx - h + ch} ${cy - h}h${s - 2 * ch}l${ch} ${ch}v${s - 2 * ch}l-${ch} ${ch}h-${s - 2 * ch}l-${ch}-${ch}v-${s - 2 * ch}z" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
    return `${shape}<text x="${cx}" y="${cy + S.num * 0.36}" text-anchor="middle" font-size="${S.num}" font-weight="800" fill="${txt}" class="cond">${n}</text>`;
  }

  // Semantic zoom: L1 = compact (world fit on laptops: short names, oversized numerals),
  // L2 = detail (zoomed in / phone focus). Sizes are in map units (box = 104 x 70).
  const LV = {
    L1: { strip: 27, name: LANG === "zh" ? 23 : 23.5, stab: 19, tok: 37, num: 30, glyphs: false, full: false },
    L2: { strip: 25, name: LANG === "zh" ? 19.5 : 18.5, stab: 17, tok: 35, num: 27, glyphs: true, full: true },
  };
  function countryBox(c, opts) {
    const { mode } = opts;
    const S = LV[opts.lv];
    const STRIP = S.strip;
    const [u, s] = inf(c.id);
    const k = ctrl(c.id);
    const x = c.x - W / 2, y = c.y - H / 2;
    const isTarget = mode.targets && mode.targets.has(c.id);
    const cls = ["cb"];
    if (mode.targets) cls.push(isTarget ? "target" : "dim");
    if (mode.selected === c.id) cls.push("selected");
    if (mode.flash && mode.flash.has(c.id)) cls.push("flash");
    const name = cname(c.id, !S.full);
    const maxName = W - 10;
    const est = [...name].reduce((a, ch) => a + (/[　-鿿＀-￯]/.test(ch) ? S.name * 1.02 : S.name * 0.5), 0);
    const squeeze = est > maxName ? ` textLength="${maxName}" lengthAdjust="spacingAndGlyphs"` : "";
    const strip = c.bg ? "var(--strip-bg)" : "var(--strip-plain)";
    const nameFill = c.bg ? "#fff" : "#1d2430";
    const frameColor = k === "US" ? "var(--us-700)" : k === "USSR" ? "var(--ussr-600)" : null;
    let g = `<g class="${cls.join(" ")}" data-id="${c.id}" transform="translate(${x} ${y})" role="${isTarget ? "button" : "img"}" aria-label="${c.en}">`;
    if (isTarget) g += `<rect class="tglow" x="-6" y="-6" width="${W + 12}" height="${H + 12}" rx="11"/><rect class="tring" x="-6" y="-6" width="${W + 12}" height="${H + 12}" rx="11"/>`;
    if (mode.flash && mode.flash.has(c.id)) g += `<rect x="-9" y="-9" width="${W + 18}" height="${H + 18}" rx="13" fill="none" stroke="var(--ussr-600)" stroke-width="7"/><rect class="pulse" x="-9" y="-9" width="${W + 18}" height="${H + 18}" rx="13" fill="none" stroke="var(--ussr-600)" stroke-width="5" style="transform-box:fill-box;transform-origin:center"/>`;
    g += `<rect x="1.5" y="3" width="${W}" height="${H}" rx="6" fill="rgba(0,0,0,.28)"/>`;
    g += `<rect width="${W}" height="${H}" rx="6" fill="${bodyFill(c)}" stroke="#1d2430" stroke-width="1.6"/>`;
    g += `<path d="M0 6a6 6 0 0 1 6-6h${W - 12}a6 6 0 0 1 6 6v${STRIP - 6}H0z" fill="${strip}"/>`;
    g += `<line x1="0" y1="${STRIP}" x2="${W}" y2="${STRIP}" stroke="#1d2430" stroke-width="1.2"/>`;
    g += `<text x="5" y="${STRIP - (STRIP - S.name * 0.7) / 2}" font-size="${S.name}" font-weight="${c.bg ? 750 : 700}" fill="${nameFill}" class="cond"${squeeze}>${name}</text>`;
    const cy = STRIP + (H - STRIP) / 2;
    g += `<line x1="${W / 2}" y1="${STRIP + 3}" x2="${W / 2}" y2="${H - 3}" stroke="#1d2430" stroke-opacity=".45" stroke-width="1.4" stroke-dasharray="4 4"/>`;
    // stability sits between the two sides: "US | stability | USSR" is the control comparison
    const sr = S.stab * 0.62;
    g += `<circle cx="${W / 2}" cy="${cy}" r="${sr}" fill="${c.bg ? "var(--strip-bg)" : "var(--stab-plain)"}" stroke="#1d2430" stroke-width="1.4"/>`;
    g += `<text x="${W / 2}" y="${cy + S.stab * 0.36}" text-anchor="middle" font-size="${S.stab}" font-weight="800" fill="${c.bg ? "#fff" : "#1d2430"}" class="cond">${c.st}</text>`;
    if (S.glyphs && !u) g += `<use href="#g-us" x="${W / 2 - 37}" y="${cy - 7}" width="14" height="14" style="color:#1d2430" opacity=".18"/>`;
    if (S.glyphs && !s) g += `<use href="#g-ussr" x="${W / 2 + 23}" y="${cy - 7}" width="14" height="14" style="color:#1d2430" opacity=".18"/>`;
    g += token("US", u, k === "US", W / 2 - 30, cy, S);
    g += token("USSR", s, k === "USSR", W / 2 + 30, cy, S);
    if (frameColor) g += `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="5" fill="none" stroke="${frameColor}" stroke-width="4"/>`;
    if (PLACED_THIS_PLAY[c.id] && mode.kind === "influence") g += `<g transform="translate(${W / 2 - 13} ${STRIP + 6})"><circle r="11" fill="var(--act-500)" stroke="#1d2430" stroke-width="1.6"/><text y="5" text-anchor="middle" font-size="14" font-weight="800" fill="#1d1400" class="cond">+${PLACED_THIS_PLAY[c.id]}</text></g>`;
    if (isTarget && mode.kind === "influence" && costs2(c.id)) g += `<g transform="translate(-9 ${H - 12})"><rect width="${LANG === "zh" ? 40 : 46}" height="24" rx="6" fill="var(--act-500)" stroke="#1d2430" stroke-width="1.6"/><text x="${LANG === "zh" ? 20 : 23}" y="17.5" text-anchor="middle" font-size="16" font-weight="800" fill="#1d1400" class="cond">2 ${L("OPS", "点")}</text></g>`;
    if (isTarget && mode.odds && mode.odds[c.id] != null) g += `<g transform="translate(${W - 36} ${H - 13})"><rect width="48" height="26" rx="7" fill="#1d2430"/><text x="24" y="19" text-anchor="middle" font-size="17" font-weight="800" fill="#fff" class="cond">${mode.odds[c.id]}%</text></g>`;
    if (mode.selected === c.id) g += `<g transform="translate(${W / 2} -34)"><circle r="20" fill="#1d2430"/><use href="#i-coup" x="-14" y="-14" width="28" height="28" style="color:var(--act-500)"/></g>`;
    g += `<rect class="hit" x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="transparent"/>`;
    return g + `</g>`;
  }

  function landBlobs() {
    // Placeholder continents: metaball blobs per region tint (the map agent replaces these with real geography).
    const pts = { us: [], ussr: [], eu: [], me: [], as: [], sea: [], af: [], ca: [], sa: [], cn: [] };
    for (const c of C) {
      const key = c.r === 0 ? "eu" : c.r === 1 ? (c.sea ? "sea" : "as") : ["", "", "me", "af", "ca", "sa"][c.r];
      pts[key].push([c.x, c.y, 92]);
    }
    const add = (k, arr, r) => arr.forEach(([x, y]) => pts[k].push([x, y, r]));
    add("us", [[120, 430], [230, 410], [350, 420], [470, 470], [160, 540], [300, 560], [420, 570], [560, 420], [600, 340]], 110);
    add("eu", [[330, 250], [460, 240], [560, 200], [620, 290], [500, 150], [380, 140], [1000, 470], [1120, 610]], 95);
    add("ussr", [[1380, 230], [1500, 200], [1640, 180], [1800, 170], [1960, 170], [2120, 180], [2280, 200], [1560, 340], [1720, 330], [1900, 320], [2080, 340], [2260, 360], [1430, 420], [2360, 280]], 125);
    add("cn", [[1850, 470], [2000, 470], [2100, 560], [1960, 600], [1830, 580], [2080, 680]], 105);
    add("as", [[1760, 860], [1700, 820], [2150, 1180], [2250, 1220], [2100, 1250], [2260, 1140], [2340, 630], [2290, 720]], 95);
    add("af", [[1000, 720], [1150, 800], [1200, 900], [1300, 980], [1200, 1060], [1130, 1200], [1250, 1300], [1320, 1180], [1420, 1030], [960, 860], [1080, 1080]], 105);
    add("me", [[1530, 760], [1420, 820], [1600, 700]], 90);
    add("sa", [[620, 980], [650, 1170], [560, 1300], [470, 1330], [440, 1180], [700, 1020], [560, 1440]], 95);
    add("ca", [[300, 700], [470, 790]], 80);
    const tint = { us: "var(--land-us)", ussr: "var(--land-ussr)", cn: "#f3d2b4", eu: "#e2daf0", me: "#d2e9f2", as: "#f6dcba", sea: "#f6e6b6", af: "#f1e8cc", ca: "#e4eacb", sa: "#d6e7cb" };
    const order = ["us", "ussr", "cn", "eu", "af", "me", "as", "sea", "ca", "sa"];
    return order.map((k) => `<g filter="url(#goo)" fill="${tint[k]}">${pts[k].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`).join("");
  }

  function connections() {
    let s = "";
    const done = new Set();
    for (const c of C) {
      for (const n of c.nb) {
        const key = c.id < n ? `${c.id}-${n}` : `${n}-${c.id}`;
        if (done.has(key)) continue; done.add(key);
        const d = byId(n);
        const inter = c.r !== d.r;
        s += `<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" ${inter ? 'stroke="#b3261e" stroke-width="4.5" stroke-dasharray="9 7"' : 'stroke="#1d2430" stroke-opacity=".5" stroke-width="2.6"'}/>`;
      }
      if (c.sp === "US" && c.id !== 45) s += `<line x1="${c.x}" y1="${c.y}" x2="${USA[0]}" y2="${USA[1]}" stroke="var(--us-700)" stroke-width="7" stroke-opacity=".75"/>`;
      if (c.sp === "USSR") s += `<line x1="${c.x}" y1="${c.y}" x2="${USSR[0]}" y2="${USSR[1]}" stroke="var(--ussr-600)" stroke-width="7" stroke-opacity=".7"/>`;
    }
    // Japan wraps to the USA (board: "To USA" / "To Japan")
    const j = byId(45);
    s += `<path d="M${j.x + 50} ${j.y} H2410" stroke="var(--us-700)" stroke-width="7" stroke-opacity=".75" fill="none"/><path d="M2398 ${j.y - 12} l18 12 -18 12z" fill="var(--us-700)"/>`;
    s += `<text x="2405" y="${j.y + 34}" text-anchor="end" font-size="20" font-weight="700" fill="var(--us-900)" class="cond">${L("to USA", "通往美国")}</text>`;
    s += `<path d="M${USA[0] - 95} ${USA[1]} H44" stroke="var(--us-700)" stroke-width="7" stroke-opacity=".75" fill="none"/><path d="M56 ${USA[1] - 12} l-18 12 18 12z" fill="var(--us-700)"/>`;
    s += `<text x="48" y="${USA[1] + 34}" font-size="20" font-weight="700" fill="var(--us-900)" class="cond">${L("to Japan", "通往日本")}</text>`;
    return s;
  }

  function superpower(side, [x, y]) {
    const us = side === "US";
    const w = us ? 190 : 210, h = 74;
    return `<g transform="translate(${x - w / 2} ${y - h / 2})">
      <rect x="2" y="4" width="${w}" height="${h}" rx="16" fill="rgba(0,0,0,.25)"/>
      <rect width="${w}" height="${h}" rx="16" fill="${us ? "var(--us-700)" : "var(--ussr-600)"}" stroke="#1d2430" stroke-width="2"/>
      <use href="#g-${us ? "us" : "ussr"}" x="14" y="${h / 2 - 20}" width="40" height="40" style="color:#fff"/>
      <text x="${w / 2 + 22}" y="${h / 2 + 12}" text-anchor="middle" font-size="36" font-weight="900" fill="#fff" class="cond" letter-spacing="2">${us ? L("USA", "美国") : L("USSR", "苏联")}</text></g>`;
  }

  function regionChip(R, i, lv) {
    const [cx, cy] = R.chip;
    const big = lv === "L1";
    const k = big ? 1.22 : 1;
    const w = (R.key === "ca" || R.key === "sa" || R.key === "sea" || R.key === "me" ? 196 : 164) * k, h = 66 * k;
    const [side, v] = R.net;
    const col = side === "US" ? "var(--us-700)" : side === "USSR" ? "var(--ussr-600)" : "#5a6474";
    const txt = side === "even" ? L("Even", "持平") : `${SIDE[side]} +${v}`;
    let g = `<g class="region-chip" transform="translate(${cx - w / 2} ${cy - h / 2})">
      <rect x="1.5" y="3" width="${w}" height="${h}" rx="12" fill="rgba(0,0,0,.22)"/>
      <rect width="${w}" height="${h}" rx="12" fill="#fbfaf6" stroke="#1d2430" stroke-width="1.8"/>
      <rect width="12" height="${h}" rx="6" fill="${R.fill}" stroke="#1d2430" stroke-width="1.2"/>
      <text x="22" y="${25 * k}" font-size="${(LANG === "zh" ? 21 : 19) * k}" font-weight="800" fill="#1d2430" class="cond" letter-spacing="${LANG === "zh" ? 0 : 1}">${(LANG === "zh" ? R.zh : R.en).toUpperCase()}</text>
      <text x="22" y="${52 * k}" font-size="${(LANG === "zh" ? 17 : 16) * k}" font-weight="600" fill="#5a6474" class="cond">${L("if scored", "若计分")}</text>
      <text x="${w - 12}" y="${53 * k}" text-anchor="end" font-size="${23 * k}" font-weight="900" fill="${col}" class="cond">${txt}</text>`;
    if (R.hold) g += `<g transform="translate(${w - 30} -14)"><rect width="30" height="40" rx="5" fill="url(#hold-${R.hold})" stroke="var(--act-500)" stroke-width="4"/></g>`;
    return g + `</g>`;
  }

  function buildMap(mode) {
    const defs = `<defs>
      <filter id="goo" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="30"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 36 -16"/></filter>
      <pattern id="we-ee" patternUnits="userSpaceOnUse" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="var(--rg-we)"/><path d="M${W} 0V${H}H0z" fill="var(--rg-ee)"/></pattern>
      <pattern id="grid" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M120 0H0V120" fill="none" stroke="var(--paper-ocean-line)" stroke-width="1.5"/></pattern>
      ${REGION.filter((r) => r.hold).map((r) => `<pattern id="hold-${r.hold}" width="1" height="1" patternContentUnits="objectBoundingBox"><image href="${IMG(r.hold)}" width="1" height="1" preserveAspectRatio="xMidYMid slice"/></pattern>`).join("")}
    </defs>`;
    let s = defs + `<rect x="-400" y="-400" width="3300" height="2400" fill="var(--paper-ocean)"/><rect x="-400" y="-400" width="3300" height="2400" fill="url(#grid)"/>`;
    s += `<g opacity=".95">${landBlobs()}</g>`;
    // subregion labels
    s += `<text x="700" y="455" font-size="23" font-style="italic" font-weight="700" fill="#4b3f78" class="cond">${L("Western Europe", "西欧")}</text>`;
    s += `<text x="1240" y="228" font-size="23" font-style="italic" font-weight="700" fill="#4b3f78" class="cond">${L("Eastern Europe", "东欧")}</text>`;
    s += `<text x="1760" y="1036" font-size="21" font-style="italic" font-weight="700" fill="#7a5a00" class="cond">${L("subregion of Asia", "亚洲子区域")}</text>`;
    s += `<g>${connections()}</g>`;
    s += superpower("US", USA) + superpower("USSR", USSR);
    s += `<g>${REGION.map((R, i) => regionChip(R, i, mode.lv)).join("")}</g>`;
    // non-targets first so targets (and their rings) draw on top
    const ordered = [...C].sort((a, b) => (mode.targets ? (mode.targets.has(a.id) ? 1 : 0) - (mode.targets.has(b.id) ? 1 : 0) : 0) || (mode.selected === a.id ? 1 : 0) - (mode.selected === b.id ? 1 : 0));
    s += ordered.map((c) => countryBox(c, { mode, lv: mode.lv })).join("");
    return s;
  }

  // ───────────────────────────── chrome pieces ─────────────────────────────
  function brandMark() {
    return `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="bm"><circle cx="16" cy="16" r="14"/></clipPath></defs>
      <g clip-path="url(#bm)"><rect width="16" height="32" fill="var(--us-600)"/><rect x="16" width="16" height="32" fill="var(--ussr-600)"/>
      <path d="M2 16h28M16 2c-5 4-5 24 0 28M16 2c5 4 5 24 0 28M4 9h24M4 23h24" stroke="rgba(255,255,255,.55)" stroke-width="1.3" fill="none"/></g>
      <circle cx="16" cy="16" r="14" fill="none" stroke="#fff" stroke-width="2"/></svg>`;
  }

  function tracksHTML() {
    const dc = [5, 4, 3, 2, 1].map((d) => `<div class="cell ${d === 3 ? "on" : ""}" style="${d === 3 ? `background:var(--defcon-${d});color:var(--defcon-${d}-ink)` : ""}">${d}</div>`).join("");
    const vpPos = 50 - (3 / 20) * 50; // US is LEFT
    const ticks = [-20, -10, 0, 10, 20].map((v) => `<i class="tick" style="left:${50 - v * 2.5}%"></i>`).join("");
    const ar = [1, 2, 3, 4, 5, 6, 7].map((a) => `<div class="cell ${a < 3 ? "ussr-done us-done" : a === 3 ? "ussr-done us-now" : ""}"><span>${a}</span></div>`).join("");
    const turn = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => `<div class="cell ${t <= 3 ? "early" : t <= 7 ? "mid" : "late"} ${t < 4 ? "past" : t === 4 ? "now" : ""}">${t}</div>`).join("");
    const pips = (n, of, cls) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? "f" : ""}"></i>`).join("");
    return `<div class="tracks" role="group" aria-label="${L("Game tracks", "轨道")}">
      <div class="trk defcon"><div class="trk-label">DEFCON <b>3</b></div><div class="cells">${dc}</div></div>
      <div class="trk"><div class="trk-label">${L("Victory points", "胜利点数")} <b style="color:var(--us-400)">${L("US +3", "美国 +3")}</b></div>
        <div class="vpbar" aria-label="VP US +3"><div class="rail"></div>${ticks}<div class="mark" style="left:${vpPos}%">+3</div></div></div>
      <div class="trk turn"><div class="trk-label">${L("Turn", "回合")} <b>4/10 · ${L("Mid War", "战争中期")}</b></div><div class="cells">${turn}</div></div>
      <div class="trk ar"><div class="trk-label">${L("Action round", "行动轮")} <b>3/7</b></div><div class="cells">${ar}</div></div>
      <div class="trk milops"><div class="trk-label">${L("Mil. ops", "军事行动")} <b>${L("need 3", "需 3")}</b></div>
        <div class="pips us"><span class="who">${L("US", "美国")}</span>${pips(2, 5)}<span>2</span></div>
        <div class="pips ussr"><span class="who">${L("USSR", "苏联")}</span>${pips(0, 5)}<span>0</span><span class="warnchip" title="short by 3">▼3</span></div></div>
      <div class="trk space"><div class="trk-label">${L("Space", "太空")} <b>${L("next: 2 Ops · 1–4", "下次：2点·1–4")}</b></div>
        <div class="pips us"><span class="who">${L("US", "美国")}</span>${pips(3, 8)}</div>
        <div class="pips ussr"><span class="who">${L("USSR", "苏联")}</span>${pips(2, 8)}</div></div>
    </div>`;
  }

  function statusHTML() {
    return `<div id="status">
      <div class="pill"><span class="sq" style="background:var(--defcon-3);color:var(--defcon-3-ink)">3</span><span class="v"><small>DEFCON</small><span class="restr">${L("no coups EU·AS", "禁政变 欧·亚")}</span></span></div>
      <div class="pill"><span class="sq" style="background:var(--us-700)"><svg width="18" height="18" style="color:#fff"><use href="#g-us"/></svg></span><span class="v"><small>VP</small>+3</span></div>
      <div class="pill"><span class="v"><small>${L("Turn · AR", "回合·行动轮")}</small>4 · 3/7</span></div>
      <div class="pill xtra"><span class="v"><small>${L("Mil. ops · need 3", "军事行动 · 需 3")}</small>${L("US 2 · USSR 0", "美 2 · 苏 0")} <span style="color:var(--warn-500)">▼3</span></span></div>
      <div class="pill xtra"><span class="v"><small>${L("Space race", "太空竞赛")}</small>${L("US 3 · USSR 2", "美 3 · 苏 2")}</span></div>
      <button class="icon-btn menu-dot" aria-label="${L("Menu, tracks and log (USSR short of military ops)", "菜单、轨道与记录（苏联军事行动不足）")}">${ico("i-menu")}</button>
    </div>`;
  }

  function oppHTML(stateTxt, live) {
    const known = 38;
    return `<section class="opp" aria-label="${L("Opponent", "对手")}">
      <div class="avatar">${glyph("USSR")}</div>
      <div class="opp-name">${L("USSR · DeepStruggle AI", "苏联 · DeepStruggle AI")}<small>${L("4 cards in hand · 1 known", "手牌 4 张 · 已知 1 张")}</small></div>
      <div class="opp-state"><span class="dot ${live ? "live" : ""}"></span>${stateTxt}</div>
      <div class="who-compact">${L("USSR · AI", "苏联 · AI")}<small>${stateTxt}</small></div>
      <div class="opp-hand">
        <div class="cback"></div><div class="cback"></div><div class="cback"></div>
        <div class="known" style="background-image:url(${IMG(known)})" title="${card(known)}"></div>
        <div class="label">${L("Known:", "已知：")} <b>${card(known)}</b></div>
        <div class="china-mini"><i style="background-image:url(${IMG(6)})"></i><span>${L("China Card<br>face up", "中国牌<br>正面朝上")}</span></div>
      </div>
    </section>`;
  }

  const LOG = () => [
    { sep: L("Turn 4 · Mid War · DEFCON 3 → 4", "第 4 回合 · 战争中期 · DEFCON 3 → 4") },
    { side: "USSR", when: L("Headline", "头条"), card: 53, mode: L("Event", "事件"), det: [[`${cname(63)} +2`, "ussr"]] },
    { side: "US", when: L("Headline", "头条"), card: 48, mode: L("Event", "事件"), det: [[L("VP +2 → US +6", "VP +2 → 美国 +6"), "vp"]] },
    { side: "USSR", when: L("AR 1", "行动轮 1"), card: 61, mode: L("Event", "事件"), det: [[L("VP −4 → US +2", "VP −4 → 美国 +2"), "vp"]] },
    { side: "US", when: L("AR 1", "行动轮 1"), card: 65, mode: L("Event", "事件"), det: [[`${cname(23)} +1`, "us"], [`${cname(26)} +1`, "us"], [`${cname(29)} +1`, "us"], [L("VP +1 → US +3", "VP +1 → 美国 +3"), "vp"]] },
    { side: "USSR", when: L("AR 2", "行动轮 2"), card: 56, mode: L("Event", "事件"), det: [[`${cname(25)} −1`, "us"], [`${cname(26)} −1`, "us"]] },
    { side: "US", when: L("AR 2", "行动轮 2"), card: 41, mode: L("Coup · 2 Ops", "政变 · 2 点"), det: [[`${die(4)} 4+2 = 6 ${L("vs", "对")} 2 → +4`, ""], [`${cname(59)}: ${L("USSR −2, US +2", "苏联 −2，美国 +2")}`, "us"], ["DEFCON 4 → 3", "vp"]] },
    { side: "USSR", when: L("AR 3", "行动轮 3"), card: 9, mode: L("Event", "事件"), det: [[`${cname(37)} +2`, "ussr"], [L("Effect: +1 Ops in SE Asia this turn", "效果：本回合在东南亚 +1 行动点"), ""]], fresh: true },
    { side: "US", when: L("AR 3 · now", "行动轮 3 · 进行中"), card: 73, mode: L("Influence · 3 Ops", "影响力 · 3 点"), det: [[`${cname(25)} +1`, "us"], [L("2 Ops left", "剩余 2 点"), ""]], live: true },
  ];

  function logHTML() {
    const rows = LOG().map((e) => {
      if (e.sep) return `<div class="log-sep">${e.sep}</div>`;
      const det = e.det.map(([t, k]) => `<span class="chip ${k}">${t}</span>`).join("");
      return `<div class="entry ${e.side.toLowerCase()} ${e.live ? "live" : ""} ${e.fresh ? "fresh" : ""}">
        <div class="glyph-wrap">${glyph(e.side, "")}</div>
        <div><div class="when">${SIDE[e.side]} · ${e.when}</div>
        <div class="main"><span class="cardref">${card(e.card)}</span> <span class="mode">· ${e.mode}</span></div>
        <div class="det">${det}</div></div></div>`;
    }).join("");
    return `<section class="log" aria-label="${L("Game log", "对局记录")}" aria-live="polite">
      <div class="log-head"><span class="eyebrow">${L("Log", "记录")}</span><div class="seg"><button aria-pressed="true">${L("Plays", "出牌")}</button><button aria-pressed="false">${L("All", "全部")}</button></div></div>
      ${rows}</section>`;
  }

  function handHTML(kind) {
    const hand = [79, 74, 60, 47];
    const active = kind === "action-card";
    const cards = hand.map((id) => {
      const m = CARDS[id];
      let tag = "";
      if (m.sc) tag = `<span class="tag scoring">${L("Scoring", "计分牌")}</span>`;
      else if (m.side === "USSR") tag = `<span class="tag opp">${glyph("USSR")}${L("USSR event", "苏联事件")}</span>`;
      const sel = STATE === "card" && id === 60 ? "selected" : "";
      return `<div class="card playable ${sel}" style="background-image:url(${IMG(id)})" role="button" tabindex="0" aria-label="${card(id)}, ${m.ops} Ops">${tag}</div>`;
    }).join("");
    const inplay = kind === "influence" || kind === "coup" ? `<div class="card lift" style="background-image:url(${IMG(73)});transform:translateY(-4px)" aria-label="${card(73)} in play"><span class="tag inplay">${L("In play · 3 Ops", "使用中 · 3 点")}</span></div>` : "";
    const thumbs = hand.map((id) => `<i style="background-image:url(${IMG(id)})"></i>`).join("");
    return `<section id="hand" class="hand ${active ? "active" : "passive"}" aria-label="${L("Your hand", "你的手牌")}">
      <div class="hand-head"><div><div class="eyebrow">${L("Your hand", "你的手牌")}</div><div class="count">4 <span style="font-size:14px;color:var(--ink-300);font-weight:600">${L("cards", "张")}</span></div></div>
        <div class="hand-note">${active ? L("<b>Pick a card</b> to play this round.", "<b>选择一张牌</b>在本行动轮打出。") : (promptKind === "none" ? L("Not your move. Hover a card to read it.", "现在不是你的回合。悬停可阅读。") : L("Cards wait while you <b>finish this play</b>. Hover to read.", "完成本次出牌前手牌暂不可用。悬停可阅读。"))}</div></div>
      <div class="cards">${inplay}${cards}</div>
      <div class="dock-side">
        <div class="eyebrow">${L("In effect", "生效中")}</div>
        <div class="fxlist">
          <span class="fx"><svg class="glyph" style="color:var(--us-400)"><use href="#g-us"/></svg><span class="fxn">${L("NATO", "北约")}</span><em>${L("permanent", "永久")}</em></span>
          <span class="fx"><svg class="glyph" style="color:var(--ussr-400)"><use href="#g-ussr"/></svg><span class="fxn">${L("De Gaulle Leads France", "戴高乐领导法国")}</span><em>${L("permanent", "永久")}</em></span>
          <span class="fx turnfx"><svg class="glyph" style="color:var(--ussr-400)"><use href="#g-ussr"/></svg><span class="fxn">${L("Vietnam Revolts", "越南起义")}</span><em>${L("this turn", "本回合")}</em></span>
        </div>
        <div class="decks"><button>${L("Deck", "抽牌堆")} <b>19</b></button><button>${L("Discard", "弃牌堆")} <b>14</b></button><button>${L("Removed", "已移出")} <b>11</b></button></div>
      </div>
      <div class="handbar"><div class="thumbs">${thumbs}</div><div class="lbl">${L("Your hand · 4", "你的手牌 · 4")}<small>${active ? L("Tap to choose a card", "点按选择一张牌") : L("Not needed right now", "当前无需使用")}</small></div><button class="btn ghost open" style="flex:none;min-height:40px">${ico("i-up")}</button></div>
    </section>`;
  }

  // ───────────────────────────── action panel per prompt ─────────────────────────────
  function recapHTML() {
    return `<div class="recap"><span class="glyph-wrap">${glyph("USSR", "")}</span><span>${L("USSR played", "苏联打出")} <b>${card(9)}</b> · ${L("Event", "事件")} · ${cname(37)} +2</span><span class="more">${ico("i-chev", "")}</span></div>`;
  }
  function youBadge() { return `<span class="youbadge">${glyph("US", "")}${L("Your move", "轮到你")}</span>`; }

  function panelInfluence() {
    return `<section class="panel" aria-label="${L("Your move", "轮到你")}" style="--side-accent:var(--us-600)">
      <div class="grab phone-only"></div>
      ${recapHTML()}
      <div class="who-line">${youBadge()}<div class="crumbs"><span class="desktop-only">${L("AR 3", "行动轮 3")}</span><span class="sep desktop-only">›</span><span>${card(73)}</span><span class="sep">›</span><span class="cur">${L("Influence", "影响力")}</span></div></div>
      <div class="p-title"><h2>${L("Place influence", "放置影响力")}</h2><div class="counter"><b>2</b><span>${L("of 3 Ops<br>left", "/ 3 点<br>剩余")}</span></div></div>
      <div class="opsbar"><i class="used"></i><i class="left"></i><i class="left"></i></div>
      <div class="hint">${ico("i-tap")}<span class="desktop-only">${L(`Click a <b>highlighted</b> country to add 1 US influence. <span class="costkey">2 OPS</span> = USSR-controlled, costs 2.`, `点击<b>高亮</b>国家放置 1 点美国影响力。<span class="costkey">2 点</span> 表示苏联控制，需花费 2 点。`)}</span><span class="phone-only">${L(`Tap a <b>highlighted</b> country (+1 each). <span class="costkey">2 OPS</span> costs 2.`, `点按<b>高亮</b>国家（每次 +1）。<span class="costkey">2 点</span> 需花 2 点。`)}</span></div>
      <div class="actrow"><div class="placed"><span class="chip">${cname(25)} +1</span></div>
      <div class="btns"><button class="btn">${ico("i-undo")}${L("Undo", "撤销")} <span class="kbd desktop-only">Z</span></button><button class="btn phone-only">${ico("i-list")}${L("List", "列表")}</button></div></div>
    </section>`;
  }

  function panelCoup() {
    const faces = [1, 2, 3, 4, 5, 6].map((d) => {
      const net = d + 3 - 6;
      const win = net > 0;
      return `<div class="face ${win ? "win" : ""}">${die(d, win ? "#fff" : "#9badc8")}<small>${win ? `${L("USSR", "苏联")} −${net}` : L("fail", "失败")}</small></div>`;
    }).join("");
    return `<section class="panel" style="--side-accent:var(--us-600)">
      <div class="grab phone-only"></div>
      <div class="who-line">${youBadge()}<div class="crumbs"><span>${L("AR 3", "行动轮 3")}</span><span class="sep">›</span><span>${card(73)}</span><span class="sep">›</span><span class="cur">${L("Coup", "政变")}</span></div></div>
      <div class="p-title"><h2>${L(`Coup in ${cname(24)}?`, `在${cname(24)}发动政变？`)}</h2></div>
      <div class="odds-sum"><span style="color:var(--ink-300);font-size:13px">${L("3 Ops + die vs 2 × stability 3 = 6", "3 点 + 骰子 对比 2 × 稳定度 3 = 6")}</span><b style="color:var(--us-400)">50%</b></div>
      <div class="odds">${faces}</div>
      <dl class="facts"><dt>DEFCON</dt><dd><b>3 → 2</b> ${L("(battleground, even if it fails)", "（战场国，失败也会下降）")}</dd><dt>${L("Mil. ops", "军事行动")}</dt><dd>${L("US 2 → 5 (need 3)", "美国 2 → 5（需 3）")}</dd></dl>
      <div class="warn">${ico("i-warn")}<span>${L("At DEFCON 2, no more coups in the Middle East, Asia or Europe this turn — and a further drop on your turn ends the game.", "DEFCON 降至 2 后，本回合中东、亚洲、欧洲都不能政变；若在你的行动中再降一级，你将输掉游戏。")}</span></div>
      <div class="btns"><button class="btn ghost">${L("Back", "返回")}</button><button class="btn primary big grow2">${ico("i-coup")}${L(`Roll for ${cname(24)}`, `为${cname(24)}掷骰`)} <span class="kbd desktop-only">↵</span></button></div>
    </section>`;
  }

  function panelWaiting() {
    const head = STATE === "headline" ? [L("Headline phase", "头条阶段"), L("Resolving headlines", "正在结算头条")]
      : STATE === "scoring" ? [L("AR 4", "行动轮 4"), L("Middle East scored", "中东已计分")]
      : STATE === "over" ? [L("Turn 8", "第 8 回合"), L("Game over", "对局结束")]
      : [L("AR 4", "行动轮 4"), L("USSR is playing…", "苏联正在出牌……")];
    return `<section class="panel waiting" style="--side-accent:var(--ussr-600)">
      <div class="who-line"><span class="youbadge" style="background:var(--ussr-700)">${glyph("USSR", "")}${L("USSR's move", "苏联行动")}</span><div class="crumbs"><span>${head[0]}</span></div></div>
      <div class="p-title"><h2>${head[1]}</h2></div>
      <div class="hint" style="margin-top:10px">${ico("i-info")}<span>${L("Nothing for you to do. Watch the board — tap anywhere to skip the animation.", "你无需操作。观察棋盘——点按任意处可跳过动画。")}</span></div>
      <div class="btns"><button class="btn">${ico("i-ff")}${L("Skip to my turn", "跳到我的回合")}</button><button class="btn ghost">${L("Speed: Normal", "速度：正常")}</button></div>
    </section>`;
  }

  // ───────────────────────────── overlays ─────────────────────────────
  function aiReveal() {
    return `<div class="stage" style="place-items:center start;padding-left:${PHONE ? 12 : 120}px">
      <div class="reveal">
        <span class="who">${glyph("USSR", "")}${L("USSR · Action round 4", "苏联 · 行动轮 4")}</span>
        <div class="bigcard" style="background-image:url(${IMG(58)})"></div>
        <div class="ribbon">${ico("i-coup")}<span>${L("Coup", "政变")} · 3 ${L("Ops", "点")}</span><span class="arrow">→</span><b>${cname(25)}</b></div>
        <div class="speedrow"><span class="pillbtn">${ico("i-tap")}${L("Tap to continue", "点按继续")}</span><span class="pillbtn">${ico("i-ff")}${L("Skip to my turn", "跳到我的回合")}</span></div>
      </div></div>`;
  }
  function headlineReveal() {
    return `<div class="stage scrim"><div>
      <div class="hl">
        <div class="side"><span class="youbadge">${glyph("US", "")}${L("You · US", "你 · 美国")}</span><div class="bigcard" style="background-image:url(${IMG(68)})"><span class="order">${L("2nd", "后")}</span></div></div>
        <div class="hl-arrow">←</div>
        <div class="side"><span class="youbadge" style="background:var(--ussr-700)">${glyph("USSR", "")}${L("USSR · AI", "苏联 · AI")}</span><div class="bigcard" style="background-image:url(${IMG(51)})"><span class="order first">${L("1st", "先")}</span></div></div>
      </div>
      <div class="hl-caption plate"><b>${L("Headlines revealed — USSR resolves first", "头条揭晓——苏联先结算")}</b><small>${L("Brezhnev Doctrine (3 Ops) beats John Paul II (2 Ops). Ties go to the US.", "勃列日涅夫主义（3 点）高于约翰·保罗二世（2 点）。平局时美国先结算。")}</small></div>
    </div></div>`;
  }
  function scoringPopup() {
    return `<div class="stage scrim light" style="place-items:center start;padding-left:${PHONE ? 0 : 28}px"><div class="modal" role="dialog" aria-label="${L("Middle East scored", "中东计分")}">
      <div class="score-head"><div class="mini" style="background-image:url(${IMG(3)})"></div>
        <div><div class="eyebrow">${L("USSR played a scoring card", "苏联打出计分牌")}</div><h3>${L("Middle East scored", "中东计分")}</h3>
        <div style="color:var(--ink-300);font-size:13px;margin-top:4px">${L("Presence 3 · Domination 5 · Control 7 · +1 per battleground", "存在 3 · 支配 5 · 控制 7 · 每个战场国 +1")}</div></div></div>
      <table class="score-table"><thead><tr><th></th><th style="color:var(--us-400)">${L("US", "美国")}</th><th style="color:var(--ussr-400)">${L("USSR", "苏联")}</th></tr></thead><tbody>
        <tr><td>${L("Standing", "地位")}</td><td>${L("none", "无")}</td><td><b>${L("Domination", "支配")}</b> · 5</td></tr>
        <tr><td>${L("Countries controlled", "控制国家")}</td><td>0</td><td>4</td></tr>
        <tr><td>${L("Battlegrounds", "战场国")}</td><td>0</td><td>2 · +2</td></tr>
        <tr class="total"><td>${L("Total", "合计")}</td><td>0</td><td>7</td></tr></tbody></table>
      <div class="net"><span>${L("USSR gains 7 VP", "苏联获得 7 VP")}<br><small style="opacity:.8">${L("VP track: US +3 → USSR +4", "VP 轨道：美国 +3 → 苏联 +4")}</small></span><b>−7</b></div>
      <div class="btns"><button class="btn primary">${L("Continue", "继续")} <span class="kbd">Space</span></button></div>
    </div></div>`;
  }
  function gameOver() {
    return `<div class="stage scrim"><div class="over" role="dialog" aria-label="${L("Game over", "对局结束")}">
      <div class="over-hero"><svg class="glyph-big" style="color:#fff"><use href="#g-us"/></svg>
        <div class="eyebrow" style="color:#cfe0ff">${L("Game over · Turn 8", "对局结束 · 第 8 回合")}</div>
        <div class="res">${L("Victory", "胜利")}</div>
        <div class="why">${L("The USSR held <b>Asia Scoring</b> at the end of Turn 8. Holding a scoring card past the end of a turn loses the game (tournament rule).", "苏联在第 8 回合结束时仍持有<b>亚洲计分</b>。回合结束时持有计分牌即告负（锦标赛规则）。")}</div></div>
      <div class="over-body"><div class="statrow">
        <div class="stat"><b>${L("US +6", "美国 +6")}</b><small>${L("VP before the ruling", "判定前的 VP")}</small></div>
        <div class="stat"><b>8 / 10</b><small>${L("Turns played", "已进行回合")}</small></div>
        <div class="stat"><b>DEFCON 3</b><small>${L("At the end", "结束时")}</small></div></div>
        <div class="btns"><button class="btn ghost">${L("View final board", "查看终局棋盘")}</button><button class="btn primary grow2">${L("New game", "新对局")}</button></div></div>
    </div></div>`;
  }

  function cardSheet() {
    const id = 60;
    const opt = (iconId, title, sub, warn, rec) => `<button class="opt ${rec ? "rec" : ""}"><span class="ico">${ico(iconId)}</span><span><b>${title}</b><small>${sub}</small>${warn ? `<small class="warnline">${ico("i-warn", "").replace('class=""', 'style="width:13px;height:13px;vertical-align:-2px"')} ${warn}</small>` : ""}</span><span class="chev">${ico("i-chev", "").replace('class=""', 'style="width:18px;height:18px"')}</span></button>`;
    const ev = L("then U-2 Incident fires for the USSR (+1 VP)", "随后 U-2 击坠事件为苏联生效（+1 VP）");
    return `<div class="scrim-full"></div><div class="sheet" role="dialog" aria-label="${card(id)}">
      <div class="grab"></div>
      <div class="sheet-card"><div class="img" style="background-image:url(${IMG(id)})"></div>
        <div><div class="eyebrow">${L("Action round 3 · play this card", "行动轮 3 · 打出这张牌")}</div><h3>${card(id)}</h3>
        <div class="meta"><span class="chip">3 ${L("Ops", "行动点")}</span><span class="chip ussr">${L("USSR event", "苏联事件")}</span><span class="chip">${L("Mid War", "战争中期")}</span></div>
        <p>${L("USSR gains 1 VP. If UN Intervention is played later this turn, the USSR gains 1 more VP.", "苏联获得 1 VP。若本回合稍后打出联合国干预，苏联再获得 1 VP。")}</p></div></div>
      <div class="warn">${ico("i-warn")}<span>${L("<b>USSR card.</b> After Influence, Coup or Realign, U-2 Incident fires for the USSR (+1 VP).", "<b>苏联牌。</b>使用影响力、政变或调整后，U-2 击坠事件会为苏联生效（+1 VP）。")}</span></div>
      <div class="opts">
        ${opt("i-inf", L("Influence · 3 Ops", "放置影响力 · 3 点"), L("Place 3 influence · then USSR event", "放置 3 点影响力 · 随后苏联事件"), "", true)}
        ${opt("i-coup", L("Coup · 3 Ops", "政变 · 3 点"), L("Pick a target, then roll · then USSR event", "选择目标后掷骰 · 随后苏联事件"))}
        ${opt("i-realign", L("Realign · 3 Ops", "调整 · 3 点"), L("Up to 3 rolls · then USSR event", "最多 3 次掷骰 · 随后苏联事件"))}
        ${opt("i-space", L("Space Race", "太空竞赛"), L("Box 4 · roll 1–4 to advance (67%). Event does not fire.", "第 4 格 · 掷出 1–4 推进（67%）。事件不会生效。"))}
        ${opt("i-event", L("Event first, then Ops", "先触发事件，再用行动点"), L("USSR +1 VP now, then you spend 3 Ops", "苏联立即 +1 VP，然后你使用 3 点"))}
      </div>
      <div class="btns"><button class="btn ghost">${L("Back to hand", "返回手牌")}</button></div>
    </div>`;
  }

  function countryTip() {
    const c = byId(25);
    return `<div class="country-tip desktop-only" style="left:${tipPos[0]}px;top:${tipPos[1]}px">
      <h4>${cname(25)} <span style="color:var(--ink-300);font-weight:600;font-size:12.5px">${L("Middle East", "中东")}</span></h4>
      <div class="row"><span>${L("Stability", "稳定度")}</span><b>${c.st} · ${L("battleground", "战场国")}</b></div>
      <div class="row"><span>${L("Influence", "影响力")}</span><b><span style="color:var(--us-400)">US 1</span> · <span style="color:var(--ussr-400)">USSR 0</span></b></div>
      <div class="row"><span>${L("Next point", "下一点")}</span><b>${L("+1 → US control", "+1 → 美国控制")}</b></div>
      <div class="row"><span>${L("Neighbours", "相邻")}</span><b>${cname(24, true)}, ${cname(31, true)}, ${cname(32, true)}</b></div></div>`;
  }
  let tipPos = [0, 0];

  // ───────────────────────────── assemble ─────────────────────────────
  const promptKind = { influence: "influence", card: "action-card", coup: "coup", ai: "none", headline: "none", scoring: "none", over: "none" }[STATE] || "influence";
  const FOCUS = Q.get("focus") || (PHONE ? "auto" : "world");
  let mode = { kind: promptKind, lv: FOCUS === "world" ? "L1" : "L2" };
  if (promptKind === "influence") mode.targets = legalInfluence;
  if (promptKind === "coup") {
    mode.targets = new Set(C.filter((c) => inf(c.id)[1] > 0 && ![0].includes(c.r) && ![1].includes(c.r)).map((c) => c.id)); // DEFCON 3: no Europe / Asia coups
    mode.selected = 24;
    mode.odds = { 24: 50, 22: 67, 21: 83, 29: 67, 30: 67, 47: 67, 54: 100, 57: 83, 63: 33, 69: 83, 71: 17, 77: 67, 81: 33 };
  }
  if (STATE === "ai") mode.flash = new Set([25]);
  if (STATE === "scoring") { mode.targets = new Set(C.filter((c) => c.r === 2).map((c) => c.id)); mode.kind = "spot"; }

  const panel = promptKind === "influence" ? panelInfluence()
    : promptKind === "coup" ? panelCoup()
    : promptKind === "action-card" ? panelInfluence().replace(/<section class="panel"[\s\S]*<\/section>/, "")
    : panelWaiting();
  const oppState = STATE === "ai" ? L("Playing a card…", "正在出牌……") : STATE === "headline" || STATE === "scoring" ? L("Revealed", "已揭示") : L("Waiting for you", "等待你行动");

  const app = document.getElementById("app");
  app.innerHTML = SYMBOLS + `
    <header id="top">
      <div class="brand">${brandMark()}<div class="brand-name">Twilight Struggle<small>${L("Playfield · vs DeepStruggle", "Playfield · 对战 DeepStruggle")}</small></div></div>
      ${tracksHTML()}
      <div class="top-actions">
        <div class="seg" role="group" aria-label="Language"><button aria-pressed="${LANG === "en"}">EN</button><button aria-pressed="${LANG === "zh"}">中文</button></div>
        <a class="icon-btn" title="${L("Rules (GMT living rules, PDF)", "规则（GMT 官方规则 PDF）")}" href="https://www.gmtgames.com/living_rules/TS_Rules_Deluxe.pdf">${ico("i-book")}</a>
        <button class="icon-btn" title="${L("Settings", "设置")}">${ico("i-gear")}</button>
      </div>
    </header>
    ${statusHTML()}
    <main id="mapwrap">
      <div class="regionbar" role="tablist" aria-label="${L("Jump to region", "跳转到地区")}">
        <button class="rchip on"><i style="background:var(--rg-me)"></i>${L("Middle East", "中东")}<b>6</b></button>
        <button class="rchip"><i style="background:var(--rg-we)"></i>${L("Europe", "欧洲")}<b>15</b></button>
        <button class="rchip"><i style="background:var(--rg-as)"></i>${L("Asia", "亚洲")}<b>13</b></button>
        <button class="rchip"><i style="background:var(--rg-af)"></i>${L("Africa", "非洲")}<b>6</b></button>
        <button class="rchip"><i style="background:var(--rg-ca)"></i>${L("C. America", "中美洲")}<b>6</b></button>
      </div>
      <svg id="map" role="application" aria-label="${L("World map", "世界地图")}">${buildMap(mode)}</svg>
      <svg class="minimap" viewBox="40 60 2380 1400" aria-hidden="true"><g opacity=".9">${landBlobs()}</g><rect id="mmrect" fill="none" stroke="#1d2430" stroke-width="22"/></svg>
      <div class="map-tools"><button class="icon-btn" aria-label="zoom in">${ico("i-plus")}</button><button class="icon-btn" aria-label="zoom out">${ico("i-minus")}</button><button class="icon-btn" aria-label="fit">${ico("i-fit")}</button></div>
      <div id="overlay"></div>
    </main>
    ${handHTML(promptKind)}
    <aside id="rail">${oppHTML(oppState, STATE === "ai")}${logHTML()}${panel}</aside>
    <div id="sheet-root"></div>`;

  // map viewport: world fit on large screens, smart focus on phones
  const svg = document.getElementById("map");
  function setView() {
    const r = svg.getBoundingClientRect();
    let vb;
    if (FOCUS === "world") vb = [40, 56, 2376, 1384];
    else {
      // frame the last placement + nearby legal targets (Iran, Middle East)
      const cx = 1440, cy = 690;
      const vw = 620, vh = vw * (r.height / r.width);
      vb = [cx - vw / 2, cy - vh / 2 + 18, vw, vh];
    }
    svg.setAttribute("viewBox", vb.join(" "));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const mm = document.getElementById("mmrect");
    if (mm) { mm.setAttribute("x", vb[0]); mm.setAttribute("y", vb[1]); mm.setAttribute("width", vb[2]); mm.setAttribute("height", vb[3]); }
    return vb;
  }
  const vb = setView();

  // overlays
  const ov = document.getElementById("overlay");
  if (STATE === "ai" && PHONE) {
    ov.innerHTML = `<div class="playbanner"><div class="mini" style="background-image:url(${IMG(58)})"></div><div class="t"><small>${L("USSR · Action round 4", "苏联 · 行动轮 4")}</small>${card(58)}<div class="rb">${ico("i-coup")}${L("Coup", "政变")} · 3 ${L("Ops", "点")} → <b>${cname(25)}</b></div></div></div>`;
    document.querySelector(".regionbar").style.display = "none";
    const ir = byId(25), r = svg.getBoundingClientRect();
    const sc = Math.min(r.width / vb[2], r.height / vb[3]);
    const ox = (r.width - vb[2] * sc) / 2, oy = (r.height - vb[3] * sc) / 2;
    const px = ox + (ir.x - vb[0]) * sc, py = oy + (ir.y - vb[1]) * sc;
    ov.insertAdjacentHTML("beforeend", `<div class="dice-bubble" style="right:10px;top:${py + 40}px">${die(5).replace('class="die"', 'class="d"')}<span>5 + 3 = 8 ${L("vs", "对")} 4 → <span style="color:var(--ussr-400)">+4</span><small>${L("US −1, USSR +3 · USSR control", "美国 −1，苏联 +3 · 苏联控制")}</small></span></div>`);
  } else if (STATE === "ai") {
    ov.innerHTML = aiReveal();
    // die bubble anchored at Iran
    const ir = byId(25), r = svg.getBoundingClientRect();
    const s = Math.min(r.width / vb[2], r.height / vb[3]);
    const ox = (r.width - vb[2] * s) / 2, oy = (r.height - vb[3] * s) / 2;
    const px = ox + (ir.x - vb[0]) * s, py = oy + (ir.y - vb[1]) * s;
    ov.insertAdjacentHTML("beforeend", `<div class="dice-bubble" style="left:${px + 30}px;top:${py - 70}px">${die(5).replace('class="die"', 'class="d"')}<span>5 + 3 = 8 ${L("vs", "对")} 4 → <span style="color:var(--ussr-400)">+4</span><small>${L(`${cname(25)}: US −1, USSR +3 · USSR control`, `${cname(25)}：美国 −1，苏联 +3 · 苏联控制`)}</small></span></div>`);
  }
  if (STATE === "headline") ov.innerHTML = headlineReveal();
  if (STATE === "scoring") ov.innerHTML = scoringPopup();
  if (STATE === "over") { app.insertAdjacentHTML("beforeend", `<div class="fullstage">${gameOver()}</div>`); }
  if (STATE === "card") {
    if (PHONE) document.getElementById("sheet-root").innerHTML = cardSheet();
    else {
      // desktop: the same content docks in the rail as the action panel
      const p = document.createElement("section");
      p.className = "panel";
      p.style.setProperty("--side-accent", "var(--us-600)");
      p.innerHTML = cardSheet().replace(/^<div class="scrim-full"><\/div><div class="sheet"[^>]*>/, "").replace(/<\/div>$/, "").replace('<div class="grab"></div>', "");
      document.getElementById("rail").appendChild(p);
      document.querySelector("#rail .log").style.display = "none";
    }
  }
  if (STATE === "influence" && !PHONE && Q.get("tip") !== "0") {
    const ir = byId(25), r = svg.getBoundingClientRect();
    const s = Math.min(r.width / vb[2], r.height / vb[3]);
    const ox = (r.width - vb[2] * s) / 2, oy = (r.height - vb[3] * s) / 2;
    tipPos = [ox + (ir.x - vb[0]) * s + 36, oy + (ir.y - vb[1]) * s - 190];
    ov.insertAdjacentHTML("beforeend", countryTip());
  }
  const lg = document.querySelector("#rail .log"); if (lg) lg.scrollTop = lg.scrollHeight;
  if (PHONE && STATE === "card") document.querySelectorAll(".panel").forEach((p) => (p.style.display = "none"));
})();
