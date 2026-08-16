import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './tooltips.css';

export type TooltipItem={itemId?:number;name?:string;itemLevel?:number;slot?:string;source?:string;enchant?:string;gems?:string[];bonusIds?:number[]};
type Props={item:TooltipItem;children:ReactNode;className?:string};
const cache=new Map<string,any>();
const endpoint=(item:TooltipItem)=>{
  if(!item.itemId)return undefined;
  const params=new URLSearchParams();
  if(item.itemLevel)params.set('itemLevel',String(item.itemLevel));
  if(item.bonusIds?.length)params.set('bonusIds',item.bonusIds.join('/'));
  if(item.name)params.set('name',item.name);
  if(item.slot)params.set('slot',item.slot);
  if(item.source)params.set('source',item.source);
  if(item.enchant)params.set('enchant',item.enchant);
  if(item.gems?.length)params.set('gems',item.gems.join('/'));
  return `/api/catalog/items/${item.itemId}/tooltip?${params}`;
};
const quality=['#9d9d9d','#ffffff','#1eff00','#0070dd','#a335ee','#ff8000','#e6cc80','#00ccff'];

export function renderWowText(text: string | undefined) {
  if (!text) return text;
  const parts = text.split(/(\|c[0-9a-fA-F ]{8}|\|r)/i);
  if (parts.length === 1) return text;
  const result = [];
  let currentColor: string | undefined;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.toLowerCase().startsWith('|c')) {
      const hex = part.slice(2).replace(/ /g, '0');
      currentColor = `#${hex.slice(2)}`;
    } else if (part.toLowerCase() === '|r') {
      currentColor = undefined;
    } else if (part) {
      if (currentColor) {
        result.push(<span key={i} style={{color: currentColor}}>{part}</span>);
      } else {
        result.push(part);
      }
    }
  }
  return result;
}

export function GameItemIcon({item,children,className='item-icon'}:Props){
  const [visible,setVisible]=useState(false),[pinned,setPinned]=useState(false),[position,setPosition]=useState({left:0,top:0});
  const [data,setData]=useState<any>(); const timer=useRef<number>(); const target=useRef<HTMLSpanElement>(null);
  const key=`${item.itemId||'none'}|${item.itemLevel||''}|${item.bonusIds?.join('/')||''}`;
  const move=()=>{const rect=target.current?.getBoundingClientRect();if(!rect)return;const width=Math.min(350,window.innerWidth-20),left=Math.max(10,Math.min(window.innerWidth-width-10,rect.right+12));const top=Math.max(10,Math.min(window.innerHeight-20,rect.top));setPosition({left,top});};
  const open=()=>{move();setVisible(true);const url=endpoint(item);if(!url)return;const prior=cache.get(key);if(prior){setData(prior);return;}fetch(url,{cache:'no-store'}).then(r=>r.ok?r.json():undefined).then(value=>{if(value){cache.set(key,value);setData(value);}}).catch(()=>undefined);};
  const close=()=>{if(!pinned)setVisible(false);};
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setPinned(false);setVisible(false);}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  const schedule=()=>{window.clearTimeout(timer.current);timer.current=window.setTimeout(open,160);};
  const lines=data?.lines||[{left:item.name||'Unknown item',kind:'name'},...(item.itemLevel?[{left:`Item Level ${item.itemLevel}`,kind:'level'}]:[]),{left:'Live tooltip has not been captured locally.',kind:'missing'}];
  return <><span ref={target} className={className} tabIndex={0} role="img" aria-label={item.name||item.slot||'Item'} onPointerEnter={schedule} onPointerLeave={()=>{window.clearTimeout(timer.current);close();}} onFocus={open} onBlur={close} onClick={()=>{setPinned(value=>!value);open();}}>{children}</span>{visible&&createPortal(<div className="wow-tooltip" role="tooltip" style={{left:position.left,top:position.top}} onPointerEnter={()=>setPinned(true)} onPointerLeave={()=>{setPinned(false);setVisible(false)}}><div className="wow-tooltip-inner">{lines.map((line:any,index:number)=><div key={`${index}-${line.left||''}`} className={`wow-tooltip-line ${line.kind||''}`}><span style={line.leftColor?{color:line.leftColor}:index===0?{color:quality[data?.capture?.quality||2]}:undefined}>{renderWowText(line.left)}</span>{line.right&&<span style={line.rightColor?{color:line.rightColor}:undefined}>{renderWowText(line.right)}</span>}</div>)}{data?.status==='item-match'&&<div className="wow-tooltip-note">Nearest local variant capture</div>}{data?.status==='missing'&&<div className="wow-tooltip-note">Use /lsdtooltips in WoW, then /reload.</div>}</div></div>,document.body)}</>;
}

