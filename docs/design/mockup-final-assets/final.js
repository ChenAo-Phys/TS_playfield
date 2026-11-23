/* War Table — final design mockup renderer (static; no engine, no React).
   Scenes: ?scene=influence|playmode|coup|ai|start  &lang=en|zh  &view=desktop|compact
   Each function is named after the React component it stands for (docs/design/ui-spec.md §11). */
(function () {
  "use strict";
  const B = window.SR_BOARD; // geometry: viewBox 1775×1090, box 88×56 (ui-spec §5.1)
  const N = window.TS_NAMES; // names from src/data (our glossary)
  const Q = new URLSearchParams(location.search);
  const LANG = Q.get("lang") === "zh" ? "zh" : "en";
  const SCENE = Q.get("scene") || "influence";
  const VIEW = Q.get("view") || (innerWidth < 700 ? "compact" : "desktop");
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
  const ZH = LANG === "zh";
  const CARD_DIR = "../../public/cards/" + (ZH ? "zh" : "en") + "/";
  const img = (id) => CARD_DIR + String(id).padStart(3, "0") + ".webp";
  const card = (id) => B.cards[id - 1];
  const cname = (id) => N.cards[id][ZH ? "zh" : "en"];
  const C = (id) => B.countries[id];
  // Map labels: data short names, with a few map-only abbreviations (ui-spec §5.3 "Name fitting").
  const EN_MAP = { 9: "Spain/Port.", 35: "Laos/Camb.", 49: "W. Afr. St.", 50: "Saharan St.", 61: "SE Afr. St.", 63: "S. Africa", 7: "W. Germany", 14: "E. Germany", 43: "N. Korea", 44: "S. Korea" };
  const ZH_MAP = { 9: "西葡", 16: "捷克", 35: "老挝柬埔寨", 50: "撒哈拉", 61: "东南非" };
  const ctyLabel = (id) => (ZH ? ZH_MAP[id] ?? N.countries[id].zhShort : EN_MAP[id] ?? N.countries[id].enShort);
  const ctyName = (id) => N.countries[id][ZH ? "zh" : "en"];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ── strings (would be i18n `ui:` / `prompt:` keys) ────────────────────────────────────────
  const T = ZH ? {
    wordSub: "对战 DeepStruggle", turn: "回合", ar: "行动轮", early: "早期", mid: "中期", late: "晚期", midWar: "战争中期",
    defconSub3: "欧洲、亚洲禁止政变与调整", vp: "VP", vpLead: "苏联 +2", milops: "军事行动 · 需 3", space: "太空竞赛",
    us: "美国", ussr: "苏联", arRead: "第 3 行动轮 · <span class='side-ussr'>苏联</span><span class='you'>（你）</span>",
    arShort: "第 3 行动轮 · 苏联（你）", turnShort: "第 5 回合 · 战争中期",
    adversary: "对手", advName: "美国", advSub: "DeepStruggle AI · 全力以赴", waiting: "等待中", thinking: "思考中", playing: "出牌中",
    cards5: "手牌 <b>5</b> 张", known1: "已知 1 张", chinaHeld: "中国牌：在你手中", known: "已知",
    effects: "生效中", permanent: "持续", thisTurn: "本回合", dispatches: "电报", fAll: "全部", fPlays: "出牌", fDice: "掷骰",
    ordersHead: "指令 · 第 5 回合 · 第 3 行动轮", yourMove: "轮到你", placeInf: "放置影响力",
    crumb: "<span>“我们要埋葬你们”</span><i>›</i><b>影响力</b>", opsLeft: "剩余点数",
    infHint: "点击带圈的国家：+1 影响力。标有 <span class='cost-chip'>2 点</span> 的国家由美国控制，每点需 2 行动点数。",
    undo: "撤销本次出牌", hand: "你的手牌", chinaFaceUp: "中国牌 · 正面朝上", deck: "抽牌堆", discard: "弃牌堆", removed: "移出游戏",
    scoringTag: "计分牌", tipBg: "战场国", tipStab: "稳定值", tipRegion: "中东", tipUssrYou: "苏联（你）", tipCtrl: "控制",
    tipAfter: "苏联 0 → 1", tipCost: "需 <b>2 行动点数</b>（美国控制）", tipKeys: "<kbd>点击</kbd> 放置 · <kbd>右键</kbd> 详情",
    regions: { eu: "欧洲", me: "中东", asia: "亚洲", sea: "东南亚", af: "非洲", ca: "中美洲", sa: "南美洲" },
    pres: "存在", dom: "支配", ctrl: "控制", none: "—", ifScored: "若计分", even: "持平", cost2: "2 点", toJapan: "往日本", toUSA: "往美国",
    zoomIn: "放大", zoomOut: "缩小", fit: "全图", seaVals: "每国 1 VP · 泰国 2",
    chooseHow: "如何使用这张牌？", modeEvent: "先结算事件", modeEventD: "美国事件为美国结算，然后你使用 2 行动点数。",
    modeInf: "影响力", modeCoup: "政变", modeRealign: "调整", operations: "行动", opsThen: "之后美国事件发生：移除欧洲以外 4 点苏联影响力",
    modeSpace: "太空竞赛", modeSpaceD: "弃牌尝试发射：第 2 → 3 格，掷出 1–3。不触发事件。", effOps: "行动点数", back: "放回手牌", oppCard: "对手的牌",
    backHint: "掷骰之前均可撤销", pmCrumb: "<span>美国之音</span><i>›</i><b>选择用法</b>",
    coupT: "政变", coupHint: "政变一经掷骰便无法撤销。再次点击伊朗或按回车确认。", coupConfirm: "发动政变", coupWarn: "战场国：DEFCON 3 → 2",
    milGain: "军事行动 +3", success: "成功", coupCrumb: "<span>勃列日涅夫主义</span><i>›</i><b>政变</b> · 3 行动点数",
    aiPlays: "美国打出", aiHow: "行动 · 政变", aiNote: "苏联牌：政变之后其事件为苏联发生", aiResult: "苏联 −2 · 美国 +2 · 军事行动 +1",
    aiCrumb: "<span>去殖民化</span><i>›</i><b>政变 → 安哥拉</b> · 1 行动点数", speed: "速度", skip: "跳过", skipAll: "跳到我的回合",
    classified: "绝密 · 仅限阅览", kicker: "冷战 1945–1989", tagline: "你指挥一个超级大国，DeepStruggle 指挥另一个。",
    pickUS: "美国", pickUSd: "每个行动轮后手。在西欧放置 7 点影响力，再加 2 点竞价。", pickUSSR: "苏联",
    pickUSSRd: "每个行动轮先手。开局持有中国牌，在东欧放置 6 点影响力。", pickRand: "掷硬币", pickRandd: "交给历史决定。", take: "开始指挥",
    resume: "继续对局", resumeD: "第 5 回合 · 第 3 行动轮 · 你执苏联 · 2 小时前", rules: "规则（GMT 在线规则）", settings: "设置",
    boot: "&gt; 正在连接 DEEPSTRUGGLE · 规则引擎 ✓ · AI 模型 3.6 / 5.8 MB · 校验 · 启动 AI",
    chips: ["标准规则 + 可选卡牌 #104–110", "美国竞价 +2", "锦标赛规则：回合结束时持有计分牌即判负", "AI 全力以赴 · 无难度分级"],
    fine: "爱好者制作，免费，无广告。冷战热斗 © GMT Games。<br>AI 与规则引擎：DeepStruggle（MIT）。",
    ticker: "美国 · 殖民地后卫部队：尼日利亚、南非、印尼、菲律宾各 +1", dock: ["手牌", "对手", "电报", "状态"],
  } : {
    wordSub: "Playfield · vs DeepStruggle", turn: "Turn", ar: "Action round", early: "Early", mid: "Mid", late: "Late", midWar: "Mid War",
    defconSub3: "No coups or realignments in Europe, Asia", vp: "Victory points", vpLead: "USSR +2", milops: "Mil ops · need 3", space: "Space race",
    us: "US", ussr: "USSR", arRead: "AR 3 · <span class='side-ussr'>USSR</span> <span class='you'>(you)</span>",
    arShort: "AR 3 · USSR (you)", turnShort: "Turn 5 · Mid War",
    adversary: "Adversary", advName: "United States", advSub: "DeepStruggle AI · full strength", waiting: "Waiting", thinking: "Thinking", playing: "Playing",
    cards5: "<b>5</b> cards in hand", known1: "1 known", chinaHeld: "China Card: yours", known: "Known",
    effects: "In effect", permanent: "permanent", thisTurn: "this turn", dispatches: "Dispatches", fAll: "All", fPlays: "Plays", fDice: "Dice",
    ordersHead: "Orders · Turn 5 · AR 3", yourMove: "Your move", placeInf: "Place influence",
    crumb: "<span>“We Will Bury You”</span><i>›</i><b>Influence</b>", opsLeft: "Ops left",
    infHint: "Click a ringed country: +1 influence. <span class='cost-chip'>2 OPS</span> marks US control: a point there costs 2.",
    undo: "Undo play", hand: "Your hand", chinaFaceUp: "China Card · face up", deck: "Deck", discard: "Discard", removed: "Removed",
    scoringTag: "Scoring", tipBg: "Battleground", tipStab: "Stability", tipRegion: "Middle East", tipUssrYou: "USSR (you)", tipCtrl: "control",
    tipAfter: "USSR 0 → 1", tipCost: "Costs <b>2 Ops</b> (US-controlled)", tipKeys: "<kbd>Click</kbd> place · <kbd>Right-click</kbd> details",
    regions: { eu: "Europe", me: "Middle East", asia: "Asia", sea: "SE Asia", af: "Africa", ca: "C. America", sa: "S. America" },
    pres: "Pres", dom: "Dom", ctrl: "Ctrl", none: "—", ifScored: "If scored", even: "Even", cost2: "2 OPS", toJapan: "To Japan", toUSA: "To USA",
    zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "World", seaVals: "1 VP each · Thailand 2",
    chooseHow: "How will you play it?", modeEvent: "Event first", modeEventD: "The US event resolves for the US, then you spend 2 Ops.",
    modeInf: "Influence", modeCoup: "Coup", modeRealign: "Realign", operations: "Operations", opsThen: "Then the US event happens: remove 4 USSR influence outside Europe",
    modeSpace: "Space race", modeSpaceD: "Discard for a launch: box 2 → 3, roll 1–3. No event.", effOps: "Ops", back: "Back to hand", oppCard: "Opponent's card",
    backHint: "Undo is free until a die is rolled", pmCrumb: "<span>The Voice of America</span><i>›</i><b>Choose how</b>",
    coupT: "Coup", coupHint: "A coup is final once the die is rolled. Click Iran again or press Enter.", coupConfirm: "Launch coup", coupWarn: "Battleground: DEFCON 3 → 2",
    milGain: "Mil ops +3", success: "Success", coupCrumb: "<span>Brezhnev Doctrine</span><i>›</i><b>Coup</b> · 3 Ops",
    aiPlays: "United States plays", aiHow: "Operations · Coup", aiNote: "USSR card: its event happens for the USSR after the coup", aiResult: "USSR −2 · US +2 · Mil ops +1",
    aiCrumb: "<span>Decolonization</span><i>›</i><b>Coup → Angola</b> · 1 Op", speed: "Speed", skip: "Skip", skipAll: "Skip to my turn",
    classified: "Top secret · Eyes only", kicker: "The Cold War, 1945–1989", tagline: "You command one superpower. DeepStruggle commands the other.",
    pickUS: "United States", pickUSd: "Moves second each action round. Sets up 7 in Western Europe, then the +2 bid.", pickUSSR: "Soviet Union",
    pickUSSRd: "Moves first each action round. Starts with the China Card and 6 in Eastern Europe.", pickRand: "Toss a coin", pickRandd: "Let history decide.", take: "Take command",
    resume: "Resume game", resumeD: "Turn 5 · AR 3 · you are the USSR · 2 h ago", rules: "Rules (GMT living rules)", settings: "Settings",
    boot: "&gt; LINKING WITH DEEPSTRUGGLE · RULES ENGINE ✓ · AI MODEL 3.6 / 5.8 MB · VERIFY · START AI",
    chips: ["Standard rules + optional cards #104–110", "US bid +2", "Tournament rule: holding a scoring card at turn end loses", "AI at full strength · no difficulty levels"],
    fine: "Fan-made, free, no ads. Twilight Struggle © GMT Games.<br>AI &amp; rules engine: DeepStruggle (MIT).",
    ticker: "US · Colonial Rear Guards: +1 Nigeria, S. Africa, Indonesia, Philippines", dock: ["Hand", "Adversary", "Log", "Status"],
  };

  // ── glyphs and icons ──────────────────────────────────────────────────────────────────────
  const STAR = "M12 1.6l2.9 7.1 7.6.5-5.9 4.9 1.9 7.4L12 17.4l-6.4 4.1 1.9-7.4-5.9-4.9 7.6-.5z";
  const HS = "M14.6 3.2c3.9 1.1 6.6 4.7 6.6 8.8 0 5-4.1 9.1-9.1 9.1-2.6 0-4.9-1.1-6.6-2.8l-2.2 2.2-1.4-1.4 2.2-2.2C2.9 15.2 2.4 13.5 2.4 12c0 0 1.6 4.1 6 5.4 4.6 1.3 9.7-1.6 10.2-6.6.3-3.3-1.4-6.2-4-7.6z M6.1 4.3l2.6-2.6 4.6 4.6-1.6 1.6 7.8 7.8-1.5 1.5-7.8-7.8-1.6 1.6z";
  const glyph = (side, cls = "glyph") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${side === "US" ? STAR : HS}" fill="currentColor"/></svg>`;
  const seal = (side) => side === "US"
    ? `<svg class="seal" viewBox="0 0 48 48" aria-label="US"><circle cx="24" cy="24" r="23" fill="#1f4382" stroke="#0e2147" stroke-width="2"/><circle cx="24" cy="24" r="18.5" fill="none" stroke="#dde6f5" stroke-width="1" stroke-dasharray="2 2.2"/><g transform="translate(10.5 10) scale(1.13)"><path d="${STAR}" fill="#fff"/></g></svg>`
    : `<svg class="seal" viewBox="0 0 48 48" aria-label="USSR"><circle cx="24" cy="24" r="23" fill="#a8231a" stroke="#5e120d" stroke-width="2"/><circle cx="24" cy="24" r="18.5" fill="none" stroke="#f3c84b" stroke-width="1" stroke-dasharray="2 2.2"/><g transform="translate(11.5 12) scale(1.05)"><path d="${HS}" fill="#f3c84b"/></g><g transform="translate(20.5 5.2) scale(.29)"><path d="${STAR}" fill="#f3c84b"/></g></svg>`;
  const ICON = {
    gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
    menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
    event: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v9a2 2 0 0 1-2 2"/><path d="M7 9h7M7 12h7M7 15h4"/></svg>`,
    inf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/></svg>`,
    coup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>`,
    realign: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h14l-4-4M20 15H6l4 4"/></svg>`,
    space: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c3 2.5 4.5 6 4.5 10.5L12 17l-4.5-4.5C7.5 8 9 4.5 12 2z"/><path d="M7.5 12.5 5 15l2 2M16.5 12.5 19 15l-2 2M10 19l2 3 2-3"/><circle cx="12" cy="9" r="1.6"/></svg>`,
    log: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>`,
    status: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
    undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>`,
    skip: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/></svg>`,
    up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 15 6-6 6 6"/></svg>`,
  };

  // ── mock game state: Turn 5, AR 3, human = USSR, AI = US ─────────────────────────────────
  const INF = {
    0: [2, 0], 1: [5, 0], 4: [1, 0], 5: [0, 1], 6: [1, 0], 7: [4, 1], 8: [3, 1], 10: [3, 1], 11: [2, 0], 12: [2, 0], 13: [0, 1],
    14: [0, 4], 15: [0, 4], 16: [0, 3], 17: [0, 3], 18: [0, 1], 19: [0, 3], 20: [0, 3],
    21: [0, 1], 22: [0, 2], 23: [4, 0], 24: [0, 3], 25: [2, 0], 26: [0, 1], 28: [1, 0], 29: [0, 2], 30: [0, 2],
    31: [0, 2], 32: [2, 0], 33: [1, 1], 36: [2, 0], 37: [0, 2], 39: [1, 0], 40: [1, 0], 41: [4, 0], 43: [0, 3], 44: [3, 0], 45: [4, 0],
    47: [0, 2], 53: [1, 0], 54: [0, 1], 57: [0, 2], 59: [2, 0], 63: [1, 0],
    64: [2, 0], 70: [1, 0], 71: [0, 3], 77: [1, 0], 81: [0, 1], 82: [1, 0],
  };
  const inf = (id) => INF[id] || [0, 0];
  const controller = (id) => {
    const [u, s] = inf(id), st = C(id).stab;
    if (u >= st && u - s >= st) return "US";
    if (s >= st && s - u >= st) return "USSR";
    return null;
  };
  const adj = {};
  for (const [a, b] of B.edges) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
  const ussrTargets = new Set();
  for (const c of B.countries) if (inf(c.id)[1] > 0 || c.sp === "USSR" || (adj[c.id] || []).some((n) => inf(n)[1] > 0)) ussrTargets.add(c.id);
  const PLACED = { 24: 1, 26: 1 }; // this play: Iraq, Jordan (+1 each)
  const LAST_AI = { 53: 1, 63: 1, 39: 1, 40: 1 }; // the AI's last play: Colonial Rear Guards
  const REGION_OF = (c) => (c.sub === "sea" ? "sea" : c.region);

  // ── MapView ───────────────────────────────────────────────────────────────────────────────
  const BW = B.box.w, BH = B.box.h, BAND = 19, MK = 30, MKY = BAND + (BH - BAND - MK) / 2;
  const REG_INK = { eu: "var(--ts-reg-euw)", me: "var(--ts-reg-me)", asia: "var(--ts-reg-asia)", af: "var(--ts-reg-af)", ca: "var(--ts-reg-ca)", sa: "var(--ts-reg-sa)" };
  const bandFill = (c) => c.sub === "sea" ? "var(--ts-reg-sea)" : c.sub === "eue" ? "var(--ts-reg-eue)" : c.sub === "euwe" ? "url(#bandWE)" : REG_INK[c.region];
  function marker(side, n, x, y, flip, ghost) {
    const w = MK + 1, h = MK;
    const shape = side === "US"
      ? `<rect class="mk-face" x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5"/>`
      : `<path class="mk-face" d="M${x + 6} ${y}H${x + w}V${y + h - 6}L${x + w - 6} ${y + h}H${x}V${y + 6}Z"/>`;
    const g = side === "US"
      ? `<g transform="translate(${x + 2.2} ${y + 2.2}) scale(.36)"><path class="mk-glyph" d="${STAR}"/></g>`
      : `<g transform="translate(${x + w - 10.6} ${y + 2.2}) scale(.36)"><path class="mk-glyph" d="${HS}"/></g>`;
    return `<g class="mk ${side === "US" ? "us" : "ussr"}${flip ? " flip" : ""}${ghost ? " ghost" : ""}">${shape}${ghost ? "" : `<rect class="mk-sheen" x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5"/>`}${g}<text class="mk-num" x="${x + w / 2 + (side === "US" ? 2 : -2)}" y="${y + h / 2 + 7.6}">${n}</text></g>`;
  }
  function CountryBox(c, o) {
    const x = c.x - BW / 2, y = c.y - BH / 2;
    const [u, v] = o.blank ? [0, 0] : inf(c.id);
    const ctl = o.blank ? null : controller(c.id);
    const isT = o.targets && o.targets.has(c.id);
    const cls = ["cty", c.bg ? "bg" : "", c.sub === "eue" ? "eue" : "", ctl === "US" ? "ctrl-us" : ctl === "USSR" ? "ctrl-ussr" : "", isT ? "target" : "", o.hover === c.id ? "hover" : "", o.keep && o.keep.has(c.id) ? "keep" : ""].join(" ");
    const name = ctyLabel(c.id);
    const room = BW - (c.bg ? 9 : 6) - 21;
    const nameLen = ZH ? [...name].length * 15 : name.length * 7.0;
    const fit = nameLen > room ? ` textLength="${room}" lengthAdjust="spacingAndGlyphs"` : "";
    let s = `<g class="${cls}" data-id="${c.id}" transform="translate(${x} ${y})">`;
    if (isT) s += o.targets.size > 12 && o.hover !== c.id
      ? `<rect class="target-edge quiet" x="-3.5" y="-3.5" width="${BW + 7}" height="${BH + 7}" rx="5"/><rect class="target-ring quiet" x="-3.5" y="-3.5" width="${BW + 7}" height="${BH + 7}" rx="5"/>`
      : `<rect class="target-edge" x="-5.5" y="-5.5" width="${BW + 11}" height="${BH + 11}" rx="6"/><rect class="target-ring" x="-5.5" y="-5.5" width="${BW + 11}" height="${BH + 11}" rx="6"/>`;
    s += `<rect class="cty-shadow" x="1.6" y="2.4" width="${BW}" height="${BH}" rx="3"/>`;
    s += `<rect class="cty-body" width="${BW}" height="${BH}" rx="3"/>`;
    s += `<path class="cty-band" d="M0 3a3 3 0 0 1 3-3h${BW - 6}a3 3 0 0 1 3 3v${BAND - 3}H0z" style="fill:${bandFill(c)}"/>`;
    if (c.bg) s += `<path d="M0 3a3 3 0 0 1 3-3h2v${BAND}H0z" style="fill:${bandFill(c)}"/>`;
    s += `<text class="cty-name" x="${c.bg ? 8.5 : 5.5}" y="14.4"${fit}>${esc(name)}</text>`;
    s += `<g class="cty-stab"><rect x="${BW - 18}" y="2" width="16" height="15" rx="2"/><text x="${BW - 10}" y="14.2">${c.stab}</text></g>`;
    s += `<line class="cty-div" x1="${BW / 2}" y1="${BAND + 3}" x2="${BW / 2}" y2="${BH - 3}"/>`;
    if (u) s += marker("US", u, 6, MKY, ctl === "US");
    if (v) s += marker("USSR", v, BW - MK - 7, MKY, ctl === "USSR");
    if (o.ghost && o.ghost.id === c.id) s += marker("USSR", o.ghost.n, BW - MK - 7, MKY, false, true);
    return s + "</g>";
  }
  // Annotations above every box: this-play pencil marks, last-AI-play delta pills, cost tags, reticle.
  function annotations(o) {
    let s = "";
    for (const c of B.countries) {
      const x = c.x - BW / 2, y = c.y - BH / 2;
      if (o.costTags && o.targets && o.targets.has(c.id) && controller(c.id) === "US") {
        const w = ZH ? 30 : 38;
        s += `<g class="cost-tag" transform="translate(${x - 5} ${y + BH - 8})"><rect width="${w}" height="15" rx="2"/><text x="${w / 2}" y="11.5">${T.cost2}</text></g>`;
      }
      if (o.placed && o.placed[c.id]) s += `<g class="pencil-mark" transform="translate(${x + BW + 1} ${y - 3})"><ellipse class="pencil-ring" rx="13" ry="10.5" transform="rotate(-12)"/><text class="pencil" x="0" y="5.4" text-anchor="middle">+${o.placed[c.id]}</text></g>`;
      if (o.lastAi && o.lastAi[c.id]) {
        const d = o.lastAi[c.id];
        s += `<g class="delta-pill us" transform="translate(${x - 6} ${y - 9})"><rect width="25" height="15" rx="2.5"/><text x="12.5" y="11.6">${d > 0 ? "+" : "−"}${Math.abs(d)}</text></g>`;
      }
      if (o.reticle === c.id) {
        const m = 10, L = 15;
        s += `<path class="reticle" transform="translate(${x} ${y})" d="M${-m} ${-m + L}V${-m}H${-m + L} M${BW + m - L} ${-m}H${BW + m}V${-m + L} M${BW + m} ${BH + m - L}V${BH + m}H${BW + m - L} M${-m + L} ${BH + m}H${-m}V${BH + m - L}"/>`;
      }
    }
    return s;
  }
  // Region plates: name, scoring values, both standings (US left, USSR right), "if scored" net.
  const PLATES = [
    ["eu", 474, 112, "3·7·★", ["pres", "pres"], 0],
    ["me", 1227, 645, "3·5·7", ["pres", "dom"], -2],
    ["asia", 1446, 470, "3·7·9", ["dom", "pres"], 1],
    ["sea", 1356, 784, null, null, 2],
    ["af", 1112, 930, "1·4·6", ["pres", "pres"], -1],
    ["ca", 102, 778, "1·3·5", ["pres", "pres"], 0],
    ["sa", 168, 910, "2·5·6", ["none", "none"], 0],
  ];
  function RegionPlate([k, x, y, vals, st, net]) {
    const w = 196, h = 58;
    const ink = k === "sea" ? "var(--ts-reg-sea)" : k === "eu" ? "var(--ts-reg-euw)" : REG_INK[k];
    let s = `<g class="region-plate" transform="translate(${x - w / 2} ${y - h / 2})">`;
    s += `<rect class="rp-plate" width="${w}" height="${h}" rx="2"/><rect width="5" height="${h}" rx="1" style="fill:${ink}"/>`;
    s += `<text class="rp-name" x="12" y="24">${esc(T.regions[k])}</text>`;
    const netTxt = net === 0 ? T.even : `${net > 0 ? T.us : T.ussr} +${Math.abs(net)}`;
    s += `<text class="rp-net-l" x="${w - 8}" y="11.5" text-anchor="end">${esc(T.ifScored)}</text>`;
    s += `<text class="rp-net ${net > 0 ? "us" : net < 0 ? "ussr" : "even"}" x="${w - 8}" y="26" text-anchor="end">${esc(netTxt)}</text>`;
    if (st) {
      let xx = 12;
      st.forEach((lvl, i) => {
        const side = i === 0 ? "US" : "USSR";
        const lab = lvl === "none" ? T.none : T[lvl];
        const ww = (ZH ? [...lab].length * 12.5 : lab.length * 6.6) + 22;
        s += `<g transform="translate(${xx} 34)"><rect width="${ww}" height="17" rx="2" class="rp-chip ${side === "US" ? "us" : "ussr"} ${lvl}"/>`;
        s += `<g transform="translate(3.5 2.6) scale(.5)"><path d="${side === "US" ? STAR : HS}" class="rp-chip-g"/></g>`;
        s += `<text x="${ww / 2 + 7}" y="13" text-anchor="middle" class="rp-chip-t">${esc(ZH ? lab : lab.toUpperCase())}</text></g>`;
        xx += ww + 4;
      });
      s += `<text class="rp-vals" x="${w - 8}" y="47" text-anchor="end">${esc(vals)}</text>`;
    } else {
      s += `<text class="rp-vals" x="12" y="47">${esc(T.seaVals)}</text>`;
    }
    return s + "</g>";
  }
  function MapView(o = {}) {
    const vb = o.viewBox || `0 0 ${B.W} ${B.H}`;
    let s = `<svg class="map-svg${o.focus ? " focus" : ""}" viewBox="${vb}" preserveAspectRatio="${o.par || "xMidYMin meet"}" xmlns="http://www.w3.org/2000/svg" role="application" aria-label="Map">`;
    s += `<defs>
      <linearGradient id="mkSheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
      <linearGradient id="bandWE" x1="0" y1="0" x2="1" y2="0"><stop offset=".5" stop-color="#8f83b5"/><stop offset=".5" stop-color="#6b5d97"/></linearGradient>
      <filter id="brassGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .17  0 0 0 0 .12  0 0 0 .09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <pattern id="seaLines" width="12" height="7" patternUnits="userSpaceOnUse"><path d="M0 6.5h12" stroke="#5f777c" stroke-width=".7" opacity=".35"/></pattern>
      <radialGradient id="lampG" cx="48%" cy="40%" r="70%"><stop offset="0" stop-color="#fff6df" stop-opacity=".18"/><stop offset=".6" stop-color="#fff6df" stop-opacity="0"/></radialGradient>
      <clipPath id="mapClip"><rect width="${B.W}" height="${B.H}" rx="6"/></clipPath>
    </defs><g clip-path="url(#mapClip)">`;
    s += `<rect class="sea" width="${B.W}" height="${B.H}"/><rect width="${B.W}" height="${B.H}" fill="url(#seaLines)"/>`;
    const order = ["na", "usa", "ussr", "china", "euw", "eue", "me", "asia", "sea", "af", "ca", "sa"];
    let all = ""; for (const k of order) if (B.land[k]) all += B.land[k];
    s += `<path class="coast-2" d="${all}"/><path class="coast-1" d="${all}"/>`;
    for (const k of order) if (B.land[k]) s += `<path class="land land-${k === "na" ? "neutral" : k}" d="${B.land[k]}"/>`;
    s += `<rect width="${B.W}" height="${B.H}" filter="url(#paper)" fill="#fff" opacity=".9" style="mix-blend-mode:multiply"/>`;
    s += `<text class="super-label" x="1250" y="150">U.S.S.R.</text><text class="super-label us" x="26" y="342" style="font-size:78px">U.S.A.</text>`;
    let L = "";
    for (const [a, b, inter] of B.edges) { const A = C(a), D = C(b); L += `<line class="link${inter ? " inter" : ""}" x1="${A.x}" y1="${A.y}" x2="${D.x}" y2="${D.y}"/>`; }
    const [ux, uy] = B.sp.US, [sx, sy] = B.sp.USSR;
    for (const c of B.countries) {
      if (c.sp === "US" && c.id !== 45) L += `<line class="link sp-us" x1="${ux}" y1="${uy}" x2="${c.x}" y2="${c.y}"/>`;
      if (c.sp === "USSR") L += `<line class="link sp-ussr" x1="${sx}" y1="${sy}" x2="${c.x}" y2="${c.y}"/>`;
    }
    const J = C(45);
    L += `<path class="link sp-us" d="M${J.x + 42} ${J.y}H${B.W - 6}"/><path d="M${B.W - 16} ${J.y - 8}l10 8-10 8" fill="none" stroke="var(--ts-us-600)" stroke-width="3"/>`;
    L += `<text class="wrap-label" x="${B.W - 12}" y="${J.y - 14}" text-anchor="end">${esc(T.toUSA)}</text>`;
    L += `<path class="link sp-us" d="M${ux - 56} ${uy}H8"/><path d="M18 ${uy - 8}l-10 8 10 8" fill="none" stroke="var(--ts-us-600)" stroke-width="3"/>`;
    L += `<text class="wrap-label" x="10" y="${uy - 14}">${esc(T.toJapan)}</text>`;
    s += `<g class="links">${L}</g>`;
    if (!o.noPlates) s += PLATES.map(RegionPlate).join("");
    const plate = (side, x, y) => {
      const us = side === "US";
      return `<g transform="translate(${x - 56} ${y - 24})"><rect x="2" y="3" width="112" height="48" rx="4" fill="rgba(0,0,0,.3)"/><rect width="112" height="48" rx="4" fill="${us ? "var(--ts-us-700)" : "var(--ts-ussr-700)"}" stroke="${us ? "#0b1a36" : "#3e0b07"}" stroke-width="1.5"/><rect x="4" y="4" width="104" height="40" rx="2" fill="none" stroke="${us ? "rgba(221,230,245,.5)" : "rgba(243,200,75,.55)"}" stroke-dasharray="3 2"/><g transform="translate(10 12)"><path d="${us ? STAR : HS}" fill="${us ? "#fff" : "var(--ts-ussr-gold)"}"/></g><text x="70" y="33" text-anchor="middle" class="sp-plate-t ${us ? "us" : "ussr"}">${us ? "USA" : "USSR"}</text></g>`;
    };
    s += plate("US", ux, uy) + plate("USSR", sx, sy);
    let boxes = "", front = "";
    for (const c of B.countries) { const b = CountryBox(c, o); if (o.hover === c.id || o.reticle === c.id) front = b; else boxes += b; }
    s += `<g class="boxes">${boxes}${front}</g><g class="annotations">${annotations(o)}</g>`;
    s += `<rect width="${B.W}" height="${B.H}" fill="url(#lampG)" pointer-events="none"/></g>`;
    s += `<rect width="${B.W}" height="${B.H}" rx="6" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="2"/>`;
    return s + "</svg>";
  }

  // ── Console ───────────────────────────────────────────────────────────────────────────────
  function Console(compact) {
    const vp = -2, pos = ((20 - vp) / 40) * 100; // US +20 at the left end, USSR +20 at the right
    if (compact) {
      return `<header class="console ts-grain compact-console">
        <div class="inst"><div class="inst-label">${T.turnShort}</div><div class="ar-readout" style="margin:0">${T.arRead}</div></div>
        <div class="inst defcon"><span class="defcon-num l3">3</span><div class="defcon-sub">DEFCON</div></div>
        <div class="inst vp-mini"><div class="vp-head"><span class="inst-label" style="margin:0">VP</span><span class="vp-read">${T.vpLead}</span></div>
          <div class="vp-scale"><div class="vp-bar"></div><span class="vp-tick mid" style="left:50%"></span><span class="vp-needle" style="left:${pos}%"></span></div></div>
        <div class="console-actions"><button class="icon-btn" aria-label="Menu">${ICON.menu}</button></div>
      </header>`;
    }
    const turns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<i class="${n < 5 ? "done" : n === 5 ? "now" : ""}${n === 4 || n === 8 ? " gap" : ""}">${n}</i>`).join("");
    const ar = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => n === 8 ? `<span class="ar-pip opt" data-n="8"></span>` : `<span class="ar-pip" data-n="${n}"><b class="us ${n < 3 ? "done" : ""}"></b><b class="ussr ${n < 3 ? "done" : n === 3 ? "now" : ""}"></b></span>`).join("");
    const lamps = [5, 4, 3, 2, 1].map((n) => `<span class="lamp l${n}${n === 3 ? " on" : ""}">${n}</span>`).join("");
    let ticks = ""; for (let v = -20; v <= 20; v += 5) ticks += `<span class="vp-tick${v === 0 ? " mid" : ""}" style="left:${((20 - v) / 40) * 100}%"></span>`;
    const mo = (side, n) => `<div class="mo-row ${side}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "f" : ""}${i === 3 ? " req" : ""}"></i>`).join("")}</div>`;
    const sp = (side, n) => `<div class="sp-row ${side}">${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<i class="${i <= n ? "f" : ""}"></i>`).join("")}</div>`;
    return `<header class="console ts-grain">
      <div class="wordmark"><b>Twilight Struggle</b><span>${T.wordSub}</span></div>
      <div class="inst"><div class="inst-label">${T.turn}</div><div class="turn-track">${turns}</div><div class="era-row"><span>${T.early}</span><span class="cur">${T.mid}</span><span>${T.late}</span></div><div class="turn-read">5<small>/10</small> · ${T.midWar}</div></div>
      <div class="inst"><div class="inst-label">${T.ar}</div><div class="ar-track">${ar}</div><div class="ar-readout">${T.arRead}</div></div>
      <div class="inst defcon"><span class="defcon-num l3">3</span><div><div class="defcon-lamps">${lamps}</div><div class="defcon-sub" style="margin-top:4px">${T.defconSub3}</div></div></div>
      <div class="inst vp"><div class="vp-head"><span class="inst-label" style="margin:0">${T.vp}</span><span class="vp-read">${T.vpLead}</span></div>
        <div class="vp-scale"><div class="vp-bar"></div>${ticks}<span class="vp-needle" style="left:${pos}%"></span></div>
        <div class="vp-ends"><span class="us">${glyph("US")} ${T.us} 20</span><span class="zero">0</span><span class="ussr">${T.ussr} 20 ${glyph("USSR")}</span></div></div>
      <div class="inst milops"><div class="inst-label">${T.milops}</div><div class="milops-grid"><span class="side-tag us">${glyph("US")}2</span>${mo("us", 2)}<span class="side-tag ussr">${glyph("USSR")}1</span>${mo("ussr", 1)}</div></div>
      <div class="inst space"><div class="inst-label">${T.space}</div><div class="space-grid"><span class="side-tag us">${glyph("US")}3</span>${sp("us", 3)}<span class="side-tag ussr">${glyph("USSR")}2</span>${sp("ussr", 2)}</div></div>
      <div class="spacer"></div>
      <div class="console-actions"><div class="lang-toggle" role="group" aria-label="Language"><button aria-pressed="${!ZH}">EN</button><button aria-pressed="${ZH}">中文</button></div>
        <button class="icon-btn" aria-label="Settings">${ICON.gear}</button><button class="icon-btn" aria-label="Menu">${ICON.menu}</button></div>
    </header>`;
  }

  // ── Rail: AdversaryDossier · EffectsStrip · Dispatches ────────────────────────────────────
  const LOG = ZH ? [
    ["turn", "— 第 5 回合 · 战争中期 —"],
    ["sys", "<span class='when'>T5</span> DEFCON 2 → 3。军事行动清零。双方补至 8 张。"],
    ["us", "<span class='when'>T5 头条</span> <span class='who us'>美国</span> 头条打出 <span class='ref'>核潜艇</span>。", "本回合对战场国政变不降低 DEFCON。"],
    ["ussr", "<span class='when'>T5 头条</span> <span class='who ussr'>苏联</span> 头条打出 <span class='ref'>红色恐慌/大清洗</span>。", "本回合美国卡牌行动点数 −1。"],
    ["ussr", "<span class='when'>AR1</span> <span class='who ussr'>苏联</span> · <span class='ref'>伊斯兰革命</span> — 事件。", "移除美国影响力：埃及、约旦。"],
    ["us", "<span class='when'>AR1</span> <span class='who us'>美国</span> · <span class='ref'>去殖民化</span> — 1 行动点数，政变 <span class='ref'>安哥拉</span>。", "<span class='die-ico'>5</span> + 1 − 2 = 4：苏联 −2，美国 +2。随后苏联事件：扎伊尔、越南、埃塞俄比亚、阿尔及利亚 +1。"],
    ["ussr", "<span class='when'>AR2</span> <span class='who ussr'>苏联</span> · <span class='ref'>维利·勃兰特</span> — 事件。", "苏联 +1 VP。西德 +1。北约不再保护西德。"],
    ["us", "<span class='when'>AR2</span> <span class='who us'>美国</span> · <span class='ref'>殖民地后卫部队</span> — 事件。", "美国 +1：尼日利亚、南非、印尼、菲律宾。"],
    ["ussr now", "<span class='when'>AR3</span> <span class='who ussr'>苏联</span> · <span class='ref'>“我们要埋葬你们”</span> — 4 行动点数，影响力。", "伊拉克 +1（控制）· 约旦 +1 · <span class='caret'></span>"],
  ] : [
    ["turn", "— TURN 5 · MID WAR —"],
    ["sys", "<span class='when'>T5</span> DEFCON 2 → 3. Mil ops reset. Both sides draw to 8."],
    ["us", "<span class='when'>T5 HL</span> <span class='who us'>US</span> headlines <span class='ref'>Nuclear Subs</span>.", "Coups in battlegrounds won't lower DEFCON this turn."],
    ["ussr", "<span class='when'>T5 HL</span> <span class='who ussr'>USSR</span> headlines <span class='ref'>Red Scare/Purge</span>.", "US cards −1 Ops this turn."],
    ["ussr", "<span class='when'>AR1</span> <span class='who ussr'>USSR</span> · <span class='ref'>Muslim Revolution</span> — event.", "US influence removed: Egypt, Jordan."],
    ["us", "<span class='when'>AR1</span> <span class='who us'>US</span> · <span class='ref'>Decolonization</span> — 1 Op, coup <span class='ref'>Angola</span>.", "<span class='die-ico'>5</span> + 1 − 2 = 4: USSR −2, US +2. Then USSR event: Zaire, Vietnam, Ethiopia, Algeria +1."],
    ["ussr", "<span class='when'>AR2</span> <span class='who ussr'>USSR</span> · <span class='ref'>Willy Brandt</span> — event.", "+1 VP USSR. W. Germany +1. NATO no longer protects W. Germany."],
    ["us", "<span class='when'>AR2</span> <span class='who us'>US</span> · <span class='ref'>Colonial Rear Guards</span> — event.", "+1 US: Nigeria, S. Africa, Indonesia, Philippines."],
    ["ussr now", "<span class='when'>AR3</span> <span class='who ussr'>USSR</span> · <span class='ref'>“We Will Bury You”</span> — 4 Ops, influence.", "Iraq +1 (control) · Jordan +1 · <span class='caret'></span>"],
  ];
  function Rail(o = {}) {
    const fx = [[21, "us", T.permanent], [55, "ussr", T.permanent], [41, "us", T.thisTurn], [31, "ussr", T.thisTurn]];
    const logs = LOG.map(([k, t, d]) => `<div class="le ${k}">${t}${d ? `<div class="det">${d}</div>` : ""}</div>`).join("");
    const backs = [0, 1, 2, 3].map(() => `<span class="mini card-back"></span>`).join("");
    const status = o.thinking ? "thinking" : o.playing ? "playing" : "";
    return `<aside class="rail ts-grain" aria-label="${T.adversary}">
      <section class="adversary">
        <div class="panel-h"><span>${T.adversary}</span><span class="count">AR 3</span></div>
        <div class="adv-id">${seal("US")}<div><div class="adv-name">${T.advName}</div><div class="adv-sub">${T.advSub}</div></div>
          <span class="adv-status ${status}">${o.thinking ? T.thinking : o.playing ? T.playing : T.waiting}</span></div>
        <div class="adv-hand">${backs}<span class="mini known" data-tag="${T.known}"><img src="${img(26)}" alt="${esc(cname(26))}"></span>
          <div class="adv-meta">${T.cards5}<br>${T.known1}<br><span class="china-note">${T.chinaHeld}</span></div></div>
      </section>
      <section class="effects"><div class="panel-h flush"><span>${T.effects}</span><span class="count">4</span></div>
        <div class="fx-list">${fx.map(([id, side, dur]) => `<span class="fx ${side}">${glyph(side === "us" ? "US" : "USSR", "fx-g")}<img src="${img(id)}" alt="">${esc(cname(id))} <span class="dur">${dur}</span></span>`).join("")}</div></section>
      <section class="log"><div class="panel-h"><span>${T.dispatches}</span><span class="log-filters"><button aria-pressed="true">${T.fAll}</button><button>${T.fPlays}</button><button>${T.fDice}</button></span></div>
        <div class="tape"><div class="tape-fade"></div><div class="tape-inner">${logs}</div></div></section>
    </aside>`;
  }

  // ── Tray: OrdersSlip · Hand · ChinaSlot · Piles ───────────────────────────────────────────
  // Hand order: scoring cards first, then Ops descending, then id (stable within a turn).
  const HAND = [81, 39, 51, 58, 74];
  function Hand(o = {}) {
    const side = (id) => card(id).side === "US" ? "us" : card(id).side === "USSR" ? "ussr" : "neutral";
    return HAND.map((id, i) => {
      const cls = ["hcard", o.lifted === id ? "lifted" : "", o.playable && o.playable.includes(id) ? "playable" : "", o.passive ? "passive" : "", o.hovered === id ? "hovered" : ""].join(" ");
      const rot = (i - (HAND.length - 1) / 2) * 2.2;
      const warn = card(id).scoring ? `<span class="warn-tag">${T.scoringTag}</span>` : "";
      return `<div class="${cls}" style="rotate:${rot}deg" tabindex="0" aria-label="${esc(cname(id))}"><img src="${img(id)}" alt="">${warn}<div class="cap"><span class="ops ${side(id)}">${card(id).ops}</span><span class="nm">${esc(cname(id))}</span></div></div>`;
    }).join("");
  }
  function Tray(slip, o = {}) {
    return `<div class="tray">${slip}
      <div class="hand" aria-label="${T.hand}">${Hand(o)}<span class="hand-label">${T.hand} · ${HAND.length}</span></div>
      <div class="china-slot"><div class="felt"></div><div class="hcard${o.passive ? " passive" : ""}" tabindex="0"><img src="${img(6)}" alt="${esc(cname(6))}"></div><span class="lbl">${T.chinaFaceUp}</span></div>
      <div class="piles" aria-label="Piles">
        <button class="pile"><span class="pi card-back"></span><span class="pl">${T.deck}</span><b>21</b></button>
        <button class="pile"><img class="pi" src="${img(30)}" alt=""><span class="pl">${T.discard}</span><b>14</b></button>
        <button class="pile removed"><img class="pi" src="${img(56)}" alt=""><span class="pl">${T.removed}</span><b>9</b></button>
      </div>
    </div>`;
  }
  const opsChips = (spent, total) => Array.from({ length: total }, (_, i) => `<span class="ops-chip${i < spent ? " spent" : ""}"></span>`).join("");
  function OrdersSlip(p) {
    // p: {stamp, stampSide, title, crumb, cardId, counter:{n,of,label}, chips:{spent,total}, hint, actions, ai}
    return `<section class="slip${p.ai ? " ai" : ""}" aria-live="polite">
      <div class="slip-head"><span>${T.ordersHead}</span><span class="stamp${p.stampSide === "US" ? " us" : ""}">${p.stamp}</span></div>
      <div class="slip-body">
        ${p.cardId ? `<div class="slip-card"><img src="${img(p.cardId)}" alt="${esc(cname(p.cardId))}"><span class="clip"></span></div>` : ""}
        <div class="slip-main">
          <div class="slip-top"><div class="slip-title">${p.title}</div><div class="crumb">${p.crumb}</div>${p.counter ? `<div class="big-count"><b>${p.counter.n}</b><small>/${p.counter.of}</small><span class="lbl">${p.counter.label}</span></div>` : ""}</div>
          ${p.chips ? `<div class="ops-row"><div class="ops-chips">${opsChips(p.chips.spent, p.chips.total)}</div>${p.undo === false ? "" : `<button class="btn btn-ghost btn-sm">${ICON.undo}${T.undo} <kbd>Z</kbd></button>`}</div>` : ""}
          ${p.hint ? `<div class="slip-hint">${p.hint}</div>` : ""}
          ${p.actions ? `<div class="slip-actions">${p.actions}</div>` : ""}
        </div>
      </div>
    </section>`;
  }

  // ── Game screen (desktop/tablet) ──────────────────────────────────────────────────────────
  const root = document.getElementById("app");
  function GameScreen({ map, slip, trayOpts, railOpts, stage, after }) {
    return `<div class="ts-game" data-human="USSR">
      ${Console(false)}
      <main class="table" aria-label="Map"><div class="map-frame">${map}</div><div class="lamp-light"></div>
        <div class="map-tools"><button aria-label="${T.zoomIn}">+</button><button aria-label="${T.zoomOut}">−</button><button aria-label="${T.fit}" class="fit">⤢</button></div>
        ${stage || ""}</main>
      ${Rail(railOpts)}
      ${Tray(slip, trayOpts)}
      ${after || ""}
    </div>`;
  }
  function placeBeside(id, elId, dx = 12, dy = -10) {
    requestAnimationFrame(() => {
      const g = document.querySelector(`.cty[data-id="${id}"]`), el = document.getElementById(elId);
      if (!g || !el) return;
      const r = g.getBoundingClientRect(), host = el.offsetParent.getBoundingClientRect();
      el.style.left = r.right - host.left + dx + "px";
      el.style.top = r.top - host.top + dy + "px";
    });
  }

  function sceneInfluence() {
    const hover = 25; // Iran
    const map = MapView({ focus: true, targets: ussrTargets, hover, ghost: { id: hover, n: 1 }, placed: PLACED, lastAi: LAST_AI, costTags: true });
    const tip = `<div class="map-tip" id="tip"><h4>${esc(ctyName(25))} <span class="chip-bg">${T.tipBg}</span></h4>
      <div class="tip-row"><span>${T.tipStab} · ${T.tipRegion}</span><b>2</b></div>
      <div class="tip-row"><span class="us">${glyph("US")} ${T.us}</span><b>2 · ${T.tipCtrl}</b></div>
      <div class="tip-row"><span class="ussr">${glyph("USSR")} ${T.tipUssrYou}</span><b>0</b></div>
      <div class="tip-delta">+1 → ${T.tipAfter}<br><span class="cost">${T.tipCost}</span></div>
      <div class="tip-key">${T.tipKeys}</div></div>`;
    const slip = OrdersSlip({ stamp: T.yourMove, stampSide: "USSR", title: T.placeInf, crumb: T.crumb, cardId: 50,
      counter: { n: 2, of: 4, label: T.opsLeft }, chips: { spent: 2, total: 4 }, hint: T.infHint });
    root.innerHTML = GameScreen({ map, slip, stage: tip, trayOpts: { passive: true } });
    placeBeside(hover, "tip");
  }

  function scenePlaymode() {
    const map = MapView({ lastAi: LAST_AI });
    const stage = `<div class="stage dim"><div class="playmode">
      <img class="big" src="${img(74)}" alt="${esc(cname(74))}">
      <div class="modes">
        <h2>${T.chooseHow}</h2>
        <div class="card-name">${esc(cname(74))}</div>
        <div class="card-meta">${glyph("US")} ${T.oppCard} · 2 ${T.effOps}</div>
        <button class="mode"><span class="ico">${ICON.event}</span><span><div class="t">${T.modeEvent}</div><div class="d">${T.modeEventD}</div></span><span class="k"><kbd>E</kbd></span></button>
        <div class="ops-group"><div class="gh"><span>${T.operations}</span><span>2 ${T.effOps}</span></div>
        <div class="mode-row">
          <button class="mode focus"><span class="t">${ICON.inf}${T.modeInf}</span><span class="k"><kbd>I</kbd></span></button>
          <button class="mode"><span class="t">${ICON.coup}${T.modeCoup}</span><span class="k"><kbd>C</kbd></span></button>
          <button class="mode"><span class="t">${ICON.realign}${T.modeRealign}</span><span class="k"><kbd>R</kbd></span></button>
        </div>
        <div class="gwarn">${T.opsThen}</div></div>
        <button class="mode"><span class="ico">${ICON.space}</span><span><div class="t">${T.modeSpace}</div><div class="d">${T.modeSpaceD}</div></span><span class="k"><kbd>S</kbd></span></button>
        <div class="foot"><button class="btn btn-dark"><kbd>Esc</kbd> ${T.back}</button><span>${T.backHint}</span></div>
      </div></div></div>`;
    const slip = OrdersSlip({ stamp: T.yourMove, stampSide: "USSR", title: T.chooseHow, crumb: T.pmCrumb, cardId: 74, hint: "E · I · C · R · S" });
    root.innerHTML = GameScreen({ map, slip, stage, trayOpts: { lifted: 74 } });
  }

  function sceneCoup() {
    const targets = new Set(B.countries.filter((c) => inf(c.id)[0] > 0 && c.region !== "eu" && c.region !== "asia").map((c) => c.id));
    const map = MapView({ focus: true, targets, hover: 25, reticle: 25, lastAi: LAST_AI });
    const faces = [[1, "no", "+0"], [2, "no", "+0"], [3, "ok", "+1"], [4, "ok", "+2"], [5, "ok", "+3"], [6, "ok", "+4"]];
    const tip = `<div class="map-tip wide" id="tip"><h4>${T.coupT} · ${esc(ctyName(25))} <span class="chip-bg">${T.tipBg}</span></h4>
      <div class="tip-row"><span>3 ${T.effOps} + ⚀ − 2×2</span><b class="odds-k">${T.success} 4/6</b></div>
      <div class="odds">${faces.map(([d, k, n]) => `<span class="die ${k}">${d}<small>${n}</small></span>`).join("")}</div>
      <div class="tip-delta warnline-tip"><span class="hz"></span>${T.coupWarn}</div><div class="tip-row"><span>${T.milGain}</span></div></div>`;
    const slip = OrdersSlip({ stamp: T.yourMove, stampSide: "USSR", title: `${T.coupT} → ${esc(ctyName(25))}`, crumb: T.coupCrumb, cardId: 51, hint: T.coupHint,
      actions: `<button class="btn btn-primary"><kbd>↵</kbd> ${T.coupConfirm}</button><button class="btn btn-ghost">${ICON.undo}${T.undo}</button>` });
    root.innerHTML = GameScreen({ map, slip, stage: tip, trayOpts: { passive: true } });
    placeBeside(25, "tip");
  }

  function sceneAI() {
    const map = MapView({ reticle: 59 });
    // Smart placement: the affected country (Angola) is right of the map centre → the dock goes top-left.
    const stage = `<div class="reveal-dock left">
        <div class="how">${glyph("US")} ${T.aiPlays}</div>
        <img class="big" src="${img(30)}" alt="${esc(cname(30))}">
        <div class="cap"><div class="banner">${esc(cname(30))}</div><div class="how2">${T.aiHow} → ${esc(ctyName(59))} · 1 ${T.effOps}</div><div class="note">${T.aiNote}</div></div>
      </div>
      <div class="dice-tray" id="dice"><span class="die3d us">${pips(5)}</span><div class="dice-math">5 + 1 ${T.effOps} − 2×1 = <span class="res">4</span><br><span class="sub">${T.aiResult}</span></div></div>`;
    const actions = `<div class="speed-seg" role="radiogroup" aria-label="${T.speed}"><button aria-pressed="true">1×</button><button>2×</button><button>${ICON.skip}</button></div><button class="btn btn-ghost">${T.skip} <kbd>Space</kbd></button>`;
    const slip = OrdersSlip({ ai: true, stamp: "US · AI", stampSide: "US", title: `${T.aiPlays} ${esc(cname(30))}`, crumb: T.aiCrumb, cardId: 30, actions });
    root.innerHTML = GameScreen({ map, slip, stage, railOpts: { playing: true }, trayOpts: { passive: true } });
    placeBeside(59, "dice", 18, -6);
  }
  function pips(n) {
    const on = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n];
    return Array.from({ length: 9 }, (_, i) => `<i style="visibility:${on.includes(i) ? "visible" : "hidden"}"></i>`).join("");
  }

  // ── Compact (phone portrait) ──────────────────────────────────────────────────────────────
  function sceneCompact() {
    const ids = [12, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 11, 19, 20, 51, 54];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const id of ids) { const c = C(id); minX = Math.min(minX, c.x - 50); maxX = Math.max(maxX, c.x + 50); minY = Math.min(minY, c.y - 34); maxY = Math.max(maxY, c.y + 34); }
    const vb = `${minX} ${minY - 46} ${maxX - minX} ${maxY - minY + 60}`;
    const map = MapView({ viewBox: vb, par: "xMidYMid slice", focus: true, targets: ussrTargets, placed: PLACED, lastAi: LAST_AI, costTags: true });
    const count = {}; for (const id of ussrTargets) { const k = REGION_OF(C(id)); count[k] = (count[k] || 0) + 1; }
    const theatres = ["eu", "me", "asia", "sea", "af", "ca", "sa"].map((k) => `<button aria-pressed="${k === "me"}"${count[k] ? "" : " class='none'"}>${T.regions[k]}${count[k] ? `<span class="n">${count[k]}</span>` : ""}</button>`).join("") + `<button>⤢ ${T.fit}</button>`;
    const slip = OrdersSlip({ stamp: T.yourMove, stampSide: "USSR", title: T.placeInf, crumb: T.crumb, cardId: 50,
      counter: { n: 2, of: 4, label: T.opsLeft }, chips: { spent: 2, total: 4 }, hint: T.infHint });
    const thumbs = HAND.slice(0, 3).map((id, i) => `<img src="${img(id)}" alt="" style="--i:${i}">`).join("");
    const dock = `<nav class="dock">
      <button class="dock-hand">${`<span class="thumbs">${thumbs}</span>`}<span class="dl">${T.dock[0]} · 5</span><span class="chev">${ICON.up}</span></button>
      <button>${seal("US")}<span class="dl">${T.dock[1]}</span><span class="badge n">5</span></button>
      <button>${ICON.log}<span class="dl">${T.dock[2]}</span><span class="badge">2</span></button>
      <button>${ICON.status}<span class="dl">${T.dock[3]}</span></button>
    </nav>`;
    root.innerHTML = `<div class="ts-game compact" data-human="USSR">${Console(true)}<div class="theatres">${theatres}</div>
      <main class="table"><div class="map-frame">${map}</div><div class="ticker"><span class="tk-side us">${glyph("US")}</span>${T.ticker}</div>
        <div class="map-tools"><button aria-label="${T.zoomIn}">+</button><button aria-label="${T.zoomOut}">−</button><button aria-label="${T.fit}" class="fit">⤢</button></div></main>
      <div class="sheet"><div class="grab"></div>${slip}</div>${dock}</div>`;
  }

  // ── StartScreen ───────────────────────────────────────────────────────────────────────────
  function sceneStart() {
    root.innerHTML = `<div class="start">
      <div class="table-top">${MapView({ blank: true, noPlates: false })}</div><div class="lamp-pool"></div><div class="vignette"></div><div class="lamp-cone"></div>
      <div class="start-top"><span class="classified">${T.classified}</span>
        <div class="console-actions"><div class="lang-toggle"><button aria-pressed="${!ZH}">EN</button><button aria-pressed="${ZH}">中文</button></div><button class="icon-btn" aria-label="Settings">${ICON.gear}</button></div></div>
      <div class="start-center">
        <div class="kicker">${T.kicker}</div>
        <h1><span>Twilight</span><span>Struggle</span></h1>
        <div class="zh-title">冷战热斗</div>
        <div class="tagline">${T.tagline}</div>
        <div class="sides" role="group">
          <button class="folder us">${seal("US")}<span class="stampx">US</span><div class="nm">${T.pickUS}</div><div class="ds">${T.pickUSd}</div><div class="go">${T.take} →</div></button>
          <button class="folder rand"><svg class="seal" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#c9a24a" stroke="#7d5f1d" stroke-width="2"/><circle cx="24" cy="24" r="17" fill="none" stroke="#7d5f1d" stroke-dasharray="2 2"/><path d="M24 24 L24 6 A18 18 0 0 1 24 42 Z" fill="#a8231a" opacity=".85"/><path d="M24 24 L24 6 A18 18 0 0 0 24 42 Z" fill="#1f4382" opacity=".85"/></svg><div class="nm">${T.pickRand}</div><div class="ds">${T.pickRandd}</div><div class="go">${T.take} →</div></button>
          <button class="folder ussr">${seal("USSR")}<span class="stampx">CCCP</span><div class="nm">${T.pickUSSR}</div><div class="ds">${T.pickUSSRd}</div><div class="go">${T.take} →</div></button>
        </div>
        <div class="start-row"><button class="btn btn-brass resume">▶ ${T.resume}<small>${T.resumeD}</small></button><button class="btn btn-dark">${T.rules} ↗</button><button class="btn btn-dark">${T.settings}</button></div>
        <div class="rule-chips">${T.chips.map((c) => `<span>${c}</span>`).join("")}</div>
      </div>
      <div class="boot-line">${T.boot}<div class="boot-bar"><i></i></div></div>
      <div class="fine">${T.fine}</div>
    </div>`;
  }

  const scenes = { influence: sceneInfluence, playmode: scenePlaymode, coup: sceneCoup, ai: sceneAI, start: sceneStart };
  if (VIEW === "compact" && SCENE !== "start") sceneCompact();
  else (scenes[SCENE] || sceneInfluence)();

  // Hand fit: overlap only as much as needed (React: the same maths in a ResizeObserver, ui-spec §7.2).
  function fitHand() {
    for (const hand of document.querySelectorAll(".ts-game:not(.compact) .hand")) {
      const cards = [...hand.querySelectorAll(":scope > .hcard")];
      if (!cards.length) continue;
      const w = cards[0].offsetWidth, avail = hand.clientWidth - 16, n = cards.length;
      const ov = n > 1 ? Math.max(-8, (n * w - avail) / (n - 1)) : 0;
      cards.forEach((c, i) => { c.style.marginLeft = i ? -ov + "px" : "0"; c.style.marginRight = "0"; c.style.setProperty("--ov", Math.max(0, ov) + "px"); });
    }
  }
  fitHand();
  addEventListener("resize", fitHand);
})();
