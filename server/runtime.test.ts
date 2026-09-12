import { describe, expect, it } from 'vitest';
import { discoverLatest, parseNightly } from './runtime.js';

describe('managed SimC runtime discovery', () => {
  it('selects and identifies the official Windows nightly archive', () => {
    const build=parseNightly(`<a href="https://download.simulationcraft.org/nightly/simc-1205.01.d5dc343-win64.7z">Windows</a>`);
    expect(build.id).toBe('simc-1205.01.d5dc343-win64');
    expect(build.url).toContain('simc-1205.01.d5dc343-win64.7z');
  });
  it('rejects pages without a Windows nightly package', () => {
    expect(()=>parseNightly('<a href="simc-macos.7z">macOS</a>')).toThrow(/Windows nightly/);
  });
  it('picks the newest build rather than trusting the page order', () => {
    const listing=`
      <a href="simc-1120.01.090f1bf-win64.7z">older</a>
      <a href="simc-1210.01.c1935b9-win64.7z">newest</a>
      <a href="simc-1205.01.ac79c0f-win64.7z">middle</a>`;
    expect(parseNightly(listing).id).toBe('simc-1210.01.c1935b9-win64');
  });
  it('compares the historical filename layout against the current one', () => {
    const listing=`
      <a href="simc-902-01-win64-e080d84.7z">legacy</a>
      <a href="simc-1201.01.19c2728-win64.7z">current</a>`;
    expect(parseNightly(listing).id).toBe('simc-1201.01.19c2728-win64');
  });
  it('orders by the minor component when the major matches', () => {
    const listing=`
      <a href="simc-1210.01.aaaaaaa-win64.7z">first</a>
      <a href="simc-1210.02.bbbbbbb-win64.7z">second</a>`;
    expect(parseNightly(listing).id).toBe('simc-1210.02.bbbbbbb-win64');
  });
  it('reports an unrecognized filename rather than skipping it silently', () => {
    expect(()=>parseNightly('<a href="nightly-win64.7z">odd</a>')).toThrow(/was not recognized/);
  });
  it('follows the official page to its published nightly index', async () => {
    const requested:string[]=[];
    const fetcher=(async (url:RequestInfo|URL) => { requested.push(String(url)); return requested.length===1
      ? new Response('<a href="http://downloads.simulationcraft.org/nightly/?C=M;O=D">nightly</a>')
      : new Response('<a href="simc-1205.01.d5dc343-win64.7z">nightly</a>'); }) as typeof fetch;
    await expect(discoverLatest(fetcher)).resolves.toMatchObject({id:'simc-1205.01.d5dc343-win64'});
    expect(requested[1]).toMatch(/^http:\/\/downloads\.simulationcraft\.org\/nightly/);
  });
});
