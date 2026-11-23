/* Situation Room — design mockup renderer (static; no engine). Scenes are selected with
   ?scene=influence|playmode|coup|ai|headline|scoring|defcon|picker|over|start  &lang=en|zh  &view=desktop|phone
   The production UI is React; this file only paints representative states for review. */
(function () {
  "use strict";
  const B = window.SR_BOARD;
  const Q = new URLSearchParams(location.search);
  const LANG = Q.get("lang") === "zh" ? "zh" : "en";
  const SCENE = Q.get("scene") || "influence";
  const VIEW = Q.get("view") || (window.innerWidth < 700 ? "phone" : "desktop");
  document.documentElement.lang = LANG;
  const CARD_DIR = "../../public/cards/" + (LANG === "zh" ? "zh" : "en") + "/";
  const img = (id) => CARD_DIR + String(id).padStart(3, "0") + ".webp";
  const card = (id) => B.cards[id - 1];
  const cname = (id) => (LANG === "zh" ? card(id).zh : card(id).en);
  const C = (id) => B.countries[id];
  const ctyName = (id, short) => (LANG === "zh" ? (short ? C(id).zhShort : C(id).zh) : short ? C(id).enShort : C(id).en);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ── strings ───────────────────────────────────────────────────────────────────────────────
  const T = {
    en: {
      wordSub: "Playfield · vs DeepStruggle", turn: "Turn", ar: "Action round", early: "Early", mid: "Mid", late: "Late",
      midWar: "Mid War", defcon: "DEFCON", defconSub3: "No coups or realigns in Europe, Asia", vp: "Victory points",
      vpLead: "USSR +2", milops: "Mil ops · need 3", space: "Space race", us: "US", ussr: "USSR", you: "you",
      arRead: "AR 3 · <span class='side-ussr'>USSR</span> <span class='you'>(you)</span>",
      adversary: "Adversary", advName: "United States", advSub: "DeepStruggle AI · full strength",
      waiting: "Waiting", thinking: "Thinking", cards5: "<b>5</b> cards in hand", known1: "1 known", chinaNo: "China Card: yours",
      known: "Known", effects: "In effect", permanent: "permanent", thisTurn: "this turn", dispatches: "Dispatches",
      fAll: "All", fPlays: "Plays", fDice: "Dice", orders: "Orders · Turn 5 · AR 3", yourMove: "Your move",
      placeInf: "Place influence", wwby: "“We Will Bury You” · 4 Ops", remaining: "<b>2</b> of 4 left",
      infHint: "Click a ringed country for +1. Where the US has control, a point costs 2 Ops.",
      undo: "Undo play", undoShort: "Undo", confirm: "Confirm", hand: "Your hand", china: "China Card · face up", deck: "Deck",
      discard: "Discard", removed: "Removed", scoring: "Scoring",
      tipBg: "Battleground", tipStab: "Stability", tipUs: "US", tipUssr: "USSR (you)", tipCtrl: "control",
      tipAfter: "USSR 0 → 1", tipCost: "Costs <b>2 Ops</b> (US-controlled)", tipKeys: "<kbd>Click</kbd> place · <kbd>Right-click</kbd> details",
      regions: { eu: "Europe", me: "Middle East", asia: "Asia", sea: "SE Asia", af: "Africa", ca: "C. America", sa: "S. America" },
      pres: "Pres", dom: "Dom", ctrl: "Ctrl", none: "—", toJapan: "to Japan", toUSA: "to USA",
      fit: "Fit", zoomIn: "Zoom in", zoomOut: "Zoom out",
      // play mode
      chooseHow: "How will you play it?", vfa: "The Voice of America", modeEvent: "Event first", modeEventD: "US event resolves for the US, then you spend 2 Ops.",
      modeInf: "Influence", modeCoup: "Coup", modeRealign: "Realign", modeOpsD: "2 Ops", opsThen: "Then the US event fires: remove 4 USSR influence outside Europe",
      operations: "Operations", backHint: "Undo is free until a die is rolled", modeSpace: "Space race", modeSpaceD: "Discard for a launch: box 2 → 3, roll 1–3. No event.", effOps: "Ops", back: "Back to hand", oppCard: "Opponent's card",
      // coup
      coupT: "Coup", coupSub: "Brezhnev Doctrine · 3 Ops", coupIn: "Iran", coupOdds: "Success on 1–6 · net gain shown per die", coupConfirm: "Launch coup", coupWarn: "Battleground: DEFCON 3 → 2",
      coupHint: "Hover a ringed country for odds. A coup is final: there is no undo after the die.", milGain: "Mil ops +3",
      // ai
      aiPlays: "United States plays", aiHow: "Operations · Coup", aiTarget: "Coup in Angola", aiNote: "USSR card: its event fires after the coup", aiResult: "USSR −2 · US +2 · Mil ops +1", playing: "Playing",
      // headline
      hlTextUS: "If the USSR has The China Card, the USSR must give it to the US (face down, not playable now). If the US already has it, the US receives 2 VP.", hlTextUSSR: "On the US’s next action round it must discard a 2+ Ops card and roll 1–4 to cancel this event; repeat each action round until it succeeds.", hlTitle: "Headline", hlSub: "USSR resolves first: 3 Ops vs 2", hlStamp: "Revealed", hlOrder: "3 vs 2 Ops · USSR resolves first", first: "1st", second: "2nd",
      // scoring
      scSub: "You played Middle East Scoring (#3)", skipHint: "Space / click: continue · Shift: faster", cont: "Continue", scMe: "Middle East scoring", scCard: "Card #3", scPresence: "Presence", scDom: "Domination", scCtrl: "Control", scStatus: "Status", scLevelVp: "Presence / Dom. / Control VP", scBG: "Battlegrounds", scAdj: "Adj. to enemy superpower", scTotal: "Total", scResult: "USSR scores", scNet: "Net +3 USSR",
      // defcon picker
      dfTitle: "How I Learned to Stop Worrying", dfAsk: "Set DEFCON to any level", dfLose: "Ends the game — you lose", dfNow: "Current", dfHold: "Hold to confirm",
      // picker
      pkTitle: "SALT Negotiations", pkAsk: "Take one non-scoring card from the discard pile into your hand", pkNone: "Take no card",
      // over
      overFlash: "FLASH · FLASH · FLASH", overYou: "You win", overStamp: "Game over", overSpark: "Victory points by turn", overWin: "USSR victory", overReason: "Victory points reached 20 during Turn 8, Action Round 4.",
      overVp: "Final VP", overTurn: "Turn", overCoups: "Coups", overTime: "Time", overNew: "New game", overBoard: "Review board", overLog: "Full dispatch log",
      // start
      classified: "Top secret · Eyes only", kicker: "The Cold War, 1945–1989", tagline: "You command one superpower. DeepStruggle commands the other.",
      pickUS: "United States", pickUSd: "Contain communism. Move second in each action round; hold the edge in the Late War.", pickUSSR: "Soviet Union",
      pickUSSRd: "Spread revolution. Move first, start with the China Card and an early lead.", pickRand: "Toss a coin", pickRandd: "Let history decide.", take: "Take command",
      resume: "Resume game · Turn 5", rules: "Rules (GMT living rules)", settings: "Settings", boot: "&gt; ESTABLISHING LINK WITH DEEPSTRUGGLE … MODEL 14.2 / 23 MB", fine: "Fan-made, free, no ads. Twilight Struggle © GMT Games.<br>AI &amp; rules engine: DeepStruggle (MIT).",
      ticker: "US · Colonial Rear Guards: +1 Nigeria, S. Africa, Indonesia, Philippines",
      tabs: ["Map", "Adversary", "Dispatches", "Status"],
      acTitle: "Choose a card", acSub: "Action round 3 · 5 plays left incl. this one", acHint: "Hover or long-press to read a card. Click to play it. The China Card sits on the right.",
      vfaText: "Remove 4 USSR Influence from any countries NOT in Europe (removing no more than 2 Influence per country).",
      zEvent: "Event", zEventV: "fires for the US", zOps: "Effective Ops", zSpace: "Space race", zSpaceV: "box 2 → 3 (1–3)",
      zWarn: "US card: if you use its Ops, its event still happens for the US.", zErrata: "Text shown is the current errata",
    },
    zh: {
      wordSub: "对局台 · 对战 DeepStruggle", turn: "回合", ar: "行动轮", early: "早期", mid: "中期", late: "晚期",
      midWar: "战争中期", defcon: "DEFCON", defconSub3: "不得在欧洲、亚洲政变或调整", vp: "胜利点数",
      vpLead: "苏联 +2", milops: "军事行动 · 需求 3", space: "太空竞赛", us: "美国", ussr: "苏联", you: "你",
      arRead: "第 3 行动轮 · <span class='side-ussr'>苏联</span> <span class='you'>（你）</span>",
      adversary: "对手", advName: "美国", advSub: "DeepStruggle AI · 最强难度",
      waiting: "等待中", thinking: "思考中", cards5: "手牌 <b>5</b> 张", known1: "已知 1 张", chinaNo: "中国牌：在你手中",
      known: "已知", effects: "生效中", permanent: "持续", thisTurn: "本回合", dispatches: "电报记录",
      fAll: "全部", fPlays: "出牌", fDice: "掷骰", orders: "指令 · 第 5 回合 · 第 3 行动轮", yourMove: "轮到你",
      placeInf: "放置影响力", wwby: "“我们要埋葬你们” · 4 行动点数", remaining: "剩余 <b>2</b> / 4",
      infHint: "点击带圈的国家：+1 影响力。在美国控制的国家，每点需 2 行动点数。",
      undo: "撤销本次出牌", undoShort: "撤销", confirm: "确认", hand: "你的手牌", china: "中国牌 · 正面朝上", deck: "抽牌堆",
      discard: "弃牌堆", removed: "移出游戏", scoring: "计分",
      tipBg: "战场国", tipStab: "稳定度", tipUs: "美国", tipUssr: "苏联（你）", tipCtrl: "控制",
      tipAfter: "苏联 0 → 1", tipCost: "需 <b>2 行动点数</b>（美国控制）", tipKeys: "<kbd>点击</kbd> 放置 · <kbd>右键</kbd> 详情",
      regions: { eu: "欧洲", me: "中东", asia: "亚洲", sea: "东南亚", af: "非洲", ca: "中美洲", sa: "南美洲" },
      pres: "存在", dom: "支配", ctrl: "控制", none: "—", toJapan: "往日本", toUSA: "往美国",
      fit: "适应", zoomIn: "放大", zoomOut: "缩小",
      chooseHow: "如何使用这张牌？", vfa: "美国之音", modeEvent: "先结算事件", modeEventD: "美国事件为美国结算，然后你使用 2 行动点数。",
      modeInf: "影响力", modeCoup: "政变", modeRealign: "调整", modeOpsD: "2 行动点数", opsThen: "之后美国事件生效：移除欧洲以外 4 点苏联影响力",
      operations: "行动", backHint: "掷骰之前均可撤销", modeSpace: "太空竞赛", modeSpaceD: "弃牌尝试发射：第 2 → 3 格，掷出 1–3。不触发事件。", effOps: "行动点数", back: "放回手牌", oppCard: "对手的牌",
      coupT: "政变", coupSub: "勃列日涅夫主义 · 3 行动点数", coupIn: "伊朗", coupOdds: "每个骰面的结果", coupConfirm: "发动政变", coupWarn: "战场国：DEFCON 3 → 2",
      coupHint: "悬停带圈国家查看成功率。政变掷骰后无法撤销。", milGain: "军事行动 +3",
      aiPlays: "美国打出", aiHow: "行动 · 政变", aiTarget: "在安哥拉发动政变", aiNote: "苏联牌：政变后触发其事件", aiResult: "苏联 −2 · 美国 +2 · 军事行动 +1", playing: "出牌中",
      hlTextUS: "若苏联持有“中国牌”，苏联必须将其交给美国（正面朝下，不可立即打出）。若美国已持有，美国获得 2 VP。", hlTextUSSR: "在美国的下一个行动轮，美国必须弃掉一张行动点数 ≥2 的牌并掷出 1–4 以取消本事件；每个行动轮重复，直至成功。", hlTitle: "头条", hlSub: "苏联先结算：3 行动点数对 2", hlStamp: "已揭晓", hlOrder: "3 对 2 行动点数 · 苏联先结算", first: "先", second: "后",
      scSub: "你打出了中东计分（#3）", skipHint: "空格 / 点击：继续 · Shift：加速", cont: "继续", scMe: "中东计分", scCard: "卡牌 #3", scPresence: "存在", scDom: "支配", scCtrl: "控制", scStatus: "状态", scLevelVp: "存在 / 支配 / 控制得分", scBG: "战场国", scAdj: "邻接敌方超级大国", scTotal: "合计", scResult: "苏联得分", scNet: "净得 +3 苏联",
      dfTitle: "我如何学会停止恐惧", dfAsk: "将 DEFCON 设为任意等级", dfLose: "游戏结束——你将落败", dfNow: "当前", dfHold: "长按确认",
      pkTitle: "限制战略武器谈判", pkAsk: "从弃牌堆选择一张非计分牌加入手牌", pkNone: "不拿牌",
      overFlash: "急电 · 急电 · 急电", overYou: "你赢了", overStamp: "对局结束", overSpark: "各回合胜利点数", overWin: "苏联胜利", overReason: "第 8 回合第 4 行动轮，胜利点数达到 20。",
      overVp: "最终分数", overTurn: "回合", overCoups: "政变", overTime: "用时", overNew: "新对局", overBoard: "查看地图", overLog: "完整电报记录",
      classified: "绝密 · 仅限阅览", kicker: "冷战 1945–1989", tagline: "你指挥一个超级大国，DeepStruggle 指挥另一个。",
      pickUS: "美国", pickUSd: "遏制共产主义。每个行动轮后手行动；战争晚期占优。", pickUSSR: "苏联",
      pickUSSRd: "输出革命。每个行动轮先手，开局持有中国牌并领先。", pickRand: "掷硬币", pickRandd: "交给历史决定。", take: "开始指挥",
      resume: "继续对局 · 第 5 回合", rules: "规则（GMT 在线规则）", settings: "设置", boot: "&gt; 正在连接 DEEPSTRUGGLE … 模型 14.2 / 23 MB", fine: "爱好者制作，免费，无广告。Twilight Struggle © GMT Games。<br>AI 与规则引擎：DeepStruggle（MIT）。",
      ticker: "美国 · 殖民地后卫部队：尼日利亚、南非、印度尼西亚、菲律宾各 +1",
      tabs: ["地图", "对手", "电报", "状态"],
      acTitle: "选择一张牌", acSub: "第 3 行动轮 · 含本轮还剩 5 次出牌", acHint: "悬停或长按查看卡牌，点击打出。中国牌在右侧。",
      vfaText: "从任意不在欧洲的国家移除 4 点苏联影响力（每个国家移除不超过 2 点影响力）。",
      zEvent: "事件", zEventV: "为美国结算", zOps: "实际行动点数", zSpace: "太空竞赛", zSpaceV: "第 2 → 3 格（1–3）",
      zWarn: "美国牌：若你使用其行动点数，其事件仍会为美国结算。", zErrata: "显示的是最新勘误文本",
    },
  }[LANG];

  // ── glyphs ────────────────────────────────────────────────────────────────────────────────
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
    map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>`,
    adv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="8" height="12" rx="1.5"/><rect x="13" y="7" width="8" height="12" rx="1.5"/></svg>`,
    log: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>`,
    status: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  };

  // ── mock game state (Turn 5, AR 3, human = USSR) ─────────────────────────────────────────────
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
  for (const c of B.countries) {
    if (inf(c.id)[1] > 0 || c.sp === "USSR" || (adj[c.id] || []).some((n) => inf(n)[1] > 0)) ussrTargets.add(c.id);
  }
  const PLACED = { 24: 1, 26: 1 }; // this play: Iraq, Jordan
  const RECENT_US = [53, 63, 39, 40]; // AI's last play (Colonial Rear Guards)

  // ── map SVG ────────────────────────────────────────────────────────────────────────────────
  const BW = B.box.w, BH = B.box.h;
  const REG_INK = { eu: "var(--sr-reg-euw)", me: "var(--sr-reg-me)", asia: "var(--sr-reg-asia)", af: "var(--sr-reg-af)", ca: "var(--sr-reg-ca)", sa: "var(--sr-reg-sa)" };
  function bandFill(c) {
    if (c.sub === "sea") return "var(--sr-reg-sea)";
    if (c.sub === "eue") return "var(--sr-reg-eue)";
    if (c.sub === "euwe") return "url(#bandWE)";
    return REG_INK[c.region];
  }
  const BAND = 19, MK = 30, MKY = BAND + (BH - BAND - MK) / 2;
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
  function countryBox(c, o) {
    const x = c.x - BW / 2, y = c.y - BH / 2;
    const [u, v] = o.inf ? o.inf(c.id) : inf(c.id);
    const ctl = o.inf ? null : controller(c.id);
    const isT = o.targets && o.targets.has(c.id);
    const cls = ["cty", c.bg ? "bg" : "", ctl === "US" ? "ctrl-us" : ctl === "USSR" ? "ctrl-ussr" : "", isT ? "target" : "", o.hover === c.id ? "hover" : "", o.keep && o.keep.has(c.id) ? "keep" : ""].join(" ");
    const name = ctyName(c.id, true);
    const room = BW - (c.bg ? 9 : 6) - 19;
    const nameLen = LANG === "zh" ? name.length * 15.2 : name.length * 7.1;
    const fit = nameLen > room ? ` textLength="${room}" lengthAdjust="spacingAndGlyphs"` : "";
    let s = `<g class="${cls}" data-id="${c.id}" transform="translate(${x} ${y})">`;
    // Two-tone ring: an ink edge under the brass keeps >= 3:1 against sea, land and paper (WCAG 1.4.11).
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
  // Annotations drawn above every box (grease-pencil marks, last-play dots, reticles).
  function annotations(o) {
    let s = "";
    for (const c of B.countries) {
      const x = c.x - BW / 2, y = c.y - BH / 2;
      if (o.placed && o.placed[c.id]) s += `<g class="pencil-mark" transform="translate(${x + BW + 1} ${y - 3})"><ellipse class="pencil-ring" rx="13" ry="10.5" transform="rotate(-12)"/><text class="pencil" x="0" y="5.4" text-anchor="middle">+${o.placed[c.id]}</text></g>`;
      if (o.recent && o.recent.includes(c.id)) s += `<g transform="translate(${x - 1} ${y - 1})"><circle class="recent-dot" r="6.5" style="fill:var(--sr-us-500)"/><path d="M-2.6 0h5.2M0-2.6v5.2" stroke="#fff" stroke-width="1.6"/></g>`;
      if (o.reticle === c.id) {
        const m = 10, L = 15;
        s += `<path class="reticle" transform="translate(${x} ${y})" d="M${-m} ${-m + L}V${-m}H${-m + L} M${BW + m - L} ${-m}H${BW + m}V${-m + L} M${BW + m} ${BH + m - L}V${BH + m}H${BW + m - L} M${-m + L} ${BH + m}H${-m}V${BH + m - L}"/>`;
      }
    }
    return s;
  }
  const REGION_PLATES = [
    // key, centre x, centre y, scoring values (presence · domination · control)
    ["eu", 470, 112, "3·7·★"],
    ["me", 1227, 645, "3·5·7"],
    ["asia", 1440, 470, "3·7·9"],
    ["sea", 1352, 782, LANG === "zh" ? "每国 1 VP · 泰国 2" : "1 VP each · Thailand 2"],
    ["af", 1112, 928, "1·4·6"],
    ["ca", 98, 778, "1·3·5"],
    ["sa", 164, 908, "2·5·6"],
  ];
  const STANDING = { eu: ["pres", "pres"], me: ["pres", "dom"], asia: ["dom", "pres"], sea: null, af: ["pres", "pres"], ca: ["pres", "pres"], sa: ["none", "none"] };
  function regionLabels() {
    let s = "";
    for (const [k, x, y, sc] of REGION_PLATES) {
      const st = STANDING[k];
      const w = 164, h = 56;
      const ink = k === "sea" ? "var(--sr-reg-sea)" : k === "eu" ? "var(--sr-reg-euw)" : REG_INK[k];
      s += `<g class="region-label" transform="translate(${x - w / 2} ${y - 28})">`;
      s += `<rect class="rl-plate" width="${w}" height="${h}" rx="2"/><rect width="5" height="${h}" rx="1" style="fill:${ink}"/>`;
      s += `<text class="rl-name" x="12" y="24">${esc(T.regions[k])}</text>`;
      s += `<text class="rl-sub" x="${w - 8}" y="47" text-anchor="end">${esc(sc)}</text>`;
      if (st) {
        let xx = 12;
        st.forEach((lvl, i) => {
          const side = i === 0 ? "US" : "USSR";
          const lab = lvl === "none" ? T.none : T[lvl];
          const ww = (LANG === "zh" ? lab.length * 13 : lab.length * 7) + 21;
          s += `<g transform="translate(${xx} 33)"><rect width="${ww}" height="17" rx="2" class="rl-chip ${side === "US" ? "us" : "ussr"} ${lvl}"/>`;
          s += `<g transform="translate(3.5 2.6) scale(.5)"><path d="${side === "US" ? STAR : HS}" class="rl-chip-g"/></g>`;
          s += `<text x="${ww / 2 + 7}" y="13" text-anchor="middle" class="rl-chip-t">${esc(lab.toUpperCase())}</text></g>`;
          xx += ww + 4;
        });
      }
      s += "</g>";
    }
    return s;
  }
  function mapSVG(o = {}) {
    const vb = o.viewBox || `0 0 ${B.W} ${B.H}`;
    let s = `<svg class="map-svg${o.focus ? " focus" : ""}" viewBox="${vb}" preserveAspectRatio="${o.par || "xMidYMin meet"}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="World map">`;
    s += `<defs>
      <linearGradient id="mkSheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
      <linearGradient id="bandWE" x1="0" y1="0" x2="1" y2="0"><stop offset=".5" stop-color="#8f83b5"/><stop offset=".5" stop-color="#6b5d97"/></linearGradient>
      <filter id="brassGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .17  0 0 0 0 .12  0 0 0 .09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <pattern id="seaLines" width="12" height="7" patternUnits="userSpaceOnUse"><path d="M0 6.5h12" stroke="#5f777c" stroke-width=".7" opacity=".35"/></pattern>
      <radialGradient id="lampG" cx="48%" cy="40%" r="70%"><stop offset="0" stop-color="#fff6df" stop-opacity=".18"/><stop offset=".6" stop-color="#fff6df" stop-opacity="0"/></radialGradient>
      <clipPath id="mapClip"><rect width="${B.W}" height="${B.H}" rx="6"/></clipPath>
    </defs>`;
    s += `<g clip-path="url(#mapClip)">`;
    s += `<rect class="sea" width="${B.W}" height="${B.H}"/><rect width="${B.W}" height="${B.H}" fill="url(#seaLines)"/>`;
    const order = ["na", "usa", "ussr", "china", "euw", "eue", "me", "asia", "sea", "af", "ca", "sa"];
    let all = ""; for (const k of order) if (B.land[k]) all += B.land[k];
    s += `<path class="coast-2" d="${all}"/><path class="coast-1" d="${all}"/>`;
    for (const k of order) if (B.land[k]) s += `<path class="land land-${k}" d="${B.land[k]}"/>`;
    s += `<rect width="${B.W}" height="${B.H}" filter="url(#paper)" fill="#fff" opacity=".9" style="mix-blend-mode:multiply"/>`;
    s += `<text class="super-label" x="1250" y="150">U.S.S.R.</text><text class="super-label us" x="26" y="342" style="font-size:78px">U.S.A.</text>`;
    // links
    let L = "";
    for (const [a, b, inter] of B.edges) {
      const A = C(a), D = C(b);
      L += `<line class="link${inter ? " inter" : ""}" x1="${A.x}" y1="${A.y}" x2="${D.x}" y2="${D.y}"/>`;
    }
    const [ux, uy] = B.sp.US, [sx, sy] = B.sp.USSR;
    for (const c of B.countries) {
      if (c.sp === "US" && c.id !== 45) L += `<line class="link sp-us" x1="${ux}" y1="${uy}" x2="${c.x}" y2="${c.y}"/>`;
      if (c.sp === "USSR") L += `<line class="link sp-ussr" x1="${sx}" y1="${sy}" x2="${c.x}" y2="${c.y}"/>`;
    }
    const J = C(45);
    L += `<path class="link sp-us" d="M${J.x + 42} ${J.y}H${B.W - 6}"/><path d="M${B.W - 16} ${J.y - 8}l10 8-10 8" fill="none" stroke="var(--sr-us-600)" stroke-width="3"/>`;
    L += `<text x="${B.W - 12}" y="${J.y - 14}" text-anchor="end" style="font:700 12px var(--sr-font-ui);letter-spacing:.1em;fill:var(--sr-us-700);text-transform:uppercase">${esc(T.toUSA)}</text>`;
    L += `<path class="link sp-us" d="M${ux - 56} ${uy}H8"/><path d="M18 ${uy - 8}l-10 8 10 8" fill="none" stroke="var(--sr-us-600)" stroke-width="3"/>`;
    L += `<text x="10" y="${uy - 14}" style="font:700 12px var(--sr-font-ui);letter-spacing:.1em;fill:var(--sr-us-700);text-transform:uppercase">${esc(T.toJapan)}</text>`;
    s += `<g class="links">${L}</g>`;
    s += regionLabels();
    // superpower plates
    const plate = (side, x, y) => {
      const us = side === "US";
      return `<g transform="translate(${x - 56} ${y - 24})"><rect x="2" y="3" width="112" height="48" rx="4" fill="rgba(0,0,0,.3)"/><rect width="112" height="48" rx="4" fill="${us ? "var(--sr-us-700)" : "var(--sr-ussr-700)"}" stroke="${us ? "#0b1a36" : "#3e0b07"}" stroke-width="1.5"/><rect x="4" y="4" width="104" height="40" rx="2" fill="none" stroke="${us ? "rgba(221,230,245,.5)" : "rgba(243,200,75,.55)"}" stroke-dasharray="3 2"/><g transform="translate(10 12) scale(1)"><path d="${us ? STAR : HS}" fill="${us ? "#fff" : "var(--sr-ussr-gold)"}"/></g><text x="${us ? 70 : 70}" y="33" text-anchor="middle" style="font:800 25px var(--sr-font-stencil);letter-spacing:.1em;fill:${us ? "#fff" : "var(--sr-ussr-gold)"}">${us ? "USA" : "USSR"}</text></g>`;
    };
    s += plate("US", ux, uy) + plate("USSR", sx, sy);
    // boxes
    let boxes = "", hoverBox = "";
    for (const c of B.countries) {
      const b = countryBox(c, o);
      if (o.hover === c.id || o.reticle === c.id) hoverBox = b; else boxes += b;
    }
    s += `<g class="boxes">${boxes}${hoverBox}</g><g class="annotations">${annotations(o)}</g>`;
    if (o.extra) s += o.extra;
    s += `<rect width="${B.W}" height="${B.H}" fill="url(#lampG)" pointer-events="none"/>`;
    s += `</g><rect width="${B.W}" height="${B.H}" rx="6" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="2"/>`;
    return s + "</svg>";
  }

  // ── chrome pieces ───────────────────────────────────────────────────────────────────────────
  function consoleBar(phone) {
    const turns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<i class="${n < 5 ? "done" : n === 5 ? "now" : ""}${n === 4 || n === 8 ? " gap" : ""}">${n}</i>`).join("");
    const ar = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => n === 8 ? `<span class="ar-pip opt" data-n="8"></span>` : `<span class="ar-pip" data-n="${n}"><b class="ussr ${n < 3 ? "done" : n === 3 ? "now" : ""}"></b><b class="us ${n < 3 ? "done" : ""}"></b></span>`).join("");
    const lamps = [5, 4, 3, 2, 1].map((n) => `<span class="lamp l${n}${n === 3 ? " on" : ""}">${n}</span>`).join("");
    const vp = -2, pos = ((20 - vp) / 40) * 100; // US +20 at left, USSR at right
    let ticks = ""; for (let v = -20; v <= 20; v += 5) ticks += `<span class="vp-tick${v === 0 ? " mid" : ""}" style="left:${((20 - v) / 40) * 100}%"></span>`;
    const mo = (side, n) => `<div class="mo-row ${side}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "f" : ""}${i === 3 ? " req" : ""}"></i>`).join("")}</div>`;
    const sp = (side, n) => `<div class="sp-row ${side}">${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<i class="${i <= n ? "f" : ""}"></i>`).join("")}</div>`;
    if (phone) {
      return `<header class="console sr-noise" role="banner">
        <div class="inst"><div class="inst-label">${T.turn} 5 · ${T.midWar}</div><div class="ar-readout" style="margin:0;font-size:12px">${T.arRead}</div></div>
        <div class="inst defcon" style="gap:6px"><span class="defcon-num" style="font-size:30px">3</span><div class="defcon-sub" style="max-width:none">DEFCON</div></div>
        <div class="inst" style="flex:1;min-width:0"><div class="vp-head" style="width:auto"><span class="inst-label" style="margin:0">VP</span><span class="vp-read">${T.vpLead}</span></div>
          <div class="vp-scale" style="width:100%;height:14px"><div class="vp-bar" style="top:4px;height:6px"></div><span class="vp-needle" style="left:${pos}%;height:14px;top:0"></span></div></div>
        <div class="console-actions" style="padding-left:4px"><button class="icon-btn" aria-label="Menu">${ICON.menu}</button></div>
      </header>`;
    }
    return `<header class="console sr-noise" role="banner">
      <div class="wordmark"><b>Twilight Struggle</b><span>${T.wordSub}</span></div>
      <div class="inst"><div class="inst-label">${T.turn}</div><div class="turn-track">${turns}</div><div class="era-row"><span>${T.early}</span><span class="cur">${T.mid}</span><span>${T.late}</span></div><div class="turn-read">5<small>/10</small> · ${T.midWar}</div></div>
      <div class="inst"><div class="inst-label">${T.ar}</div><div class="ar-track">${ar}</div><div class="ar-readout">${T.arRead}</div></div>
      <div class="inst defcon"><span class="defcon-num">3</span><div><div class="defcon-lamps">${lamps}</div><div class="defcon-sub" style="margin-top:4px;max-width:132px">${T.defconSub3}</div></div></div>
      <div class="inst vp"><div class="vp-head"><span class="inst-label" style="margin:0">${T.vp}</span><span class="vp-read">${T.vpLead}</span></div>
        <div class="vp-scale"><div class="vp-bar"></div>${ticks}<span class="vp-needle" style="left:${pos}%"></span></div>
        <div class="vp-ends"><span class="us">${glyph("US")} ${T.us} 20</span><span style="color:var(--sr-steel-400)">0</span><span class="ussr">${T.ussr} 20 ${glyph("USSR")}</span></div></div>
      <div class="inst milops"><div class="inst-label">${T.milops}</div><div class="milops-grid"><span class="side-tag us">${glyph("US")}2</span>${mo("us", 2)}<span class="side-tag ussr">${glyph("USSR")}1</span>${mo("ussr", 1)}</div></div>
      <div class="inst space"><div class="inst-label">${T.space}</div><div class="space-grid"><span class="side-tag us">${glyph("US")}3</span>${sp("us", 3)}<span class="side-tag ussr">${glyph("USSR")}2</span>${sp("ussr", 2)}</div></div>
      <div class="spacer"></div>
      <div class="console-actions"><button class="icon-btn lang-compact" aria-label="Language">${LANG === "zh" ? "EN" : "中"}</button><div class="lang-toggle" role="group" aria-label="Language"><button aria-pressed="${LANG === "en"}">EN</button><button aria-pressed="${LANG === "zh"}">中文</button></div>
        <button class="icon-btn" aria-label="Settings">${ICON.gear}</button><button class="icon-btn" aria-label="Menu">${ICON.menu}</button></div>
    </header>`;
  }

  const LOG = {
    en: [
      ["turn", "— TURN 5 · MID WAR —"],
      ["sys", "<span class='when'>T5</span> DEFCON 2 → 3. Mil ops reset. Both sides draw to 8."],
      ["us", "<span class='when'>T5 HL</span> <span class='who us'>US</span> headlines <span class='ref'>Nuclear Subs</span>.", "Coups in battlegrounds won't lower DEFCON this turn."],
      ["ussr", "<span class='when'>T5 HL</span> <span class='who ussr'>USSR</span> headlines <span class='ref'>Red Scare/Purge</span>.", "US cards −1 Ops this turn."],
      ["ussr", "<span class='when'>AR1</span> <span class='who ussr'>USSR</span> · <span class='ref'>Muslim Revolution</span> — event.", "US influence removed: Egypt, Jordan."],
      ["us", "<span class='when'>AR1</span> <span class='who us'>US</span> · <span class='ref'>Decolonization</span> — 1 Op, coup <span class='ref'>Angola</span>.", "<span class='die-ico'>5</span> + 1 − 2 = 4: USSR −2, US +2. Then USSR event: Zaire, Vietnam, Ethiopia, Algeria +1."],
      ["ussr", "<span class='when'>AR2</span> <span class='who ussr'>USSR</span> · <span class='ref'>Willy Brandt</span> — event.", "+1 VP USSR. W. Germany +1. NATO no longer protects W. Germany."],
      ["us", "<span class='when'>AR2</span> <span class='who us'>US</span> · <span class='ref'>Colonial Rear Guards</span> — event.", "+1 US: Nigeria, S. Africa, Indonesia, Philippines."],
      ["ussr now", "<span class='when'>AR3</span> <span class='who ussr'>USSR</span> · <span class='ref'>“We Will Bury You”</span> — 4 Ops, influence.", "Iraq +1 (control) · Jordan +1 · <span class='caret'></span>"],
    ],
    zh: [
      ["turn", "— 第 5 回合 · 战争中期 —"],
      ["sys", "<span class='when'>T5</span> DEFCON 2 → 3。军事行动清零。双方补至 8 张。"],
      ["us", "<span class='when'>T5 头条</span> <span class='who us'>美国</span> 头条打出 <span class='ref'>核潜艇</span>。", "本回合对战场国政变不降低 DEFCON。"],
      ["ussr", "<span class='when'>T5 头条</span> <span class='who ussr'>苏联</span> 头条打出 <span class='ref'>红色恐慌/大清洗</span>。", "本回合美国卡牌行动点数 −1。"],
      ["ussr", "<span class='when'>AR1</span> <span class='who ussr'>苏联</span> · <span class='ref'>伊斯兰革命</span> — 事件。", "移除美国影响力：埃及、约旦。"],
      ["us", "<span class='when'>AR1</span> <span class='who us'>美国</span> · <span class='ref'>去殖民化</span> — 1 行动点数，政变 <span class='ref'>安哥拉</span>。", "<span class='die-ico'>5</span> + 1 − 2 = 4：苏联 −2，美国 +2。随后苏联事件：扎伊尔、越南、埃塞俄比亚、阿尔及利亚 +1。"],
      ["ussr", "<span class='when'>AR2</span> <span class='who ussr'>苏联</span> · <span class='ref'>维利·勃兰特</span> — 事件。", "苏联 +1 VP。西德 +1。北约不再保护西德。"],
      ["us", "<span class='when'>AR2</span> <span class='who us'>美国</span> · <span class='ref'>殖民地后卫部队</span> — 事件。", "美国 +1：尼日利亚、南非、印度尼西亚、菲律宾。"],
      ["ussr now", "<span class='when'>AR3</span> <span class='who ussr'>苏联</span> · <span class='ref'>“我们要埋葬你们”</span> — 4 行动点数，影响力。", "伊拉克 +1（控制）· 约旦 +1 · <span class='caret'></span>"],
    ],
  }[LANG];

  function rail(opts = {}) {
    const fx = [[21, "us", T.permanent], [55, "ussr", T.permanent], [41, "us", T.thisTurn], [31, "ussr", T.thisTurn]];
    const logs = LOG.map(([k, t, d]) => `<div class="le ${k}">${t}${d ? `<div class="det">${d}</div>` : ""}</div>`).join("");
    const backs = [0, 1, 2, 3].map(() => `<span class="mini card-back"></span>`).join("");
    const strip = `<nav class="rail-strip"><button aria-label="${T.adversary}">${seal("US")}<span class="b">5</span></button><button aria-label="${T.effects}">${ICON.status}<span class="b">4</span></button><button aria-label="${T.dispatches}" aria-pressed="true">${ICON.log}<span class="b dot"></span></button></nav>`;
    return `<aside class="rail sr-noise" aria-label="${T.adversary}">${strip}
      <section class="adversary">
        <div class="panel-h"><span>${T.adversary}</span><span class="count">AR 3</span></div>
        <div class="adv-id">${seal("US")}<div><div class="adv-name">${T.advName}</div><div class="adv-sub">${T.advSub}</div></div>
          <span class="adv-status${opts.thinking ? " thinking" : opts.playing ? " playing" : ""}">${opts.thinking ? T.thinking : opts.playing ? T.playing : T.waiting}</span></div>
        <div class="adv-hand">${backs}<span class="mini known" data-tag="${T.known.toUpperCase()}"><img src="${img(26)}" alt="${esc(cname(26))}"></span>
          <div class="adv-meta">${T.cards5}<br>${T.known1}<br><span style="color:var(--sr-ussr-300)">${T.chinaNo}</span></div></div>
      </section>
      <section class="effects"><div class="panel-h" style="padding-left:0;padding-right:0"><span>${T.effects}</span><span class="count">4</span></div>
        <div class="fx-list">${fx.map(([id, side, dur]) => `<span class="fx ${side}"><img src="${img(id)}" alt="">${esc(cname(id))} <span class="dur">${dur}</span></span>`).join("")}</div></section>
      <section class="log"><div class="panel-h"><span>${T.dispatches}</span><span class="log-filters"><button aria-pressed="true">${T.fAll}</button><button>${T.fPlays}</button><button>${T.fDice}</button></span></div>
        <div class="tape"><div class="tape-fade"></div><div class="tape-inner">${logs}</div></div></section>
    </aside>`;
  }

  let HAND = [51, 39, 81, 74, 58];
  function handHTML(o = {}) {
    const side = (id) => card(id).side === "US" ? "us" : card(id).side === "USSR" ? "ussr" : "neutral";
    return HAND.map((id, i) => {
      const cls = ["hcard", o.lifted === id ? "lifted" : "", o.playable && o.playable.includes(id) ? "playable" : "", o.dim && o.dim.includes(id) ? "dim" : "", o.hovered === id ? "hovered" : ""].join(" ");
      const rot = (i - (HAND.length - 1) / 2) * 2.2;
      const warn = card(id).scoring ? `<span class="warn-tag">${T.scoring}</span>` : "";
      return `<div class="${cls}" style="--r:${rot}deg;rotate:${rot}deg" tabindex="0" aria-label="${esc(cname(id))}"><img src="${img(id)}" alt="">${warn}<div class="cap"><span class="ops ${side(id)}">${card(id).ops}</span><span class="nm">${esc(cname(id))}</span></div></div>`;
    }).join("");
  }
  function tray(slip, o = {}) {
    return `<div class="tray">
      ${slip || ""}
      <div class="hand" aria-label="${T.hand}">${handHTML(o)}<span class="hand-label">${T.hand} · ${HAND.length}</span></div>
      <div class="china-slot"><div class="felt"></div><div class="hcard" tabindex="0"><img src="${img(6)}" alt="${esc(cname(6))}"></div><span class="lbl">${T.china}</span></div>
      <div class="piles" aria-label="Piles">
        <button class="pile"><span class="pi card-back"></span><span class="pl">${T.deck}</span><b>21</b></button>
        <button class="pile"><img class="pi" src="${img(30)}" alt=""><span class="pl">${T.discard}</span><b>14</b></button>
        <button class="pile removed"><img class="pi" src="${img(56)}" alt=""><span class="pl">${T.removed}</span><b>9</b></button>
      </div>
    </div>`;
  }
  function influenceSlip() {
    return `<section class="slip" aria-live="polite">
      <div class="slip-head"><span>${T.orders}</span><span class="stamp">${T.yourMove}</span></div>
      <div class="slip-body">
        <div class="slip-card"><img src="${img(50)}" alt="${esc(cname(50))}"><span class="clip"></span></div>
        <div class="slip-main">
          <div class="slip-title">${T.placeInf}</div>
          <div class="slip-sub">${T.wwby}</div>
          <div class="ops-row"><div class="ops-chips"><span class="ops-chip spent"></span><span class="ops-chip spent"></span><span class="ops-chip"></span><span class="ops-chip"></span><span class="ops-count">${T.remaining}</span></div>
            <button class="btn btn-ghost btn-sm" title="${T.undo} (Z)">↶ ${T.undoShort}</button></div>
          <div class="slip-hint">${T.infHint}</div>
        </div>
      </div>
    </section>`;
  }

  // ── scenes ──────────────────────────────────────────────────────────────────────────────────
  const root = document.getElementById("app");

  function gameShell({ map, slip, trayOpts, railOpts, stage, after, phone }) {
    return `<div class="sr-game${phone ? " phone" : ""}">
      ${consoleBar(phone)}
      <main class="table" aria-label="Map"><div class="map-frame">${map}</div><div class="lamp-light"></div>
        ${phone ? "" : `<div class="map-tools"><button aria-label="${T.zoomIn}">+</button><button aria-label="${T.zoomOut}">−</button><button aria-label="${T.fit}" style="font-size:13px">⤢</button></div>`}
        ${stage || ""}</main>
      ${rail(railOpts)}
      ${tray(slip, trayOpts)}
      ${after || ""}
    </div>`;
  }
  function placeTip(id, html, dx = 10) {
    // position an HTML tooltip to the right of a country box, after layout
    requestAnimationFrame(() => {
      const g = document.querySelector(`.cty[data-id="${id}"]`);
      const tip = document.getElementById("tip");
      if (!g || !tip) return;
      const r = g.getBoundingClientRect(), host = tip.offsetParent.getBoundingClientRect();
      tip.style.left = r.right - host.left + dx + "px";
      tip.style.top = r.top - host.top - 10 + "px";
    });
    return `<div class="map-tip" id="tip">${html}</div>`;
  }

  function sceneInfluence() {
    const hover = 25; // Iran
    const map = mapSVG({ focus: true, targets: ussrTargets, hover, ghost: { id: hover, n: 1 }, placed: PLACED, recent: RECENT_US });
    const tip = `<h4>${esc(ctyName(25))} <span class="chip-bg">${T.tipBg}</span></h4>
      <div class="tip-row"><span>${T.tipStab}</span><b>2</b></div>
      <div class="tip-row"><span style="color:var(--sr-us-600)">${glyph("US")} ${T.tipUs}</span><b>2 · ${T.tipCtrl}</b></div>
      <div class="tip-row"><span style="color:var(--sr-ussr-600)">${glyph("USSR")} ${T.tipUssr}</span><b>0</b></div>
      <div class="tip-delta">+1 → ${T.tipAfter}<br><span style="font-weight:500">${T.tipCost}</span></div>
      <div class="tip-key">${T.tipKeys}</div>`;
    root.innerHTML = gameShell({ map, slip: influenceSlip(), stage: placeTip(hover, tip) });
  }

  function scenePlaymode() {
    const map = mapSVG({ recent: RECENT_US });
    const stage = `<div class="stage dim"><div class="playmode">
      <img class="big" src="${img(74)}" alt="${esc(cname(74))}">
      <div class="modes">
        <h2>${T.chooseHow}</h2>
        <div class="card-name">${esc(cname(74))}</div>
        <div style="font:600 12px var(--sr-font-ui);letter-spacing:.14em;color:var(--sr-us-300);text-transform:uppercase;margin:-4px 0 6px">${glyph("US")} ${T.oppCard} · 2 ${T.effOps}</div>
        <button class="mode"><span class="ico">${ICON.event}</span><span><div class="t">${T.modeEvent}</div><div class="d">${T.modeEventD}</div></span><span class="k"><kbd>E</kbd></span></button>
        <div class="ops-group"><div class="gh"><span>${T.operations}</span><span>2 ${T.effOps}</span></div>
        <div class="mode-row">
          <button class="mode focus"><span class="t" style="display:flex;align-items:center;gap:6px"><span class="ico" style="width:24px;height:24px">${ICON.inf}</span>${T.modeInf}</span><span class="k"><kbd>I</kbd></span></button>
          <button class="mode"><span class="t" style="display:flex;align-items:center;gap:6px"><span class="ico" style="width:24px;height:24px">${ICON.coup}</span>${T.modeCoup}</span><span class="k"><kbd>C</kbd></span></button>
          <button class="mode"><span class="t" style="display:flex;align-items:center;gap:6px"><span class="ico" style="width:24px;height:24px">${ICON.realign}</span>${T.modeRealign}</span><span class="k"><kbd>R</kbd></span></button>
        </div>
        <div class="gwarn">${T.opsThen}</div></div>
        <button class="mode"><span class="ico">${ICON.space}</span><span><div class="t">${T.modeSpace}</div><div class="d">${T.modeSpaceD}</div></span><span class="k"><kbd>S</kbd></span></button>
        <div class="foot"><button class="btn btn-dark"><kbd>Esc</kbd> ${T.back}</button><span>${T.backHint}</span></div>
      </div></div></div>`;
    root.innerHTML = gameShell({ map, slip: influenceSlipIdle(), stage, trayOpts: { lifted: 74 } });
  }
  function influenceSlipIdle() {
    return `<section class="slip"><div class="slip-head"><span>${T.orders}</span><span class="stamp">${T.yourMove}</span></div>
      <div class="slip-body"><div class="slip-main"><div class="slip-title">${T.chooseHow}</div><div class="slip-sub">${esc(cname(74))} · 2 ${T.effOps}</div>
      <div class="slip-hint">E · I · C · R · S</div></div></div></section>`;
  }

  function sceneAction() {
    HAND = [50, 51, 39, 81, 74, 58];
    const map = mapSVG({ recent: RECENT_US });
    const slip = frameSlip(T.acTitle, T.acSub, T.acHint, T.yourMove, "USSR");
    const zoom = `<div class="zoom" id="zoom"><img src="${img(74)}" alt="${esc(cname(74))}"><div class="zoom-text">
      <h3>${esc(cname(74))}</h3><div class="meta">#74 · ${glyph("US")} ${T.us} · 2 ${T.effOps} · ${T.midWar}</div>
      <p>${T.vfaText}</p>
      <div class="play-notes"><div><span>${T.zEvent}</span><b style="color:var(--sr-us-600)">${T.zEventV}</b></div><div><span>${T.zOps}</span><b>2</b></div><div><span>${T.zSpace}</span><b>${T.zSpaceV}</b></div></div>
      <div class="warnline">${T.zWarn}</div>
      <div class="errata">${T.zErrata}</div></div></div>`;
    root.innerHTML = gameShell({ map, slip, stage: zoom, trayOpts: { playable: [50, 51, 39, 81, 74, 58], hovered: 74 } });
    requestAnimationFrame(() => {
      const cards = document.querySelectorAll(".hand .hcard"), z = document.getElementById("zoom");
      const c = cards[4].getBoundingClientRect(), host = z.offsetParent.getBoundingClientRect();
      z.style.left = Math.min(c.left - host.left - 60, host.width - 560) + "px"; z.style.top = c.top - host.top - 430 + "px";
    });
  }

  function sceneCoup() {
    const targets = new Set(B.countries.filter((c) => inf(c.id)[0] > 0 && c.region !== "eu" && c.region !== "asia").map((c) => c.id)); // DEFCON 3: no Europe, Asia
    const map = mapSVG({ focus: true, targets, hover: 25, reticle: 25, recent: RECENT_US });
    const faces = [[1, "no", "+0"], [2, "no", "+0"], [3, "ok", "+1"], [4, "ok", "+2"], [5, "ok", "+3"], [6, "ok", "+4"]];
    const tip = `<h4>${T.coupT} · ${esc(ctyName(25))} <span class="chip-bg">${T.tipBg}</span></h4>
      <div class="tip-row"><span>3 ${T.effOps} + ⚀ − 2×2</span><b>4 / 6</b></div>
      <div class="odds">${faces.map(([d, k, n]) => `<span class="die ${k}">${d}<small>${n}</small></span>`).join("")}</div>
      <div class="tip-delta" style="margin-top:16px"><span style="color:var(--sr-alert-700)">▲ ${T.coupWarn}</span><br><span style="font-weight:500">${T.milGain}</span></div>`;
    const slip = `<section class="slip"><div class="slip-head"><span>${T.orders}</span><span class="stamp">${T.yourMove}</span></div>
      <div class="slip-body"><div class="slip-card"><img src="${img(51)}" alt=""><span class="clip"></span></div><div class="slip-main">
      <div class="slip-title">${T.coupT} → ${esc(ctyName(25))}</div><div class="slip-sub">${T.coupSub}</div>
      <div class="slip-hint" style="margin-top:6px">${T.coupHint}</div>
      <div class="slip-actions"><button class="btn btn-primary"><kbd>↵</kbd> ${T.coupConfirm}</button><button class="btn btn-ghost">${T.undo}</button></div></div></div></section>`;
    root.innerHTML = gameShell({ map, slip, stage: placeTip(25, tip) });
  }

  function sceneAI() {
    const map = mapSVG({ reticle: 59 });
    const stage = `<div class="reveal-dock">
        <div class="how">${glyph("US")} ${T.aiPlays}</div>
        <img class="big" src="${img(30)}" alt="${esc(cname(30))}">
        <div class="cap"><div class="banner">${esc(cname(30))}</div><div class="how2">${T.aiHow} → ${esc(ctyName(59))} · 1 ${T.effOps}</div><div class="note">${T.aiNote}</div></div>
      </div>
      <div class="dice-tray" id="dice"><span class="die3d us">${pips(5)}</span><div class="dice-math">5 + 1 ${T.effOps} − 2×1 = <span class="res">4</span><br><span style="opacity:.85;font-weight:500">${T.aiResult}</span></div></div>`;
    root.innerHTML = gameShell({ map, slip: waitingSlip(), stage, railOpts: { playing: true } });
    requestAnimationFrame(() => {
      const g = document.querySelector('.cty[data-id="59"]'), d = document.getElementById("dice");
      const r = g.getBoundingClientRect(), host = d.offsetParent.getBoundingClientRect();
      d.style.left = r.right - host.left + 18 + "px"; d.style.top = r.top - host.top - 6 + "px";
    });
  }
  function pips(n) {
    const on = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n];
    return Array.from({ length: 9 }, (_, i) => `<i style="visibility:${on.includes(i) ? "visible" : "hidden"}"></i>`).join("");
  }
  function frameSlip(title, sub, hint, stamp, stampSide, actions) {
    return `<section class="slip"><div class="slip-head"><span>${T.orders}</span><span class="stamp${stampSide === "US" ? " us" : ""}">${stamp}</span></div>
      <div class="slip-body"><div class="slip-main"><div class="slip-title"${stampSide === "US" ? ' style="color:var(--sr-us-600)"' : ""}>${title}</div>
      <div class="slip-sub">${sub}</div>${hint ? `<div class="slip-hint">${hint}</div>` : ""}${actions ? `<div class="slip-actions" style="margin-top:auto">${actions}</div>` : ""}</div></div></section>`;
  }
  function waitingSlip() {
    return `<section class="slip"><div class="slip-head"><span>${T.orders}</span><span class="stamp us">US · AI</span></div>
      <div class="slip-body"><div class="slip-main"><div class="slip-title" style="color:var(--sr-us-600)">${T.aiPlays} ${esc(cname(30))}</div>
      <div class="slip-sub">${T.aiHow}</div><div class="slip-hint">Space / click: skip animation · Shift: faster</div></div></div></section>`;
  }

  function sceneHeadline() {
    const map = mapSVG({});
    const paper = (id, side, order, right) => `<div class="paper${right ? " r" : ""}"><div class="order">${order}</div>
      <div class="mast">${side === "US" ? "The Washington Dispatch" : "ПРАВДА"}</div>
      <div class="dateline"><span>${side === "US" ? "US headline" : "USSR headline"}</span><span>${T.turn} 6</span><span>${card(id).ops} ${T.effOps}</span></div>
      <div class="hl">${esc(cname(id))}</div>
      <div class="photo"><img src="${img(id)}" alt=""><div class="col">${side === "US" ? T.hlTextUS : T.hlTextUSSR}</div></div>
      <div class="side-band" style="background:${side === "US" ? "var(--sr-us-600)" : "var(--sr-ussr-600)"}"></div></div>`;
    const stage = `<div class="stage dim"><div style="display:flex;flex-direction:column;align-items:center;gap:18px">
      <div style="font:800 15px var(--sr-font-ui);letter-spacing:.4em;color:var(--sr-brass-300);text-transform:uppercase">${T.hlTitle} · ${T.turn} 6</div>
      <div class="headline">${paper(71, "US", T.second, false)}${paper(42, "USSR", T.first, true)}</div>
      <div style="font:600 12px var(--sr-font-ui);letter-spacing:.14em;color:var(--sr-steel-300);text-transform:uppercase">${T.hlOrder}</div></div></div>`;
    root.innerHTML = gameShell({ map, slip: frameSlip(T.hlTitle + " · " + T.turn + " 6", T.hlSub, T.skipHint, T.hlStamp, "USSR"), stage });
  }

  function sceneScoring() {
    const me = new Set([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    const map = mapSVG({ focus: true, keep: me });
    const stage = `<div class="scoring docked" style="position:absolute;left:28px;top:150px;z-index:26">
      <div class="sh"><b>${T.scMe}</b><span>${T.scCard}</span></div>
      <table><tr><th></th><th>${glyph("US")} ${T.us}</th><th>${glyph("USSR")} ${T.ussr}</th></tr>
      <tr><td>${T.scStatus}</td><td><span class="status-chip us">${T.scPresence}</span></td><td><span class="status-chip ussr">${T.scDom}</span></td></tr>
      <tr><td>${T.scLevelVp}</td><td class="us">3</td><td class="ussr">5</td></tr>
      <tr><td>${T.scBG} (+1)</td><td class="us">2</td><td class="ussr">3</td></tr>
      <tr><td>${T.scAdj} (+1)</td><td class="us">0</td><td class="ussr">0</td></tr>
      <tr class="total"><td>${T.scTotal}</td><td class="us">5</td><td class="ussr">8</td></tr></table>
      <div class="result"><span>${T.scResult}</span><b>${T.scNet}</b></div></div>`;
    root.innerHTML = gameShell({ map, slip: frameSlip(T.scMe, T.scSub, T.skipHint, T.yourMove, "USSR", `<button class="btn btn-primary"><kbd>Space</kbd> ${T.cont}</button>`), stage });
  }

  function sceneDefcon() {
    const map = mapSVG({});
    const lv = [[5, "", true], [4, "", true], [3, T.dfNow, true], [2, "", true], [1, T.dfLose, true]];
    const after = `<div class="modal"><div class="dossier"><div class="tab">${T.orders}</div><div class="inner">
      <div style="display:flex;gap:16px;align-items:center"><img src="${img(46)}" style="width:92px;border-radius:5px;box-shadow:0 4px 10px rgba(0,0,0,.3)" alt="">
      <div><div style="font:700 12px var(--sr-font-ui);letter-spacing:.2em;color:var(--sr-ink-500);text-transform:uppercase">${T.dfTitle}</div>
      <div style="font:700 24px/1.1 var(--sr-font-ui);text-transform:uppercase;letter-spacing:.03em;margin-top:4px">${T.dfAsk}</div></div></div>
      <div style="display:flex;gap:10px;margin-top:18px">${lv.map(([n, sub]) => `<button class="btn ${n === 1 ? "btn-danger" : n === 3 ? "btn-brass" : "btn-primary"}" style="flex:1;flex-direction:column;padding:12px 6px;gap:6px;height:92px;justify-content:center"><span style="font:800 40px/0.8 var(--sr-font-stencil)">${n}</span><span style="font-size:10px;letter-spacing:.06em;white-space:normal;line-height:1.1">${sub}</span></button>`).join("")}</div>
      <div style="margin-top:12px;font:500 12px var(--sr-font-body);color:var(--sr-ink-500)">${T.dfHold}: DEFCON 1</div></div></div></div>`;
    root.innerHTML = gameShell({ map, slip: frameSlip(esc(T.dfTitle), T.dfAsk, "", T.yourMove, "USSR"), after });
  }

  function scenePicker() {
    const map = mapSVG({});
    const opts = [19, 36, 63, 87, 73, 103, 26, 48];
    const after = `<div class="modal"><div class="dossier" style="width:860px"><div class="tab">${esc(T.pkTitle)}</div><div class="inner">
      <div style="font:700 22px/1.1 var(--sr-font-ui);text-transform:uppercase;letter-spacing:.03em">${T.pkAsk}</div>
      <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:10px;margin-top:16px">${opts.map((id, i) => `<div style="position:relative"><img src="${img(id)}" style="width:100%;border-radius:5px;box-shadow:${i === 2 ? "0 0 0 3px var(--sr-brass-400)," : ""}0 4px 10px rgba(0,0,0,.3)" alt=""><div style="font:600 10px var(--sr-font-ui);letter-spacing:.08em;color:var(--sr-ink-500);text-transform:uppercase;margin-top:4px">${T.discard}</div></div>`).join("")}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn btn-ghost">${T.pkNone}</button><button class="btn btn-primary">${T.confirm}</button></div></div></div></div>`;
    root.innerHTML = gameShell({ map, slip: frameSlip(esc(T.pkTitle), T.pkAsk, "", T.yourMove, "USSR"), after });
  }

  function vpSpark() {
    // VP at the end of each turn (+ = US). Single series: neutral ink line, polarity by wash + axis words.
    const vp = [0, -3, -5, -1, 2, -2, -6, -11, -20], W = 300, H = 120, x0 = 34, x1 = W - 40, mid = H / 2;
    const X = (i) => x0 + (i / (vp.length - 1)) * (x1 - x0), Y = (v) => mid - (v / 20) * (H / 2 - 8);
    const pts = vp.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    let s = `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T.overSpark}">`;
    s += `<defs><clipPath id="up"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath><clipPath id="dn"><rect x="0" y="${mid}" width="${W}" height="${mid}"/></clipPath></defs>`;
    s += `<polygon points="${X(0)},${mid} ${pts} ${X(vp.length - 1)},${mid}" fill="var(--sr-us-600)" opacity=".14" clip-path="url(#up)"/>`;
    s += `<polygon points="${X(0)},${mid} ${pts} ${X(vp.length - 1)},${mid}" fill="var(--sr-ussr-600)" opacity=".14" clip-path="url(#dn)"/>`;
    s += `<line x1="${x0}" x2="${x1}" y1="${mid}" y2="${mid}" stroke="rgba(34,30,24,.35)" stroke-width="1"/>`;
    for (let i = 1; i < vp.length; i++) s += `<text x="${X(i)}" y="${H - 1}" text-anchor="middle" class="sp-t">${i}</text>`;
    s += `<text x="2" y="16" class="sp-t">${T.us} ↑</text><text x="2" y="${H - 14}" class="sp-t">${T.ussr} ↓</text>`;
    s += `<polyline points="${pts}" fill="none" stroke="var(--sr-ink-900)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const ex = X(vp.length - 1), ey = Y(vp[vp.length - 1]);
    s += `<circle cx="${ex}" cy="${ey}" r="4.5" fill="var(--sr-ink-900)" stroke="var(--sr-paper-50)" stroke-width="2"/><text x="${ex + 8}" y="${ey + 4}" class="sp-t b">20</text>`;
    return s + "</svg>";
  }
  function sceneOver() {
    const map = mapSVG({});
    const after = `<div class="over"><div class="telex"><div class="flash">${T.overFlash}</div>
      <span class="rubber">${T.overYou}</span>
      <h2>${T.overWin}</h2><div class="reason">${T.overReason}</div>
      <div class="over-grid"><div class="stats"><div>${T.overVp}<b>${T.ussr} 20</b></div><div>${T.overTurn}<b>8 · AR4</b></div><div>${T.overCoups}<b>7 / 5</b></div><div>${T.overTime}<b>1:12</b></div></div>
      <figure class="spark-fig"><figcaption>${T.overSpark}</figcaption>${vpSpark()}</figure></div>
      <div class="acts"><button class="btn btn-primary">${T.overNew}</button><button class="btn btn-ghost">${T.overBoard}</button><button class="btn btn-ghost">${T.overLog}</button></div></div></div>`;
    root.innerHTML = gameShell({ map, slip: frameSlip(T.overWin, T.overReason, "", T.overStamp, "USSR"), after });
  }

  function scenePhone() {
    // Middle East + neighbours framed; same influence prompt as the desktop hero shot
    const ids = [12, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 11, 19, 20, 33, 51, 54, 55];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const id of ids) { const c = C(id); minX = Math.min(minX, c.x - 50); maxX = Math.max(maxX, c.x + 50); minY = Math.min(minY, c.y - 34); maxY = Math.max(maxY, c.y + 34); }
    const vb = `${minX} ${minY - 40} ${maxX - minX} ${maxY - minY + 70}`;
    const hover = 25;
    const map = mapSVG({ viewBox: vb, par: "xMidYMid slice", focus: true, targets: ussrTargets, placed: PLACED, recent: RECENT_US });
    const theaters = ["eu", "me", "asia", "sea", "af", "ca", "sa"].map((k) => `<button aria-pressed="${k === "me"}" class="${["eu", "me", "asia", "af"].includes(k) ? "has-targets" : ""}">${T.regions[k]}</button>`).join("") + `<button>⤢ ${T.fit}</button>`;
    const slip = `<div class="slip-dock"><section class="slip"><div class="slip-head"><span>${T.orders}</span><span class="stamp">${T.yourMove}</span></div>
      <div class="slip-body" style="margin-top:9px"><div class="slip-card" style="width:44px;height:62px"><img src="${img(50)}" alt=""><span class="clip" style="left:15px"></span></div>
      <div class="slip-main"><div class="slip-title" style="font-size:17px">${T.placeInf}</div><div class="slip-sub">${T.wwby}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px"><div class="ops-chips" style="margin:0"><span class="ops-chip spent"></span><span class="ops-chip spent"></span><span class="ops-chip"></span><span class="ops-chip"></span><span class="ops-count">${T.remaining}</span></div>
      <button class="btn btn-ghost" style="padding:6px 8px">${T.undo}</button></div></div></div></section></div>`;
    const tabs = `<nav class="tabs">${[ICON.map, ICON.adv, ICON.log, ICON.status].map((ic, i) => `<button aria-pressed="${i === 0}">${ic}${T.tabs[i]}${i === 2 ? `<span class="badge">2</span>` : ""}</button>`).join("")}</nav>`;
    const tip = `<h4 style="font-size:13px">${esc(ctyName(25))} <span class="chip-bg">${T.tipBg}</span></h4><div class="tip-delta" style="margin:0;padding:0;border:0">+1 → ${T.tipAfter}<br><span style="font-weight:500">${T.tipCost}</span></div>`;
    root.innerHTML = `<div class="sr-game phone">${consoleBar(true)}<div class="theaters">${theaters}</div>
      <main class="table"><div class="map-frame">${map}</div><div class="ticker">${T.ticker}</div></main>
      ${slip}<div class="tray"><div class="hand">${handHTML({})}<div class="hcard" style="margin-left:6px"><img src="${img(6)}" alt=""><div class="cap"><span class="ops neutral">4</span><span class="nm">${esc(cname(6))}</span></div></div></div></div>${tabs}</div>`;
  }

  function sceneStart() {
    root.innerHTML = `<div class="start">
      <div class="table-top">${mapSVG({ inf: () => [0, 0] })}</div><div class="lamp-pool"></div><div class="vignette"></div><div class="lamp-cone"></div>
      <div class="start-top"><span class="classified">${T.classified}</span>
        <div class="console-actions"><div class="lang-toggle"><button aria-pressed="${LANG === "en"}">EN</button><button aria-pressed="${LANG === "zh"}">中文</button></div><button class="icon-btn" aria-label="Settings">${ICON.gear}</button></div></div>
      <div class="start-center">
        <div class="kicker">${T.kicker}</div>
        <h1><span>Twilight</span><span>Struggle</span></h1>
        <div class="zh-title">冷战热斗</div>
        <div class="tagline">${T.tagline}</div>
        <div class="sides">
          <button class="folder us">${seal("US")}<span class="stampx">US</span><div class="nm">${T.pickUS}</div><div class="ds">${T.pickUSd}</div><div class="go">${T.take} →</div></button>
          <button class="folder rand"><svg class="seal" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#c9a24a" stroke="#7d5f1d" stroke-width="2"/><circle cx="24" cy="24" r="17" fill="none" stroke="#7d5f1d" stroke-dasharray="2 2"/><path d="M24 24 L24 6 A18 18 0 0 1 24 42 Z" fill="#a8231a" opacity=".85"/><path d="M24 24 L24 6 A18 18 0 0 0 24 42 Z" fill="#1f4382" opacity=".85"/></svg><div class="nm">${T.pickRand}</div><div class="ds">${T.pickRandd}</div><div class="go">${T.take} →</div></button>
          <button class="folder ussr">${seal("USSR")}<span class="stampx">CCCP</span><div class="nm">${T.pickUSSR}</div><div class="ds">${T.pickUSSRd}</div><div class="go">${T.take} →</div></button>
        </div>
        <div class="start-row"><button class="btn btn-brass">▶ ${T.resume}</button><button class="btn btn-dark">${T.rules} ↗</button><button class="btn btn-dark">${T.settings}</button></div>
      </div>
      <div class="boot-line">${T.boot}<div class="boot-bar"><i></i></div></div>
      <div class="fine">${T.fine}</div>
    </div>`;
  }

  const scenes = { action: sceneAction, influence: sceneInfluence, playmode: scenePlaymode, coup: sceneCoup, ai: sceneAI, headline: sceneHeadline, scoring: sceneScoring, defcon: sceneDefcon, picker: scenePicker, over: sceneOver, start: sceneStart };
  if (VIEW === "phone" && SCENE !== "start") scenePhone();
  else (scenes[SCENE] || sceneInfluence)();
  // Fanned hand: overlap only as much as needed to fit (React: same maths in a ResizeObserver).
  function fitHand() {
    for (const hand of document.querySelectorAll(".sr-game:not(.phone) .hand")) {
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
