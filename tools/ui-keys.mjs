#!/usr/bin/env node
/**
 * The `ui` keys of the War Table UI (docs/design/ui-spec.md §14.1, §5–§12), English and Chinese.
 *
 * Source of truth for the keys this file lists: `node tools/ui-keys.mjs` deep-merges them into
 * src/i18n/locales/{en,zh-CN}/ui.json (a listed key overwrites the catalog value; keys not listed
 * here are kept untouched, except the RETIRED_KEYS, which it deletes). `--check` exits 1 if a catalog
 * differs from this file.
 * tests/i18n/ui-keys.test.ts checks the same and that every §14.1 key exists in both languages.
 *
 * Chinese follows docs/glossary.md: 稳定度, 调整, DEFCON, VP, N 行动点 with a number (行动点数 without),
 * one space between Han and Latin/digits, full-width punctuation, …… and “”.
 * In sentences `{{side}}` takes the long side name (`ui:side.long.*`), in labels the short one (`ui:side.*`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** [en, zh] leaves. */
export const UI_KEYS = {
  side: {
    US: ["US", "美国"],
    USSR: ["USSR", "苏联"],
    long: { US: ["United States", "美国"], USSR: ["Soviet Union", "苏联"] },
  },
  game: {
    undo: ["Undo play", "撤销本次出牌"],
  },
  a11y: {
    skipToMap: ["Skip to map", "跳到地图"],
  },
  slip: {
    orders: ["Orders · Turn {{turn}} · AR {{ar}}", "指令 · 第 {{turn}} 回合 · 第 {{ar}} 行动轮"],
    ordersHeadline: ["Orders · Turn {{turn}} · Headline", "指令 · 第 {{turn}} 回合 · 头条"],
    ordersSetup: ["Orders · Setup", "指令 · 初始设置"],
    stamp: { you: ["Your move", "轮到你"], ai: ["{{side}} · AI", "{{side}} · AI"] },
    verb: {
      influence: ["Place influence", "放置影响力"],
      "coup-target": ["Coup", "政变"],
      "realign-target": ["Realign", "调整"],
    },
    counter: {
      ops: ["Ops left", "剩余点数"],
      left: ["Left", "剩余"],
      rolls: ["Rolls left", "剩余次数"],
      // The same labels by PromptKind (spec §8.1 says `ui:slip.counter.<kind>`).
      "setup-place": ["Left", "剩余"],
      "bid-place": ["Left", "剩余"],
      influence: ["Ops left", "剩余点数"],
      "realign-target": ["Rolls left", "剩余次数"],
      "event-target": ["Left", "剩余"],
    },
    hint: {
      influence: [
        "Click a ringed country: +1 influence. {{cost}} marks opponent control: a point there costs 2.",
        "点击带圈的国家：+1 影响力。标有 {{cost}} 的国家由对手控制，每点需 2 行动点。",
      ],
      headline: [
        "The AI chooses at the same time. Higher Ops resolves first; the US on a tie.",
        "AI 同时选择。行动点数高者先结算，相同时美国先结算。",
      ],
      coupFinal: [
        "A coup is final once the die is rolled. Click {{country}} again or press Enter.",
        "政变一经掷骰便无法撤销。再次点击{{country}}或按回车确认。",
      ],
      "coup-target": ["A coup is final once the die is rolled.", "政变一经掷骰便无法撤销。"],
      asiaBonus: [
        "The China Card gives +1 Op if every point goes to Asia.",
        "若全部点数用于亚洲，中国牌额外 +1 行动点。",
      ],
    },
    confirm: {
      coup: ["Launch coup", "发动政变"],
      realign: ["Roll in {{country}}", "在{{country}}调整"],
      headline: ["Commit headline", "确定头条"],
      play: ["Play {{card}}", "打出{{card}}"],
      score: ["Score {{region}} now", "立即为{{region}}计分"],
      take: ["Take {{card}}", "拿取{{card}}"],
      discard: ["Discard {{card}}", "弃掉{{card}}"],
      give: ["Give {{card}}", "给出{{card}}"],
    },
    ai: {
      waiting: ["Waiting for the {{side}}…", "等待{{side}}……"],
      plays: ["{{side}} plays {{card}}", "{{side}}打出{{card}}"],
      preparing: ["Getting the AI ready… {{percent}}%", "正在准备 AI…… {{percent}}%"],
    },
    skip: ["Skip", "跳过"],
    skipAll: ["Skip to my turn", "跳到我的回合"],
    continue: ["Continue", "继续"],
    list: ["List", "列表"],
    speed: ["Speed", "速度"],
  },
  stamp: {
    headline: ["Headline", "头条"],
    discard: ["Discard", "弃掉"],
    give: ["Give", "给出"],
    play: ["Play", "打出"],
    committed: ["Committed", "已提交"],
    revealed: ["Revealed", "已揭晓"],
    cancelled: ["Cancelled", "已取消"],
    pass: ["Pass", "放弃"],
  },
  mode: {
    howTitle: ["How will you play it?", "如何使用这张牌？"],
    event: ["Event", "事件"],
    eventFirst: ["Event first", "先结算事件"],
    eventDesc: ["Resolve the event", "结算事件"],
    operations: ["Operations", "行动"],
    influence: ["Influence", "影响力"],
    coup: ["Coup", "政变"],
    realign: ["Realign", "调整"],
    space: ["Space race", "太空竞赛"],
    un: ["Play {{card}} on it", "对其打出{{card}}"],
    back: ["Back to hand", "放回手牌"],
    undoFree: ["Undo is free until a die is rolled", "掷骰之前均可撤销"],
  },
  track: {
    defconRule: {
      5: ["No restrictions", "无限制"],
      4: ["No coups or realignments in Europe", "欧洲禁止政变与调整"],
      3: ["No coups or realignments in Europe, Asia", "欧洲、亚洲禁止政变与调整"],
      2: ["No coups or realignments in Europe, Asia, Middle East", "欧洲、亚洲、中东禁止政变与调整"],
      1: ["Nuclear war", "核战争"],
    },
    // The console caption (≤ 40 characters, ui-spec §14); the full rule above is for tooltips and the DEFCON dossier.
    defconRuleShort: {
      5: ["No restrictions", "无限制"],
      4: ["No coups/realigns: Europe", "欧洲禁止政变与调整"],
      3: ["No coups/realigns: Europe, Asia", "欧洲、亚洲禁止政变与调整"],
      2: ["No coups/realigns: Europe, Asia, M. East", "欧洲、亚洲、中东禁止政变与调整"],
      1: ["Nuclear war", "核战争"],
    },
    milopsNeed: ["Mil ops · need {{n}}", "军事行动 · 需 {{n}}"],
    short: ["{{side}} short by {{n}}", "{{side}}还差 {{n}}"],
  },
  plate: {
    ifScored: ["If scored", "若计分"],
    spent: ["Scored", "已计分"],
    removed: ["Removed", "已移出"],
    spentTip: ["{{card}} was played: it cannot come back before the next reshuffle", "{{card}}已打出：下次洗牌前不会再出现"],
    removedTip: ["{{card}} was played and is out of the game", "{{card}}已打出并移出游戏"],
    even: ["Even", "持平"],
    net: ["{{side}} +{{vp}}", "{{side}} +{{vp}}"],
    wins: ["{{side}} wins", "{{side}}获胜"],
    pres: ["Pres", "存在"],
    dom: ["Dom", "支配"],
    ctrl: ["Ctrl", "控制"],
    none: ["—", "—"],
    values: {
      0: ["3·7·★", "3·7·★"],
      1: ["3·7·9", "3·7·9"],
      2: ["3·5·7", "3·5·7"],
      3: ["1·4·6", "1·4·6"],
      4: ["1·3·5", "1·3·5"],
      5: ["2·5·6", "2·5·6"],
      6: ["1 VP each · Thailand 2", "每国 1 VP · 泰国 2"],
    },
    name: {
      0: ["Europe", "欧洲"],
      1: ["Asia", "亚洲"],
      2: ["Middle East", "中东"],
      3: ["Africa", "非洲"],
      4: ["C. America", "中美洲"],
      5: ["S. America", "南美洲"],
      6: ["SE Asia", "东南亚"],
    },
    table: {
      status: ["Status", "状态"],
      countries: ["Countries", "国家"],
      battlegrounds: ["Battlegrounds", "战场国"],
      adjacent: ["Adjacent to enemy superpower", "与敌方超级大国相邻"],
      base: ["Status VP", "状态 VP"],
      total: ["Total", "合计"],
    },
  },
  map: {
    ariaMap: ["Map", "地图"],
    countryLabel: [
      "{{name}}, {{region}}{{bg}}, stability {{stab}}, US {{us}}{{usCtrl}}, USSR {{ussr}}{{ussrCtrl}}{{target}}",
      "{{name}}，{{region}}{{bg}}，稳定度 {{stab}}，美国 {{us}}{{usCtrl}}，苏联 {{ussr}}{{ussrCtrl}}{{target}}",
    ],
    aria: {
      bg: [", battleground", "，战场国"],
      controlled: [" controlled", "（控制）"],
      target: [", legal target", "，可选目标"],
      targetCost2: [", legal target: costs 2 Ops", "，可选目标：需 2 行动点"],
    },
    plateLabel: ["{{region}}: if scored now, {{net}}", "{{region}}：若现在计分，{{net}}"],
    cost2: ["2 Ops", "2 点"],
    toUSA: ["To USA", "往美国"],
    toJapan: ["To Japan", "往日本"],
    toControl: ["→ control", "→ 控制"],
    control: ["Control", "控制"],
    lost: ["Lost", "失去"],
    zoomIn: ["Zoom in", "放大"],
    zoomOut: ["Zoom out", "缩小"],
    world: ["World", "全图"],
  },
  tip: {
    stabilityRegion: ["Stability · {{region}}", "稳定度 · {{region}}"],
    you: ["(you)", "（你）"],
    control: ["control", "控制"],
    // The map shows `tip.battleground` as a plain chip; the coup consequence line is `battlegroundDefcon`.
    battleground: ["Battleground", "战场国"],
    battlegroundDefcon: ["Battleground: DEFCON {{from}} → {{to}}", "战场国：DEFCON {{from}} → {{to}}"],
    costs2: ["Costs 2 Ops ({{side}}-controlled)", "需 2 行动点（{{side}}控制）"],
    success: ["Success {{k}}/6", "成功 {{k}}/6"],
    milops: ["Mil ops +{{n}}", "军事行动 +{{n}}"],
    keys: {
      place: ["Click place · Right-click details", "点击放置 · 右键详情"],
      coup: ["Click select · Click again to launch", "点击选中 · 再次点击发动"],
      inspect: ["Right-click or Space: keep this open", "右键或空格键：固定此提示"],
      inspectTouch: ["Tap elsewhere to close", "轻触别处关闭"],
    },
  },
  adversary: {
    title: ["Adversary", "对手"],
    sub: ["DeepStruggle AI · full strength", "DeepStruggle AI · 全力以赴"],
    waiting: ["Waiting", "等待中"],
    thinking: ["Thinking", "思考中"],
    playing: ["Playing", "出牌中"],
    hand_one: ["{{count}} card in hand", null],
    hand_other: ["{{count}} cards in hand", "手牌 {{count}} 张"],
    known: ["{{count}} known", "已知 {{count}} 张"],
    knownTag: ["Known", "已知"],
    china: ["China Card: {{where}}", "中国牌：{{where}}"],
    chinaWhere: {
      mine: ["yours", "在你手中"],
      theirs: ["theirs", "在 AI 手中"],
      mineFaceDown: ["yours · face down", "在你手中 · 正面朝下"],
      theirsFaceDown: ["theirs · face down", "在 AI 手中 · 正面朝下"],
    },
  },
  effects: {
    title: ["In effect", "生效中"],
    duration: {
      PERMANENT: ["Permanent", "永久"],
      TURN: ["This turn", "本回合"],
      CONDITIONAL: ["Conditional", "有条件"],
      SPACE_PERK: ["Space perk", "太空竞赛特权"],
    },
  },
  log: {
    title: ["Dispatches", "电报"],
    filter: { all: ["All", "全部"], plays: ["Plays", "出牌"], dice: ["Dice", "掷骰"] },
    jump: ["Jump to latest", "跳到最新"],
    turnSep: ["Turn {{turn}} · {{era}}", "第 {{turn}} 回合 · {{era}}"],
  },
  banner: {
    turn: ["Turn {{turn}} · {{era}}", "第 {{turn}} 回合 · {{era}}"],
    era: {
      mid: ["Mid War: new cards shuffled in", "战争中期：新卡牌已洗入抽牌堆"],
      late: ["Late War: new cards shuffled in", "战争晚期：新卡牌已洗入抽牌堆"],
    },
    headlinePhase: ["Headline phase", "头条阶段"],
  },
  toast: {
    reshuffle: [
      "Deck exhausted: discards reshuffled. Cards still in hands are now known to both sides.",
      "抽牌堆耗尽：弃牌堆已洗入。手中剩余的牌双方均已知晓。",
    ],
    defcon2: ["DEFCON 2: a battleground coup now ends the game.", "DEFCON 2：此时对战场国政变将结束游戏。"],
    china: [
      "The China Card passes to the {{side}}, face down until next turn.",
      "中国牌交给{{side}}，正面朝下，下回合才能打出。",
    ],
  },
  scoring: {
    kickerYou: ["You played {{card}}", "你打出{{card}}"],
    kickerAi: ["The {{side}} played {{card}}", "{{side}}打出{{card}}"],
    cardNumber: ["Card #{{id}}", "卡牌 #{{id}}"],
    status: ["Status", "状态"],
    statusName: {
      NONE: ["—", "—"],
      PRESENCE: ["Presence", "存在"],
      DOMINATION: ["Domination", "支配"],
      CONTROL: ["Control", "控制"],
    },
    countries: ["Countries", "国家"],
    battlegrounds: ["Battlegrounds", "战场国"],
    adjacent: ["Adjacent to enemy superpower", "与敌方超级大国相邻"],
    base: ["Status VP", "状态 VP"],
    total: ["Total", "合计"],
    scores: ["{{side}} scores", "{{side}}得分"],
    net: ["Net {{side}} +{{n}}", "净得 {{side}} +{{n}}"],
    europeControl: ["Europe control: game over", "控制欧洲：游戏结束"],
    final: ["Final scoring", "最终计分"],
  },
  headline: {
    papers: { us: ["The Washington Dispatch", "华盛顿快讯"], ussr: ["ПРАВДА", "真理报"] },
    order: ["{{a}} vs {{b}} Ops · {{side}} resolves first", "{{a}} 对 {{b}} 行动点 · {{side}}先结算"],
    dateline: ["{{side}} headline · Turn {{turn}} · Ops {{ops}}", "{{side}}头条 · 第 {{turn}} 回合 · {{ops}} 行动点"],
  },
  over: {
    flash: ["Flash · Flash · Flash", "急电 · 急电 · 急电"],
    verdict: ["{{side}} victory", "{{side}}胜利"],
    youWin: ["You win", "你赢了"],
    youLose: ["You lose", "你输了"],
    draw: ["Draw", "平局"],
    vpBefore: ["VP before the ruling", "裁定前 VP"],
    chart: ["Victory points by turn", "各回合 VP"],
    review: ["Review board", "查看地图"],
    fullLog: ["Full log", "完整电报"],
    gameOver: ["Game over", "游戏结束"],
  },
  start: {
    classified: ["Top secret · Eyes only", "绝密 · 仅限阅览"],
    kicker: ["The Cold War, 1945–1989", "冷战 1945–1989"],
    titleLine1: ["Twilight", "Twilight"],
    titleLine2: ["Struggle", "Struggle"],
    titleZh: ["冷战热斗", "冷战热斗"],
    tagline: [
      "You command one superpower. DeepStruggle commands the other.",
      "你指挥一个超级大国，DeepStruggle 指挥另一个。",
    ],
    pick: { US: ["United States", "美国"], USSR: ["Soviet Union", "苏联"], random: ["Toss a coin", "掷硬币"] },
    pickDesc: {
      US: [
        "Moves second each action round. Sets up 7 in Western Europe, then the +2 bid.",
        "每个行动轮后手。在西欧放置 7 点影响力，再加 2 点竞价。",
      ],
      USSR: [
        "Moves first each action round. Starts with the China Card and 6 in Eastern Europe.",
        "每个行动轮先手。开局持有中国牌，在东欧放置 6 点影响力。",
      ],
      random: ["Let history decide.", "交给历史决定。"],
    },
    stamp: { US: ["US", "US"], USSR: ["CCCP", "CCCP"] },
    take: ["Take command", "开始指挥"],
    resume: ["Resume game", "继续对局"],
    resumeDetail: [
      "Turn {{turn}} · AR {{ar}} · you are the {{side}} · {{ago}}",
      "第 {{turn}} 回合 · 第 {{ar}} 行动轮 · 你执{{side}} · {{ago}}",
    ],
    resumeDetailHeadline: [
      "Turn {{turn}} · Headline · you are the {{side}} · {{ago}}",
      "第 {{turn}} 回合 · 头条 · 你执{{side}} · {{ago}}",
    ],
    replaces: ["This replaces your saved game.", "这会覆盖已保存的对局。"],
    startNew: ["Start new", "开始新对局"],
    rules: ["Rules (GMT living rules)", "规则（GMT 在线规则）"],
    chips: {
      standard: ["Standard rules + optional cards #104–110", "标准规则 + 可选卡牌 #104–110"],
      bid: ["US bid +2", "美国竞价 +2"],
      tournament: [
        "Tournament rule: holding a scoring card at turn end loses",
        "锦标赛规则：回合结束时持有计分牌即判负",
      ],
      ai: ["AI at full strength · no difficulty levels", "AI 全力以赴 · 无难度分级"],
    },
    boot: {
      link: ["Linking with DeepStruggle", "正在连接 DeepStruggle"],
      engine: ["Rules engine", "规则引擎"],
      model: ["AI model", "AI 模型"],
      verify: ["Verify", "校验"],
      start: ["Start AI", "启动 AI"],
      ready: ["Ready", "就绪"],
    },
    fine: ["Fan-made, free, no ads. Twilight Struggle © GMT Games.", "爱好者制作，免费，无广告。冷战热斗 © GMT Games。"],
    fineEngine: ["AI & rules engine: DeepStruggle (MIT).", "AI 与规则引擎：DeepStruggle（MIT）。"],
    credits: ["Credits & licenses", "致谢与许可证"],
  },
  settings: {
    cardImages: ["Card images", "卡牌图片"],
    cardImagesOption: { follow: ["Follow the language", "跟随语言"], en: ["English", "English"], zh: ["中文", "中文"] },
    motion: {
      label: ["Motion", "动效"],
      system: ["Follow system", "跟随系统"],
      reduce: ["Reduced", "减少"],
      full: ["Full", "完整"],
    },
    confirmFinal: ["Confirm the action that ends your play", "结束本次出牌前确认"],
    confirmFinalHint: [
      "Dice rolls and game-ending choices always ask first.",
      "掷骰和会结束游戏的选择总是需要确认。",
    ],
    pauseOnReveals: ["Pause on headlines and scoring", "头条和计分时暂停"],
    mapLabels: ["Map labels", "地图文字"],
    mapLabelsValue: ["{{percent}}%", "{{percent}}%"],
    patterns: ["Side patterns (for monochrome viewing)", "阵营图案（便于黑白显示）"],
    followAction: ["Follow the action with the camera (desktop)", "镜头跟随行动（桌面版）"],
  },
  shortcuts: {
    title: ["Keyboard shortcuts", "键盘快捷键"],
    row: {
      focus: ["Move between console, map, orders, hand and rail", "在仪表盘、地图、指令、手牌和侧栏之间移动"],
      mapArrows: ["Map: move between countries, targets first", "地图：在国家之间移动，可选目标优先"],
      cycleTargets: ["Map: previous / next target", "地图：上一个 / 下一个目标"],
      regions: ["Map: jump to a region", "地图：跳到某个区域"],
      enter: ["Activate · confirm a staged choice", "执行 · 确认已选中的操作"],
      holdEnter: ["Hold to confirm", "长按确认"],
      space: ["Inspect a country · zoom a card · skip the animation", "查看国家 · 放大卡牌 · 跳过动画"],
      shiftSpace: ["Skip to my turn", "跳到我的回合"],
      esc: ["Cancel the selection · close · back to hand", "取消选中 · 关闭 · 放回手牌"],
      undo: ["Undo play", "撤销本次出牌"],
      done: ["Done / pass", "完成 / 放弃"],
      modes: ["Play mode: Event, Influence, Coup, Realign, Space race", "使用方式：事件、影响力、政变、调整、太空竞赛"],
      targets: ["Target list", "目标列表"],
      log: ["Show or hide the rail · open the log", "显示或隐藏侧栏 · 打开电报"],
      camera: ["Zoom in · zoom out · whole map", "放大 · 缩小 · 全图"],
      help: ["This list", "本列表"],
    },
    key: {
      focus: ["Tab / Shift+Tab", "Tab / Shift+Tab"],
      mapArrows: ["Arrow keys", "方向键"],
      cycleTargets: ["[ ]", "[ ]"],
      regions: ["1–7", "1–7"],
      enter: ["Enter", "回车"],
      holdEnter: ["Hold Enter", "按住回车"],
      space: ["Space", "空格"],
      shiftSpace: ["Shift+Space", "Shift+空格"],
      esc: ["Esc", "Esc"],
      undo: ["Z · Ctrl/⌘+Z", "Z · Ctrl/⌘+Z"],
      done: ["D", "D"],
      modes: ["E I C R S", "E I C R S"],
      targets: ["T", "T"],
      log: ["L", "L"],
      camera: ["+ − 0", "+ − 0"],
      help: ["?", "?"],
    },
  },
  loading: {
    // QA Q-013: a first visit downloads the model and onnxruntime's WebAssembly (~3.7 MB compressed) plus the app:
    // ~10 MB in all, not just the model's {{mb}}.
    firstTime: [
      "The first visit downloads about 10 MB (the AI model is {{mb}} MB of it); your browser keeps it for next time.",
      "首次访问约需下载 10 MB（其中 AI 模型 {{mb}} MB），之后由浏览器缓存。",
    ],
  },
};