/**
 * The current dashboard has icon markup in several independently rendered
 * views.  Delegate hover/focus handling so every existing and future
 * `.item-icon` automatically receives the same local tooltip.
 */
export function GlobalItemTooltip(){
  const [target,setTarget]=useState<HTMLElement>(); const [data,setData]=useState<any>();
  const [position,setPosition]=useState({left:0,top:0}); const timer=useRef<number>();
  const itemFor=(icon:HTMLElement):TooltipItem=>{
    const src=(icon.querySelector('img') as HTMLImageElement|undefined)?.src||'';
    const itemId=Number(src.match(/\/items\/(\d+)\/icon/)?.[1]);
    const container=icon.closest('label, .drops > div, .drop-result-row, .result-hero, .result-gear')||icon.parentElement;
    const name=container?.querySelector('b,strong')?.textContent?.trim()||container?.textContent?.trim().split('\n')[0];
    return {itemId:itemId||undefined,name,slot:icon.getAttribute('aria-label')||undefined};
  };
  const show=(icon:HTMLElement)=>{const rect=icon.getBoundingClientRect(),width=Math.min(350,window.innerWidth-20);setPosition({left:Math.max(10,Math.min(window.innerWidth-width-10,rect.right+12)),top:Math.max(10,Math.min(window.innerHeight-20,rect.top))});setTarget(icon);const item=itemFor(icon),url=endpoint(item);if(!url){setData({status:'missing',lines:[{left:item.name||'Item information unavailable',kind:'name'},{left:'This icon has no captured item link.',kind:'missing'}]});return;}const key=`${item.itemId}|${item.itemLevel||''}`;const prior=cache.get(key);if(prior){setData(prior);return;}setData(undefined);fetch(url,{cache:'no-store'}).then(r=>r.ok?r.json():undefined).then(value=>{if(value){cache.set(key,value);setData(value);}}).catch(()=>undefined);};
  useEffect(()=>{
    const promote=()=>document.querySelectorAll<HTMLElement>('.item-icon').forEach(icon=>{if(icon.tabIndex<0)icon.tabIndex=0;icon.setAttribute('role','img');});
    promote();const observer=new MutationObserver(promote);observer.observe(document.body,{childList:true,subtree:true});
    const over=(event:PointerEvent)=>{const icon=(event.target as HTMLElement).closest?.('.item-icon') as HTMLElement|undefined;if(!icon)return;window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>show(icon),160);};
    const out=(event:PointerEvent)=>{const icon=(event.target as HTMLElement).closest?.('.item-icon') as HTMLElement|undefined;if(icon&&!(event.relatedTarget instanceof Node&&icon.contains(event.relatedTarget))){window.clearTimeout(timer.current);setTarget(undefined);}};
    const focus=(event:FocusEvent)=>{const icon=(event.target as HTMLElement).closest?.('.item-icon') as HTMLElement|undefined;if(icon)show(icon);};
    const blur=(event:FocusEvent)=>{if((event.target as HTMLElement).closest?.('.item-icon'))setTarget(undefined);};
    document.addEventListener('pointerover',over);document.addEventListener('pointerout',out);document.addEventListener('focusin',focus);document.addEventListener('focusout',blur);
    return()=>{observer.disconnect();window.clearTimeout(timer.current);document.removeEventListener('pointerover',over);document.removeEventListener('pointerout',out);document.removeEventListener('focusin',focus);document.removeEventListener('focusout',blur);};
  },[]);
  if(!target)return null;
  const lines=data?.lines||[{left:'Loading local tooltip…',kind:'missing'}];
  return createPortal(<div className="wow-tooltip" role="tooltip" style={{left:position.left,top:position.top}}><div className="wow-tooltip-inner">{lines.map((line:any,index:number)=><div key={`${index}-${line.left||''}`} className={`wow-tooltip-line ${line.kind||''}`}><span style={line.leftColor?{color:line.leftColor}:index===0?{color:quality[data?.capture?.quality||2]}:undefined}>{renderWowText(line.left)}</span>{line.right&&<span style={line.rightColor?{color:line.rightColor}:undefined}>{renderWowText(line.right)}</span>}</div>)}{data?.status==='item-match'&&<div className="wow-tooltip-note">Nearest local variant capture</div>}{data?.status==='missing'&&<div className="wow-tooltip-note">Use /lsdtooltips in WoW, then /reload.</div>}</div></div>,document.body);
}
