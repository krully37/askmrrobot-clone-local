import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { app } from './index.js';
import type { Server } from 'http';

let server: Server;
let port: number;

beforeAll(() => {
  return new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

const post = (path: string, body: any) => fetch(`http://127.0.0.1:${port}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

describe('Pipeline API validation', () => {
  let testProfileId: number;

  beforeAll(async () => {
    // Create a disposable profile to use for testing valid profile scenarios
    const rawProfile = `warrior="TestWarrior"\nlevel=80\nrole=attack\nspec=fury`;
    const res = await post('/api/profiles', { rawProfile, persistence: 'disposable' });
    const profile = await res.json();
    testProfileId = profile.id;
  });

  describe('Quick Sim', () => {
    it('returns 404 for missing profile', async () => {
      const res = await post('/api/runs', { profileId: 99999, mode: 'quick', title: 'Test', threads: 1, scenario: {} });
      expect(res.status).toBe(404);
    });
  });

  describe('Top Gear', () => {
    it('returns 404 for missing profile', async () => {
      const res = await post('/api/topgear/run', { profileId: 99999, threads: 1, scenario: {} });
      expect(res.status).toBe(404);
    });
  });

  describe('Droptimizer', () => {
    it('returns 404 for missing profile', async () => {
      const res = await post('/api/droptimizer/run', { profileId: 99999, source: 'Fake', difficulty: 'Fake', threads: 1 });
      expect(res.status).toBe(404);
    });

    it('returns 422 when attempting to run with a source/difficulty that has no catalog drops', async () => {
      const res = await post('/api/droptimizer/run', { profileId: testProfileId, source: 'FakeSource', difficulty: 'FakeDifficulty', threads: 1 });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toContain('Choose a source and difficulty with usable catalog drops first');
    });
  });
});
