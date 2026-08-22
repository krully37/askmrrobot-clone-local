export function blizzardConfig() { return { region: process.env.BLIZZARD_REGION || 'us', locale: process.env.BLIZZARD_LOCALE || 'en_US', clientId: process.env.BLIZZARD_CLIENT_ID, clientSecret: process.env.BLIZZARD_CLIENT_SECRET }; }
export function configured() { const c = blizzardConfig(); return Boolean(c.clientId && c.clientSecret); }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function request(url, init, retries = 3) { let last; for (let attempt = 0; attempt < retries; attempt++) {
    try {
        const response = await fetch(url, init);
        if (response.ok)
            return response;
        if (![429, 500, 502, 503, 504].includes(response.status))
            throw new Error(`${response.status} ${await response.text()}`);
        last = new Error(`Blizzard API temporarily unavailable (${response.status}).`);
    }
    catch (error) {
        last = error;
    }
    await sleep(250 * 2 ** attempt);
} throw last || new Error('Blizzard API request failed.'); }
export class BlizzardClient {
    config;
    token;
    constructor(config = blizzardConfig()) {
        this.config = config;
    }
    async authenticate() { if (!this.config.clientId || !this.config.clientSecret)
        throw new Error('Blizzard credentials are not configured. Set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET in your user environment, then restart the dashboard.'); const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64'); const response = await request(`https://${this.config.region}.battle.net/oauth/token`, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' }); const json = await response.json(); if (!json.access_token)
        throw new Error('Blizzard OAuth response did not contain an access token.'); this.token = json.access_token; }
    async data(path) { if (!this.token)
        await this.authenticate(); const namespace = `static-${this.config.region}`; const delimiter = path.includes('?') ? '&' : '?'; const url = `https://${this.config.region}.api.blizzard.com${path}${delimiter}namespace=${namespace}&locale=${encodeURIComponent(this.config.locale)}`; const response = await request(url, { headers: { Authorization: `Bearer ${this.token}` } }); return response.json(); }
    async journalInstances() { const result = await this.data('/data/wow/journal-instance/index'); return (result.instances || []).map((x) => ({ id: Number(x.id), name: String(x.name) })); }
    journalInstance(id) { return this.data(`/data/wow/journal-instance/${id}`); }
    journalEncounter(id) { return this.data(`/data/wow/journal-encounter/${id}`); }
    item(id) { return this.data(`/data/wow/item/${id}`); }
    itemMedia(id) { return this.data(`/data/wow/media/item/${id}`); }
    spell(id) { return this.data(`/data/wow/spell/${id}`); }
    spellMedia(id) { return this.data(`/data/wow/media/spell/${id}`); }
    searchSpell(name) { return this.data(`/data/wow/search/spell?name.en_US=${encodeURIComponent(name)}&orderby=id&_page=1`); }
}
