# Local Sim Dashboard

Local Sim Dashboard is a private Windows dashboard for SimulationCraft. It runs on your own computer. Your character exports, catalog, settings, and reports stay in the `.localsimdash` folder beside the dashboard.

## Start here (Windows)

You only need to do this once.

1. Download this project as a ZIP from GitHub. Right-click the ZIP, choose **Extract All**, then open the extracted `localsimdash` folder.
2. Install the **LTS** version of [Node.js](https://nodejs.org/en/download). Keep the normal default choices during setup.
3. Download the Windows version of [SimulationCraft](https://www.simulationcraft.org/download.html). Extract the download with 7-Zip if Windows cannot open it. Inside the extracted folder, find `simc.exe`.
4. Double-click **Setup Local Sim Dashboard.cmd** in this folder.
5. The first time it runs, a normal Windows file picker opens. Select the `simc.exe` file from step 3.
6. Wait for your web browser to open Local Sim Dashboard. Keep the black setup window open while you use the dashboard.

After that, double-click **Setup Local Sim Dashboard.cmd** whenever you want to use it. It remembers the `simc.exe` location for your Windows user account.

### What the setup file does

- Checks whether Node.js is installed.
- Downloads the dashboard's required packages on the first run only.
- Lets you choose `simc.exe` with a Windows file picker. It does **not** scan your PC for programs or files.
- Saves only that selected path as your `SIMC_PATH` Windows setting, then opens `http://127.0.0.1:5173` in your browser.

## Included catalog

The first start installs a small, public, prebuilt current-season catalog automatically. It contains only shared Blizzard item/drop data—no character profiles, custom items, addon captures, local DB2 data, settings, or diagnostics. You can start importing characters and browsing supported items without Blizzard API credentials.

Use **Catalog → Refresh** only when you want newer seasonal data. Your personal data stays in `.localsimdash/` and is ignored by Git.

## Using the dashboard

1. In World of Warcraft, install the SimulationCraft addon and type `/simc` in chat.
2. Copy the text it gives you.
3. In Local Sim Dashboard, choose **Import character**, paste the text, and select **Save reusable character**.
4. Use **Quick Sim** for your equipped gear, **Top Gear** to compare items you own, or **Droptimizer** for eligible catalog drops.

## Help

- **The setup window says Node.js is missing:** install the LTS version from [nodejs.org](https://nodejs.org/en/download), then run the setup file again.
- **It asks for `simc.exe`:** choose the `simc.exe` file inside the SimulationCraft folder you extracted. Do not choose the `.7z` download itself.
- **The browser says it cannot connect:** wait a few seconds, then make sure the black setup window is still open.
- **A simulation cannot start:** revisit **Configurations** and choose the correct `simc.exe` path.

## Advanced and developer use

The commands below are optional. Most people should use **Setup Local Sim Dashboard.cmd** instead.

```powershell
npm install
npm run dev
```

Local state lives under `.localsimdash/`. It includes pasted profiles, scenarios, run inputs, reports, history, settings, and the catalog. Nothing is sent to a cloud service by the dashboard.

### Catalog and addon captures

Copy [addon/LocalSimDashCatalog](addon/LocalSimDashCatalog) into `World of Warcraft\_retail_\Interface\AddOns`. In-game, run `/lsdscan all` and paste the capture into **Catalog → Live addon captures**, or configure your Retail folder there for automatic SavedVariables import.

To create the public catalog for a new release after a catalog refresh, run `npm run catalog:bundle`. The bundling script strips all local-only rows before replacing `data/catalog.db`.
