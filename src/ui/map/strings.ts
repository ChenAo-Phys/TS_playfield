/**
 * Map UI strings. The keys are the `ui:` keys ui-spec §14.1 asks the i18n owner to add
 * (`ui:map.*`, `ui:plate.*`, `ui:tip.*`); until they exist in the catalogs, these local English and
 * Chinese texts are the default values. A catalog entry, once added, wins (and the pseudo-language
 * marks it). Chinese follows docs/glossary.md.
 */
import type { DataLang } from "../../data";
import { language, t } from "../../i18n";
import type { RegionSlot } from "./contract";

const EN = {
  "map.ariaMap": "Map",
  "map.toUSA": "To USA",
  "map.toJapan": "To Japan",
  "map.cost2": "2 Ops",
  "map.toControl": "→ control",
  "map.zoomIn": "Zoom in",
  "map.zoomOut": "Zoom out",
  "map.world": "World",
  "map.control": "Control",
  "map.lost": "Lost",
  "map.countryLabel": "{{name}}, {{region}}{{bg}}, stability {{stab}}, US {{us}}{{usCtrl}}, USSR {{ussr}}{{ussrCtrl}}{{target}}",
  "map.aria.bg": ", battleground",
  "map.aria.controlled": " controlled",
  "map.aria.target": ", legal target",
  "map.aria.targetCost2": ", legal target: costs 2 Ops",
  "map.plateLabel": "{{region}}: if scored now, {{net}}",
  "plate.ifScored": "If scored",
  "plate.spent": "Scored",
  "plate.removed": "Removed",
  "plate.spentTip": "{{card}} was played: it cannot come back before the next reshuffle",
  "plate.removedTip": "{{card}} was played and is out of the game",
  "plate.even": "Even",
  "plate.net": "{{side}} +{{vp}}",
  "plate.wins": "{{side}} wins",
  "plate.pres": "Pres",
  "plate.dom": "Dom",
  "plate.ctrl": "Ctrl",
  "plate.none": "—",
  "plate.values.0": "3·7·★",
  "plate.values.1": "3·7·9",
  "plate.values.2": "3·5·7",
  "plate.values.3": "1·4·6",
  "plate.values.4": "1·3·5",
  "plate.values.5": "2·5·6",
  "plate.values.6": "1 VP each · Thailand 2",
  "plate.name.0": "Europe",
  "plate.name.1": "Asia",
  "plate.name.2": "Middle East",
  "plate.name.3": "Africa",
  "plate.name.4": "C. America",
  "plate.name.5": "S. America",
  "plate.name.6": "SE Asia",
  "plate.table.countries": "Countries",
  "plate.table.battlegrounds": "Battlegrounds",
  "plate.table.adjacent": "Adjacent to enemy superpower",
  "plate.table.base": "Status VP",
  "plate.table.total": "Total",
  "plate.table.status": "Status",
  "tip.stabilityRegion": "Stability · {{region}}",
  "tip.you": "(you)",
  "tip.control": "control",
  "tip.battleground": "Battleground",
  "tip.keys.inspect": "Right-click or Space: keep this open",
  "tip.keys.inspectTouch": "Tap elsewhere to close",
  "side.US": "US",
  "side.USSR": "USSR",
} as const;

export type MapStringKey = keyof typeof EN;

const ZH: Record<MapStringKey, string> = {
  "map.ariaMap": "地图",
  "map.toUSA": "往美国",
  "map.toJapan": "往日本",
  "map.cost2": "2 点",
  "map.toControl": "→ 控制",
  "map.zoomIn": "放大",
  "map.zoomOut": "缩小",
  "map.world": "全图",
  "map.control": "控制",
  "map.lost": "失去",
  "map.countryLabel": "{{name}}，{{region}}{{bg}}，稳定度 {{stab}}，美国 {{us}}{{usCtrl}}，苏联 {{ussr}}{{ussrCtrl}}{{target}}",
  "map.aria.bg": "，战场国",
  "map.aria.controlled": "（控制）",
  "map.aria.target": "，可选目标",
  "map.aria.targetCost2": "，可选目标：需 2 行动点",
  "map.plateLabel": "{{region}}：若现在计分，{{net}}",
  "plate.ifScored": "若计分",
  "plate.spent": "已计分",
  "plate.removed": "已移出",
  "plate.spentTip": "{{card}}已打出：下次洗牌前不会再出现",
  "plate.removedTip": "{{card}}已打出并移出游戏",
  "plate.even": "持平",
  "plate.net": "{{side}} +{{vp}}",
  "plate.wins": "{{side}}获胜",
  "plate.pres": "存在",
  "plate.dom": "支配",
  "plate.ctrl": "控制",
  "plate.none": "—",
  "plate.values.0": "3·7·★",
  "plate.values.1": "3·7·9",
  "plate.values.2": "3·5·7",
  "plate.values.3": "1·4·6",
  "plate.values.4": "1·3·5",
  "plate.values.5": "2·5·6",
  "plate.values.6": "每国 1 VP · 泰国 2",
  "plate.name.0": "欧洲",
  "plate.name.1": "亚洲",
  "plate.name.2": "中东",
  "plate.name.3": "非洲",
  "plate.name.4": "中美洲",
  "plate.name.5": "南美洲",
  "plate.name.6": "东南亚",
  "plate.table.countries": "国家",
  "plate.table.battlegrounds": "战场国",
  "plate.table.adjacent": "与敌方超级大国相邻",
  "plate.table.base": "状态 VP",
  "plate.table.total": "合计",
  "plate.table.status": "状态",
  "tip.stabilityRegion": "稳定度 · {{region}}",
  "tip.you": "（你）",
  "tip.control": "控制",
  "tip.battleground": "战场国",
  "tip.keys.inspect": "右键或空格键：固定此提示",
  "tip.keys.inspectTouch": "轻触别处关闭",
  "side.US": "美国",
  "side.USSR": "苏联",
};

const LOCAL: Record<DataLang, Record<MapStringKey, string>> = { en: EN, zh: ZH };

type Params = Record<string, string | number>;

function interpolate(s: string, params?: Params): string {
  return params ? s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

const tLoose = t as unknown as (key: string, opts: Record<string, unknown>) => string;

/** A map string in `lang`. When the page language is `lang`, a catalog entry `ui:<key>` wins. */
export function mapText(lang: DataLang, key: MapStringKey, params?: Params): string {
  const local = interpolate(LOCAL[lang][key], params);
  const page = language();
  const pageLang: DataLang = page === "zh-CN" ? "zh" : "en";
  if (pageLang !== lang) return local;
  try {
    return tLoose(`ui:${key}`, { ...params, defaultValue: local });
  } catch {
    return local;
  }
}

export const plateName = (lang: DataLang, slot: RegionSlot): string => mapText(lang, `plate.name.${slot}` as MapStringKey);