/**
 * Keys no surface uses any more: the generator deletes them from both catalogs (merging alone never
 * removes a key), and `--check` fails while one is still there.
 * - `slip.ai.stillThinking`: the slip's AI wait now uses `ui_prompts:ai.stillThinking` /
 *   `ai.stillThinkingSlow` / `ai.slowHint` (OrdersSlip.tsx, aiWait.ts; QA round 2 R-005).
 */
export const RETIRED_KEYS = ["slip.ai.stillThinking"];

/** The rows of the shortcut sheet, in display order (ui-spec §12). */
export const SHORTCUT_ROWS = Object.keys(UI_KEYS.shortcuts.row);

/** Split UI_KEYS into one nested object per language; `null` leaves are skipped (e.g. no zh `_one`). */
export function catalogs() {
  const out = { en: {}, zh: {} };
  const walk = (node, en, zh) => {
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v)) {
        if (v[0] != null) en[k] = v[0];
        if (v[1] != null) zh[k] = v[1];
      } else walk(v, (en[k] ??= {}), (zh[k] ??= {}));
    }
  };
  walk(UI_KEYS, out.en, out.zh);
  return out;
}

/** Deep-merge `add` into `base` (add wins on leaves; base key order kept, new keys appended). */
export function merge(base, add) {
  const out = { ...base };
  for (const [k, v] of Object.entries(add)) {
    out[k] = typeof v === "object" && v && typeof out[k] === "object" && out[k] ? merge(out[k], v) : v;
  }
  return out;
}

