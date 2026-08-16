# Local Sim Dashboard

Local Sim Dashboard is a Windows-local browser interface for SimulationCraft. It stores pasted SimC addon profiles, scenarios, run inputs, reports, and history under `.localsimdash/`; it does not submit character data to a cloud service.

## Run it

1. Install Node.js 18+ and run `npm install`.
2. Optionally set `SIMC_PATH` to an existing `simc.exe` for first-run fallback. The dashboard checks the official Windows nightly at most once every three days, installs verified builds under `.localsimdash/runtime/`, and keeps the prior build for rollback. To update sooner, replace the managed runtime with a manually downloaded SimC build through `SIMC_PATH`.
3. Run `npm run dev` and open `http://localhost:5173`.

Use `/simc` in World of Warcraft with the SimulationCraft addon, paste the generated profile into **Import character**, configure a scenario, and start a local run.

## What is implemented

- Local profile validation/storage, guided scenarios and raw SimC overrides.
- Local SimC execution, cancellation, native HTML reports, and persistent run history.
- CPU thread cap per run and managed nightly updates. `npm run dev` supervises the API and restarts it after a verified runtime update; `npm run server` is the direct diagnostic command.
- Initial user interface for Quick Sim, Top Gear, Droptimizer, and comparison/batch workflows.

Top Gear candidate enumeration and the seasonal item catalog require the character export's bag section and an updatable catalog package. The architecture/API surface is present; the starter catalog is intentionally empty rather than shipping outdated live-game data.

## Current-season catalog

Set `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` as user environment variables, restart the dashboard, then use **Catalog → Refresh current season**. The same process is available as `npm run catalog:build`.

The pipeline reads the pinned sources in `data/season-manifest.json`, uses Blizzard's Game Data API, writes a staged SQLite package, validates it, and atomically replaces `.localsimdash/catalog/catalog.db`. It keeps a rollback copy and never stores credentials or access tokens.

### Verified difficulty variants

Blizzard's item API exposes a base item level, not the exact difficulty/upgrade variant required for a trustworthy Droptimizer result. The dashboard therefore never promotes that base value to a simmable drop. Exact current-season variants live in [data/midnight-season-2-variants.json](data/midnight-season-2-variants.json) and are gated until they have been captured from the live Encounter Journal.

Each record needs the exact source, boss, difficulty, item ID, displayed item level, bonus IDs, and a SimC fragment containing matching `id` and `ilevel` fields. For example (replace every placeholder with the captured live values):

```json
{
  "source": "The Venomous Abyss",
  "boss": "Captured boss name",
  "difficulty": "Normal",
  "itemId": 123456,
  "itemLevel": 700,
  "bonusIds": [1234, 5678],
  "simcFragment": "id=123456,ilevel=700,bonus_id=1234/5678",
  "provenance": "Encounter Journal link captured in-game",
  "capturedAt": "2026-08-14T12:00:00.000Z",
  "clientBuild": "12.1.0"
}
```

After adding captures, run `npm run catalog:variants:validate`, then refresh the catalog with `npm run catalog:refresh` (or use the in-app Catalog refresh). The validator checks that each seed row matches a discovered local source/boss/drop/difficulty before it can be installed.

### Live addon captures

Copy [addon/LocalSimDashCatalog](addon/LocalSimDashCatalog) into `World of Warcraft\\_retail_\\Interface\\AddOns`, log in outside combat, and run `/lsdscan all`. The addon scans the pinned raid/lair Encounter Journal rows and opens a copyable capture export when it completes. Paste that export into **Catalog → Live addon captures**, or run `/lsdexport`, `/reload`, and configure your Retail installation folder in the Catalog page for automatic SavedVariables import.

For Mythic+, set a real-link context first, for example `/lsdmplus Altar of Fangs|+10`, then run `/lsdcapture ` and shift-click an actual item link. The dashboard will only mark that track verified when its item maps to a known local dungeon drop. Delves, Vault rewards, bonus-roll variants, crafted gear, and Catalyst conversions use the same exact-link safety model: set a generic context such as `/lsdcontext great-vault|Great Vault|Raid`, then run `/lsdcapture` with a live item link. These entries remain capture-required until that link validates locally.

`npm run catalog:db2:prefill -- --wow <Retail folder> --db2-dir <extracted DB2 folder> --out .localsimdash/catalog/db2-derived-variants.json` decodes the pinned DB2 tables and writes an advisory derived package. Then run `npm run catalog:db2:install` (or restart the dashboard) to atomically install it. Extract `Item`, `ItemSparse`, `JournalEncounterItem`, `Difficulty`, `ContentTuning`, `ItemBonus`, and `ItemBonusTree` from the same Retail build. `ItemXItemEffect`, `SpellItemEnchantment`, `ItemEffect`, and `SpellEffect` enrich enhancement discovery but are optional. The reader handles wow.export's zeroed/encrypted sections and records table hashes and the client build. Derived rows are intentionally not simmable until a live addon capture corroborates them.

### Enhancement review

The bundled Midnight enhancement mapping is intentionally a reviewed allow-list. DB2 discovers local item/enchantment metadata; a curated gem/enchant is selectable only when its local DB2 record matches and its SimC fragment has passed syntax validation. Imported gems and enchants remain on imported gear even if they are not in that allow-list. Catalog Health exposes the total discovered and reviewed/selectable counts so unresolved mappings are never silently optimized.
