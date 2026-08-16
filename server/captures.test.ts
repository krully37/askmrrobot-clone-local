import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeCapture, normalized } from './captures.js';

const token=(value:unknown)=>{const body=JSON.stringify(value);return `LSDC1.${Buffer.from(body).toString('base64url')}.${createHash('sha256').update(body).digest('hex')}`;};
describe('addon capture transport',()=>{
  it('accepts a complete checksum-protected Retail capture',()=>{
    const value=decodeCapture(token({schema:1,season:'midnight-season-2',clientBuild:'12.1.0 (1)',records:[{source:'The Venomous Abyss',boss:'Fixture',difficulty:'Normal',itemId:123,itemLevel:700,bonusIds:[1],capturedAt:'2026-08-14T00:00:00.000Z',clientBuild:'12.1.0'}]}));
    expect(value.records[0].itemLevel).toBe(700);
  });
  it('preserves ordered live tooltip lines without executing addon data',()=>{
    const value=decodeCapture(token({schema:1,season:'midnight-season-2',clientBuild:'12.1.0 (1)',records:[{source:'The Venomous Abyss',boss:'Fixture',difficulty:'Normal',itemId:123,itemLevel:700,bonusIds:[1],tooltip:{name:'Fixture Blade',quality:3,lines:[{left:'Fixture Blade',kind:'name',leftColor:'#0070dd'},{left:'Item Level 700',kind:'level'},{left:'+100 Agility',kind:'stat'}]},capturedAt:'2026-08-14T00:00:00.000Z',clientBuild:'12.1.0'}]}));
    expect(value.records[0].tooltip?.lines).toHaveLength(3);
    expect(value.records[0].tooltip?.lines[2].left).toBe('+100 Agility');
  });
  it('accepts tooltip payload text with escaped carriage returns',()=>{
    const value=decodeCapture(token({schema:1,season:'midnight-season-2',clientBuild:'12.1.0 (1)',records:[{source:'Player inventory',category:'inventory',difficulty:'inventory',track:'bags',itemId:123,itemLevel:700,bonusIds:[],tooltip:{name:'Fixture',quality:3,lines:[{left:'First line\r\nSecond line',kind:'description'}]},capturedAt:'2026-08-14T00:00:00.000Z',clientBuild:'12.1.0'}]}));
    expect(value.records[0].tooltip?.lines[0].left).toBe('First line\r\nSecond line');
  });
  it('repairs bonus IDs from a modern item link when an old addon export has shifted fields',()=>{
    const value=normalized(decodeCapture(token({schema:1,season:'midnight-season-2',clientBuild:'12.1.0 (1)',records:[{source:'Player inventory',category:'inventory',difficulty:'inventory',track:'equipped',itemId:240949,itemLevel:285,bonusIds:[3615,-2147480301],itemLink:'|Hitem:240949::::::::90:263::13:6:12214:13667:12497:12066:8793:13622:8:28:3615|h[item]|h',capturedAt:'2026-08-14T00:00:00.000Z',clientBuild:'12.1.0'}]})));
    expect(value[0].bonusIds).toEqual([12214,13667,12497,12066,8793,13622]);
  });
  it('rejects tampered addon payloads',()=>expect(()=>decodeCapture('LSDC1.eyJzY2hlbWEiOjF9.00000000')).toThrow(/checksum|Unsupported/));
});
