import { describe, expect, it } from 'vitest';
import { assessRunHealth } from './run-health.js';
const createdAt='2026-08-22T20:00:00.000Z';
describe('run health',()=>{
  it('is healthy while SimC is emitting output',()=>expect(assessRunHealth({status:'running',createdAt,activity:{processKnown:true,lastOutputAt:'2026-08-22T20:00:50.000Z',stdoutBytes:1,stderrBytes:0},now:Date.parse('2026-08-22T20:01:00.000Z')}).state).toBe('healthy'));
  it('warns when a live process is silent for too long',()=>expect(assessRunHealth({status:'running',createdAt,activity:{processKnown:true,lastOutputAt:createdAt,stdoutBytes:1,stderrBytes:0},now:Date.parse('2026-08-22T20:05:01.000Z')}).state).toBe('stalled'));
  it('identifies a stale run without a process after a server restart',()=>expect(assessRunHealth({status:'running',createdAt,now:Date.parse('2026-08-22T20:01:00.000Z')}).state).toBe('orphaned'));
});
