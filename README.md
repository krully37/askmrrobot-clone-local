# Local Sim Dashboard

Local Sim Dashboard is a Windows-local browser interface for SimulationCraft. It stores pasted SimC addon profiles, scenarios, run inputs, reports, and history under `.localsimdash/`; it does not submit character data to a cloud service.

## Run it

1. Install Node.js 22 or 24 and run `npm install`, then `npm run rebuild:node`.
2. Leave SimulationCraft to the dashboard, or set `SIMC_PATH` to pin a specific `simc.exe`. See [Keeping SimC current](#keeping-simc-current).
3. Run `npm run dev` and open `http://localhost:5173`.

better-sqlite3 publishes a prebuilt binary per ABI, and only Node 22 and Node 24 are covered on Windows. Other versions have no matching asset and fall back to a source build that needs a C++ toolchain. `npm run rebuild:node` fetches the right binary, and it is a required step whenever npm is configured to block package install scripts, because then `npm install` never runs the one that would fetch it.

Ports are checked before anything binds. The API prefers 17317 and the UI prefers 5173, and if either is already taken the next free port is used and the chosen URL is printed at startup. `LOCALSIMDASH_PORT` sets the preferred API port; it is still checked rather than assumed.

The API used to default to 4317, which is the OpenTelemetry OTLP/gRPC port. Its sibling 4318 is OTLP/HTTP. Any machine running a collector owns both, so the default moved well clear of them.

The dev supervisor resolves both ports up front and passes the API port to the UI proxy, so the two cannot end up pointing at different places. It also restarts the API if it exits unexpectedly, backing off and giving up after five failures with no stable run in between.

Use `/simc` in World of Warcraft with the SimulationCraft addon, paste the generated profile into **Import character**, configure a scenario, and start a local run.

## Keeping SimC current

The dashboard manages its own SimulationCraft build under `.localsimdash/runtime/`. It checks the official Windows nightly index once a day, and `SIMC_UPDATE_INTERVAL_HOURS` changes that interval.

A build found while the dashboard is running is installed but not activated, because swapping the executable would change the engine underneath sims already in progress. It becomes active on the next start. Only the active, previous and pending builds are kept on disk; `POST /api/runtime/rollback` returns to the previous one.

Setting `SIMC_PATH`, or choosing an executable in the Catalog page, **pins** the dashboard to that build and disables nightly updates entirely. This is an override rather than a fallback, so the runtime status says so while it is set. Clear it to return to the managed runtime.

Each installed build is smoke-tested by running `simc version`, and the archive's SHA-256 is recorded in its manifest for audit. SimulationCraft does not publish per-archive checksums, so that hash is not verified against an upstream value.

### Why a stale catalog is dangerous

SimulationCraft does not reject gear it cannot resolve. An item ID missing from the build's item database is dropped from the actor silently: no error, no non-zero exit, and a normal-looking DPS figure computed with that slot empty.

Runs therefore reconcile the gear they requested against the gear SimC reported back, and any dropped slot is raised as a warning on the result. Treat those warnings as a signal to refresh the catalog or the runtime before trusting the number.

## What is implemented

- Local profile validation/storage, guided scenarios and raw SimC overrides.
- Local SimC execution, cancellation, native HTML reports, and persistent run history.
- CPU thread cap per run and managed nightly updates. `npm run dev` supervises the API and restarts it after a verified runtime update; `npm run server` is the direct diagnostic command.
- Initial user interface for Quick Sim, Top Gear, Droptimizer, and comparison/batch workflows.

Top Gear candidate enumeration and the seasonal item catalog require the character export's bag section and an updatable catalog package. The architecture/API surface is present; the starter catalog is intentionally empty rather than shipping outdated live-game data.

## Desktop app

`npm run dist` builds the installer and `npm run build:electron` produces an unpacked directory.

better-sqlite3 ships one compiled binary per ABI, and Node and Electron do not share one: Node 22 is NODE_MODULE_VERSION 127 and Node 24 is 137, while Electron 32 is 128. Loading the wrong one fails with `ERR_DLOPEN_FAILED`. Both packaging scripts therefore run `npm run rebuild:electron` first, which downloads the published Electron binary rather than compiling, so no C++ toolchain is needed.

That swap is global to `node_modules`, so run `npm run rebuild:node` before going back to `npm run dev`.

The desktop window is a plain web page with no Node or Electron access. The API it talks to runs inside the Electron main process, which is also what lets the SimC file picker open a native dialog.

## Current-season catalog

Set `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` as user environment variables, restart the dashboard, then use **Catalog → Refresh current season**. The same process is available as `npm run catalog:build`.

The pipeline reads the pinned sources in `data/season-manifest.json`, uses Blizzard's Game Data API, writes a staged SQLite package, validates it, and atomically replaces `.localsimdash/catalog/catalog.db`. It keeps a rollback copy and never stores credentials or access tokens.

### Item icons

Icons are cached under `.localsimdash/catalog-media` and fetched once per item, then never again. Blizzard's media API is used when credentials are configured. Because gear icons should not depend on registering an API client, the dashboard otherwise falls back to Wowhead's public tooltip endpoint for the icon slug and downloads the image from the public icon CDN. Only the item ID leaves the machine, and only on the first request for that item. Delete the directory to force a refetch.

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

The current-season source categories in [data/current-season-source-categories.json](data/current-season-source-categories.json) are plain repository data and carry no DB2 dependency, so the dashboard seeds them on every start. They used to be written only as a side effect of installing the DB2 package, which left anyone without an extracted Retail client with no capture categories at all.

### Enhancement review

The bundled Midnight enhancement mapping is intentionally a reviewed allow-list. DB2 discovers local item/enchantment metadata; a curated gem/enchant is selectable only when its local DB2 record matches and its SimC fragment has passed syntax validation. Imported gems and enchants remain on imported gear even if they are not in that allow-list. Catalog Health exposes the total discovered and reviewed/selectable counts so unresolved mappings are never silently optimized.
