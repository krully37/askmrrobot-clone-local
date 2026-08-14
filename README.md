# Local Sim Dashboard

Local Sim Dashboard is a Windows-local browser interface for SimulationCraft. It stores pasted SimC addon profiles, scenarios, run inputs, reports, and history under `.localsimdash/`; it does not submit character data to a cloud service.

## Run it

1. Install Node.js 18+ and run `npm install`.
2. Install a current SimulationCraft Windows nightly, then either set `SIMC_PATH` to its `simc.exe` or copy it to `runtime/simc.exe`.
3. Run `npm run dev` and open `http://localhost:5173`.

Use `/simc` in World of Warcraft with the SimulationCraft addon, paste the generated profile into **Import character**, configure a scenario, and start a local run.

## What is implemented

- Local profile validation/storage, guided scenarios and raw SimC overrides.
- Local SimC execution, cancellation, native HTML reports, and persistent run history.
- CPU thread cap per run and runtime discovery through `SIMC_PATH` or `runtime/simc.exe`.
- Initial user interface for Quick Sim, Top Gear, Droptimizer, and comparison/batch workflows.

Top Gear candidate enumeration and the seasonal item catalog require the character export's bag section and an updatable catalog package. The architecture/API surface is present; the starter catalog is intentionally empty rather than shipping outdated live-game data.