/** Delete each dotted key of `keys` from the nested catalog `tree` (a copy); emptied parents go too. */
export function retire(tree, keys = RETIRED_KEYS) {
  const out = structuredClone(tree);
  for (const key of keys) {
    const path = key.split(".");
    const parents = [out];
    for (const k of path.slice(0, -1)) {
      const next = parents.at(-1)?.[k];
      if (!next || typeof next !== "object") break;
      parents.push(next);
    }
    if (parents.length !== path.length) continue;
    delete parents.at(-1)[path.at(-1)];
    for (let i = parents.length - 1; i > 0 && Object.keys(parents[i]).length === 0; i--) delete parents[i - 1][path[i - 1]];
  }
  return out;
}

const FILES = { en: "src/i18n/locales/en/ui.json", zh: "src/i18n/locales/zh-CN/ui.json" };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const cats = catalogs();
  let stale = false;
  for (const lang of ["en", "zh"]) {
    const path = join(ROOT, FILES[lang]);
    const before = readFileSync(path, "utf8");
    const after = JSON.stringify(retire(merge(JSON.parse(before), cats[lang])), null, 2) + "\n";
    if (before === after) continue;
    if (check) {
      console.error(`${FILES[lang]} is stale: run node tools/ui-keys.mjs`);
      stale = true;
    } else {
      writeFileSync(path, after);
      console.log(`wrote ${FILES[lang]}`);
    }
  }
  if (stale) process.exit(1);
}
