import seed from '../data/midnight-tier-set-bonuses.json' with { type: 'json' };

type TierEntry={className:string;spec:string;twoPiece:string;fourPiece:string;source:string};
type TierSeason='season1'|'season2';
const normalized=(value:string|undefined)=>String(value||'').trim().toLocaleLowerCase().replace(/[ _-]+/g,'');

/** Midnight Season 1 tier item IDs begin at 250000; Season 2 items use the
 * later item-ID range. This is a display-only fallback until catalog set
 * season metadata is available. */
export function tierSeasonForItem(itemId:number):TierSeason { return itemId>=260000?'season2':'season1'; }
export function tierBonusFor(className:string|undefined,spec:string|undefined,itemId:number){
  const entries=(seed.sets[tierSeasonForItem(itemId)]||[]) as TierEntry[];
  return entries.find(entry=>normalized(entry.className)===normalized(className)&&normalized(entry.spec)===normalized(spec));
}
export const tierBonusVersion=seed.version;
