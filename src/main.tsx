import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { GlobalItemTooltip } from "./item-tooltip";
import consumableSeed from "../data/midnight-consumables.json";
import { OmniumFolioPicker } from "./OmniumFolioPicker";
import "./styles.css";
import "./results.css";
import "./droptimizer-results.css";
import "./raid-dashboard.css";
import "./compute.css";
import "./enhancements.css";
import "./character-history.css";
import "./catalog-health.css";

type Profile = {
  id: number;
  characterId?: number;
  name: string;
  realm: string;
  spec: string;
  persistence?: "reusable" | "disposable";
  updatedAt?: string;
};
type Character = {
  id: number;
  name: string;
  realm: string;
  specs: { id: number; spec: string; className: string; updatedAt: string }[];
  runCount: number;
  lastRunAt?: string;
  lastRunStatus?: string;
};
type Candidate = {
  id: string;
  slot: string;
  name: string;
  itemId?: number;
  itemLevel?: number;
  source: string;
  locked: boolean;
  gems?: string[];
  enchant?: string;
  handedness?:
    "one-hand" | "two-hand" | "main-hand-only" | "off-hand-only" | "unknown";
  setName?: string;
};
type Enhancement = {
  id: string;
  type: "gem" | "enchant" | "weapon";
  name: string;
  effect?: string;
  slots: string[];
  simcFragment: string;
  provenance?: string;
  currentSeason?: boolean;
  weaponHands?: string[];
};
type Inventory = {
  candidates: Candidate[];
  talents: { id: string; name: string; selected: boolean }[];
  vaultDetected: boolean;
  dualWieldCapable: boolean;
  enhancements: Enhancement[];
};
type Preview = {
  combinations: number;
  profilesets: number;
  iterations: number;
  totalIterations: number;
  estimatedSeconds: number;
  intensity: string;
  enhancementVariants: number;
  enhancementCombinations: number;
  replaceExistingEnhancements: boolean;
  warnings: string[];
  calibration: string;
};
type ComputeCapacity = {
  logicalCores: number;
  systemUsage: number;
  recommendedThreads: number;
  maxSafeThreads: number;
  warning?: string;
};
type Run = {
  id: number;
  title: string;
  status: string;
  summary?: string;
  createdAt: string;
  character?: { name: string; realm: string; spec: string };
  characterId?: number;
};
type Consumable = {
  type: "Food" | "Flask" | "Potion";
  name: string;
  function: string;
  effect: string;
};
const consumables = consumableSeed.entries as Consumable[];
const api = async (path: string, init?: RequestInit) => {
  const method = init?.method?.toUpperCase() || "GET";
  const r = await fetch(
    `/api${path}`,
    method === "GET" ? { ...init, cache: "no-store" } : init,
  );
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error || "Request failed");
  return d;
};
const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
// Kept at module scope so the compact Top Gear controls can share this state
// without duplicating the complete optimization request in a child component.
let replaceExistingPreference = false;
let setReplaceExistingPreference: (value: boolean) => void = () => undefined;
const slotGroups = [
  [
    "Armor",
    [
      "head",
      "neck",
      "shoulder",
      "back",
      "chest",
      "wrist",
      "hands",
      "waist",
      "legs",
      "feet",
    ],
  ],
  ["Jewelry", ["finger1", "finger2", "trinket1", "trinket2"]],
  ["Weapons", ["main_hand", "off_hand"]],
] as const;
const slotNames: Record<string, string> = {
  head: "Head",
  neck: "Neck",
  shoulder: "Shoulder",
  back: "Back",
  chest: "Chest",
  wrist: "Wrist",
  hands: "Hands",
  waist: "Waist",
  legs: "Legs",
  feet: "Feet",
  finger1: "Rings",
  finger2: "Rings",
  trinket1: "Trinkets",
  trinket2: "Trinkets",
  main_hand: "Main hand",
  off_hand: "Off hand",
};
const slotIcons: Record<string, string> = {
  head: "⛑",
  neck: "◈",
  shoulder: "◫",
  back: "⌁",
  chest: "▣",
  wrist: "⊏",
  hands: "✦",
  waist: "═",
  legs: "▥",
  feet: "⌄",
  finger1: "◉",
  finger2: "◉",
  trinket1: "✧",
  trinket2: "✧",
  main_hand: "⚔",
  off_hand: "⛨",
};
const defaultScenario = (targets: number) => ({
  name: `Patchwerk · ${targets} target${targets === 1 ? "" : "s"}`,
  fightStyle: "Patchwerk",
  duration: 300,
  variation: 20,
  targets,
  bloodlust: "pull",
  raidBuffs: true,
  consumables: true,
  powerInfusion: false,
  rawOverride: "",
});
function useComputePower(operation: string) {
  const [capacity, setCapacity] = useState<ComputeCapacity>(),
    [threads, setThreads] = useState(0);
  const refresh = useCallback(
    () =>
      api("/compute/capacity")
        .then((value: ComputeCapacity) => {
          setCapacity(value);
          setThreads((previous) => {
            const remembered = Number(
              localStorage.getItem(`localsimdash.threads.${operation}`),
            );
            const wanted = previous || remembered || value.recommendedThreads;
            return Math.max(1, Math.min(wanted, value.maxSafeThreads));
          });
        })
        .catch(() => undefined),
    [operation],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (threads)
      localStorage.setItem(
        `localsimdash.threads.${operation}`,
        String(threads),
      );
  }, [operation, threads]);
  return { capacity, threads, setThreads, refresh };
}
function ComputePower({
  value,
  setValue,
  capacity,
  refresh,
}: {
  value: number;
  setValue: (n: number) => void;
  capacity?: ComputeCapacity;
  refresh: () => void;
}) {
  if (!capacity)
    return (
      <div className="compute-power muted">
        Checking safe local compute capacity…
      </div>
    );
  return (
    <section className="compute-power">
      <div>
        <span className="strip-label">Compute power</span>
        <b>
          {value} SimC thread{value === 1 ? "" : "s"} selected
        </b>
        <small>
          {capacity.logicalCores} logical processors ·{" "}
          {Math.round(capacity.systemUsage)}% currently in use
        </small>
      </div>
      <label>
        Threads
        <input
          type="range"
          min="1"
          max={capacity.maxSafeThreads}
          value={value}
          onChange={(e) => setValue(+e.target.value)}
        />
        <small>Safe maximum: {capacity.maxSafeThreads}</small>
      </label>
      <button onClick={refresh}>Refresh safety check</button>
      <p>{capacity.warning}</p>
    </section>
  );
}

function App() {
  const [page, setPage] = useState("dashboard"),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [characters, setCharacters] = useState<Character[]>([]),
    [profileId, setProfileId] = useState<number>(),
    [inventory, setInventory] = useState<Inventory>(),
    [runs, setRuns] = useState<Run[]>([]),
    [notice, setNotice] = useState(""),
    [paste, setPaste] = useState(""),
    [selected, setSelected] = useState(new Set<string>()),
    [locks, setLocks] = useState(new Set<string>()),
    [talents, setTalents] = useState(new Set<string>()),
    [enhancementIds, setEnhancementIds] = useState(new Set<string>()),
    [omniumFolio, setOmniumFolio] = useState<string[]>([]),
    [replaceExistingEnhancements, setReplaceExistingEnhancements] =
      useState(false),
    [preview, setPreview] = useState<Preview>(),
    [limit, setLimit] = useState(10000),
    [targets, setTargets] = useState(1),
    [custom, setCustom] = useState(""),
    [minSetBonuses, setMinSetBonuses] = useState<Record<string, number>>({}),
    [resultId, setResultId] = useState<number>();
  const topCompute = useComputePower("topgear");
  replaceExistingPreference = replaceExistingEnhancements;
  setReplaceExistingPreference = setReplaceExistingEnhancements;
  const refreshRuns = useCallback(async () => {
    const latest = await api("/runs");
    setRuns(latest);
    return latest;
  }, []);
  const load = async () => {
    try {
      const [p, c, r, rt] = await Promise.all([
        api("/profiles"),
        api("/characters"),
        api("/runs"),
        api("/runtime/status"),
      ]);
      setProfiles(p);
      setCharacters(c);
      setRuns(r);
      if (rt.warning)
        setNotice(`SimulationCraft update warning: ${rt.warning}`);
      setProfileId((x) =>
        x && p.some((q: Profile) => q.id === x) ? x : p[0]?.id,
      );
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!runs.some((r) => ["queued", "running"].includes(r.status))) return;
    const timer = setInterval(() => load(), 1200);
    return () => clearInterval(timer);
  }, [runs]);
  useEffect(() => {
    const onDroptimizerRun = (event: Event) => {
      const x = (event as CustomEvent<any>).detail;
      if (x.run)
        setRuns((current) => [
          x.run,
          ...current.filter((r: Run) => r.id !== x.run.id),
        ]);
      setResultId(x.id);
      setPage("result");
      refreshRuns().catch(() => undefined);
    };
    window.addEventListener("droptimizer-run", onDroptimizerRun);
    return () =>
      window.removeEventListener("droptimizer-run", onDroptimizerRun);
  }, [refreshRuns]);
  useEffect(() => {
    if (profileId)
      api(`/profiles/${profileId}/inventory`).then((x: Inventory) => {
        setInventory(x);
        setSelected(
          new Set(
            x.candidates
              .filter((c) => c.source === "equipped")
              .map((c) => c.id),
          ),
        );
        setLocks(
          new Set(x.candidates.filter((c) => c.locked).map((c) => c.slot)),
        );
        setTalents(
          new Set(x.talents.filter((t) => t.selected).map((t) => t.id)),
        );
        setEnhancementIds(new Set());
        setOmniumFolio([]);
      });
  }, [profileId]);
  const toggle = (
    set: Set<string>,
    id: string,
    update: (x: Set<string>) => void,
  ) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    update(n);
  };
  const request = useMemo(
    () => ({
      profileId,
      candidateIds: [...selected],
      lockedSlots: [...locks],
      talentIds: [...talents],
      enhancementIds: [...enhancementIds],
      omniumFolio,
      minSetBonuses,
      replaceExistingEnhancements,
      threads: topCompute.threads,
      limit,
      scenario: defaultScenario(targets),
    }),
    [
      profileId,
      selected,
      locks,
      talents,
      enhancementIds,
      omniumFolio,
      minSetBonuses,
      replaceExistingEnhancements,
      limit,
      targets,
      topCompute.threads,
    ],
  );
  useEffect(() => {
    if (!profileId) return;
    const timer = setTimeout(
      () =>
        api("/topgear/preview", post(request))
          .then(setPreview)
          .catch((e) => setNotice(e.message)),
      180,
    );
    return () => clearTimeout(timer);
  }, [request, profileId]);
  const importProfile = async (
    persistence: "reusable" | "disposable",
    characterId?: number,
  ) => {
    try {
      const p = await api(
        "/profiles",
        post({ rawProfile: paste, persistence, characterId }),
      );
      setPaste("");
      setProfileId(p.id);
      setNotice(
        persistence === "disposable"
          ? "Disposable character ready for one simulation; the report remains in history."
          : "Saved character profile updated.",
      );
      await load();
      setPage(persistence === "reusable" ? "characters" : "topgear");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const queueRun = (run: Run | undefined) => {
    if (run)
      setRuns((current) => [
        run,
        ...current.filter((existing) => existing.id !== run.id),
      ]);
  };
  const start = async (confirmLarge = false) => {
    try {
      const x = await api("/topgear/run", post({ ...request, confirmLarge }));
      queueRun(x.run);
      setResultId(x.id);
      setNotice(
        `Top Gear run #${x.id} queued (${x.planned.toLocaleString()} loadouts).`,
      );
      setPage("result");
      await refreshRuns();
    } catch (e) {
      const m = (e as Error).message;
      if (
        m.includes("Confirm the large search") &&
        confirm(`${m}\n\nRun it anyway?`)
      )
        start(true);
      else setNotice(m);
    }
  };
  const quickRun = async (scenario: any, threads: number) => {
    try {
      const x = await api(
        "/runs",
        post({
          profileId,
          mode: "quick",
          title: "Quick Sim",
          threads,
          scenario,
        }),
      );
      queueRun(x.run);
      setResultId(x.id);
      setNotice(
        `Quick Sim #${x.id} queued using ${x.appliedThreads} safe SimC threads.`,
      );
      setPage("result");
      await refreshRuns();
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const Catalog = CatalogPage;
  if (page === "characters")
    return (
      <div className="app">
        <aside>
          <div className="brand">
            <span>◈</span> LOCAL SIM <b>DASHBOARD</b>
          </div>
          <nav>
            {[
              ["dashboard", "Dashboard"],
              ["quick", "Quick Sim"],
              ["import", "Import character"],
              ["characters", "Saved characters"],
              ["topgear", "Top Gear"],
              ["catalog", "Catalog"],
              ["droptimizer", "Droptimizer"],
              ["history", "Run history"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => setPage(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <main>
          <header>
            <div>
              <p className="eyebrow">LOCAL RETAIL THEORYCRAFTING</p>
              <h1>Saved characters</h1>
            </div>
            {profiles.length > 0 && (
              <select
                className="profile-picker"
                value={profileId || ""}
                onChange={(e) => setProfileId(+e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.realm} · {p.spec}
                  </option>
                ))}
              </select>
            )}
          </header>
          {notice && (
            <div className="notice">
              {notice}
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          <CharacterManager
            characters={characters}
            activate={(id) => {
              setProfileId(id);
              setPage("quick");
            }}
            refresh={load}
            notice={setNotice}
          />
        </main>
      </div>
    );
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <span>◈</span> LOCAL SIM <b>DASHBOARD</b>
        </div>
        <nav>
          {[
            ["dashboard", "Dashboard"],
            ["quick", "Quick Sim"],
            ["import", "Import character"],
            ["topgear", "Top Gear"],
            ["catalog", "Catalog"],
            ["droptimizer", "Droptimizer"],
            ["history", "Run history"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">LOCAL RETAIL THEORYCRAFTING</p>
            <h1>
              {page === "topgear"
                ? "Top Gear laboratory"
                : page === "quick"
                  ? "Quick Sim"
                  : page === "result"
                    ? "Simulation results"
                    : page[0].toUpperCase() + page.slice(1)}
            </h1>
          </div>
          {profiles.length > 0 && (
            <select
              className="profile-picker"
              value={profileId || ""}
              onChange={(e) => setProfileId(+e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.spec}
                </option>
              ))}
            </select>
          )}
        </header>
        {notice && (
          <div className="notice">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        {page === "dashboard" && (
          <Dashboard profiles={profiles} runs={runs} go={setPage} />
        )}{" "}
        {page === "quick" && (
          <QuickSim
            ready={Boolean(profileId)}
            profileId={profileId}
            run={quickRun}
          />
        )}{" "}
        {page === "import" && (
          <Import paste={paste} setPaste={setPaste} submit={importProfile} />
        )}{" "}
        {page === "topgear" && (
          <TopGear
            inventory={inventory}
            minSetBonuses={minSetBonuses}
            setMinSetBonuses={setMinSetBonuses}
            selected={selected}
            locks={locks}
            talents={talents}
            enhancementIds={enhancementIds}
            omniumFolio={omniumFolio}
            setOmniumFolio={setOmniumFolio}
            toggle={toggle}
            setSelected={setSelected}
            setLocks={setLocks}
            setTalents={setTalents}
            setEnhancementIds={setEnhancementIds}
            preview={preview}
            run={start}
            limit={limit}
            setLimit={setLimit}
            targets={targets}
            setTargets={setTargets}
            compute={topCompute}
            custom={custom}
            setCustom={setCustom}
            addCustom={async () => {
              if (!profileId) return;
              try {
                const x = await api(
                  `/profiles/${profileId}/candidates`,
                  post({ line: custom }),
                );
                setInventory({
                  ...x.inventory,
                  enhancements: inventory?.enhancements || [],
                });
                setCustom("");
              } catch (e) {
                setNotice((e as Error).message);
              }
            }}
          />
        )}{" "}
        {page === "catalog" && <Catalog />}{" "}
        {page === "droptimizer" && <Droptimizer profileId={profileId} inventory={inventory} minSetBonuses={minSetBonuses} setMinSetBonuses={setMinSetBonuses} />}{" "}
        {page === "history" && (
          <Runs
            runs={runs}
            refreshRuns={refreshRuns}
            openResult={(id: number) => {
              setResultId(id);
              setPage("result");
            }}
          />
        )}{" "}
        {page === "result" && (
          <Result runId={resultId} back={() => setPage("history")} />
        )}
      </main>
    </div>
  );
}
function Dashboard({
  profiles,
  runs,
  go,
}: {
  profiles: Profile[];
  runs: Run[];
  go: (x: string) => void;
}) {
  return (
    <>
      <section className="hero">
        <div>
          <p>
            Bring your bags, bank, and Great Vault into one private, local SimC
            workspace.
          </p>
          <div className="buttons">
            <button className="primary" onClick={() => go("quick")}>
              Quick Sim
            </button>
            <button onClick={() => go("import")}>Import /simc export</button>
            <button onClick={() => go("characters")}>
              Manage saved characters
            </button>
            <button onClick={() => go("catalog")}>Refresh catalog</button>
          </div>
        </div>
        <div className="hero-stat">
          <b>{profiles.length}</b>
          <span>saved specs</span>
          <b>{runs.length}</b>
          <span>local runs</span>
        </div>
      </section>
      <section className="grid three">
        <article className="card">
          <h3>Quick Sim</h3>
          <p>Baseline your equipped character in one click.</p>
        </article>
        <article className="card">
          <h3>Saved Characters</h3>
          <p>Keep a current snapshot for each specialization.</p>
        </article>
        <article className="card">
          <h3>Run History</h3>
          <p>Reports remain available after profile cleanup.</p>
        </article>
      </section>
    </>
  );
}
function QuickSim({
  ready,
  profileId,
  run,
}: {
  ready: boolean;
  profileId?: number;
  run: (scenario: any, threads: number) => void;
}) {
  const [open, setOpen] = useState(false),
    [targets, setTargets] = useState(1),
    [duration, setDuration] = useState(300),
    [variation, setVariation] = useState(20),
    [raidBuffs, setRaidBuffs] = useState(true),
    [bloodlust, setBloodlust] = useState("pull"),
    [preview, setPreview] = useState<Preview>();
  const compute = useComputePower("quick");
  const scenario = {
    name: `Quick Sim · ${targets} target`,
    fightStyle: "Patchwerk",
    duration,
    variation,
    targets,
    bloodlust,
    raidBuffs,
    consumables: true,
    powerInfusion: false,
    rawOverride: "",
  };
  useEffect(() => {
    if (!ready || !profileId || !compute.threads) return;
    const timer = setTimeout(
      () =>
        api(
          "/runs/preview",
          post({ profileId, threads: compute.threads, scenario }),
        )
          .then(setPreview)
          .catch(() => undefined),
      120,
    );
    return () => clearTimeout(timer);
  }, [
    ready,
    profileId,
    targets,
    duration,
    variation,
    raidBuffs,
    bloodlust,
    compute.threads,
  ]);
  return (
    <section className="panel quick-sim">
      <p className="eyebrow">EQUIPPED GEAR BASELINE</p>
      <h2>Quick Sim</h2>
      <p>
        Run your imported active character exactly as equipped: 5-minute
        single-target Patchwerk, full raid buffs, and Bloodlust on pull.
      </p>
      <div className="quick-summary">
        <span>Patchwerk</span>
        <span>
          {targets} target{targets === 1 ? "" : "s"}
        </span>
        <span>{duration / 60} minutes</span>
        <span>±{variation}%</span>
        <span>{raidBuffs ? "Full raid buffs" : "No raid buffs"}</span>
        <span>
          {bloodlust === "pull"
            ? "Lust on pull"
            : bloodlust === "disabled"
              ? "No Lust"
              : "Lust at 30s"}
        </span>
      </div>
      {preview && <Workload preview={preview} />}
      <ComputePower
        value={compute.threads}
        setValue={compute.setThreads}
        capacity={compute.capacity}
        refresh={compute.refresh}
      />
      <button onClick={() => setOpen(!open)}>
        {" "}
        {open ? "Hide tuning" : "Tune scenario"}{" "}
      </button>
      {open && (
        <div className="quick-tuning">
          <label>
            Targets
            <select
              value={targets}
              onChange={(e) => setTargets(+e.target.value)}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fight length (seconds)
            <input
              type="number"
              min="30"
              value={duration}
              onChange={(e) => setDuration(+e.target.value)}
            />
          </label>
          <label>
            Length variation (%)
            <input
              type="number"
              min="0"
              max="100"
              value={variation}
              onChange={(e) => setVariation(+e.target.value)}
            />
          </label>
          <label>
            Bloodlust
            <select
              value={bloodlust}
              onChange={(e) => setBloodlust(e.target.value)}
            >
              <option value="pull">On pull</option>
              <option value="disabled">Disabled</option>
              <option value="time">At 30 seconds</option>
            </select>
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              checked={raidBuffs}
              onChange={(e) => setRaidBuffs(e.target.checked)}
            />
            Full raid buffs
          </label>
        </div>
      )}
      <div className="buttons">
        <button
          className="primary"
          disabled={!ready || !compute.threads}
          onClick={() =>
            run(
              {
                ...scenario,
                bloodlustValue: bloodlust === "time" ? 30 : undefined,
              },
              compute.threads,
            )
          }
        >
          Run Quick Sim
        </button>
        {!ready && <span className="muted">Import a character first.</span>}
      </div>
    </section>
  );
}
function Import({
  paste,
  setPaste,
  submit,
}: {
  paste: string;
  setPaste: (x: string) => void;
  submit: (
    persistence: "reusable" | "disposable",
    characterId?: number,
  ) => void;
}) {
  const [preview, setPreview] = useState<any>();
  const [error, setError] = useState("");
  const validate = async () => {
    try {
      setError("");
      setPreview(await api("/profiles/preview", post({ rawProfile: paste })));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="panel import-flow">
      <p className="eyebrow">CHARACTER IMPORT</p>
      <h2>Review before persisting</h2>
      <p>
        Paste a complete <code>/simc</code> export. New characters are
        disposable by default; their first report remains in history after the
        temporary profile is cleaned up.
      </p>
      <textarea
        value={paste}
        onChange={(e) => {
          setPaste(e.target.value);
          setPreview(undefined);
        }}
        placeholder="warrior=YourName\nspec=fury"
      />
      {error && <p className="result-warnings">{error}</p>}
      {preview ? (
        <div className="import-review">
          <h3>
            {preview.profile.name} · {preview.profile.realm} ·{" "}
            {preview.profile.spec}
          </h3>
          <small>
            {preview.inventory.candidateCount} gear candidates ·{" "}
            {preview.inventory.talentCount} talent builds
            {preview.inventory.vaultDetected ? " · Great Vault detected" : ""}
          </small>
          {preview.matches.exact && (
            <p>
              Saved character found. Updating keeps its other saved specs
              intact.
            </p>
          )}
          {preview.matches.ambiguous && (
            <label>
              Possible saved character
              <select
                onChange={(e) =>
                  setPreview({
                    ...preview,
                    selectedCharacterId: +e.target.value,
                  })
                }
              >
                <option value="">Choose a matching character</option>
                {preview.matches.candidates.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {x.realm}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="buttons">
            <button className="primary" onClick={() => submit("disposable")}>
              Run as disposable
            </button>
            <button
              onClick={() =>
                submit(
                  "reusable",
                  preview.selectedCharacterId || preview.matches.exact?.id,
                )
              }
            >
              Save reusable character
            </button>
          </div>
        </div>
      ) : (
        <button className="primary" disabled={!paste.trim()} onClick={validate}>
          Validate import
        </button>
      )}
    </section>
  );
}
function formatTime(seconds: number) {
  return seconds < 60
    ? `~${seconds}s`
    : seconds < 3600
      ? `~${Math.ceil(seconds / 60)} min`
      : `~${(seconds / 3600).toFixed(1)} hr`;
}
function TopGear(p: any) {
  if (!p.inventory)
    return (
      <section className="panel">
        <h2>Import a character first</h2>
      </section>
    );
  const inventory: Inventory = p.inventory;
  const availableSets = inventory ? ([...new Set(inventory.candidates.map(c => c.setName).filter(Boolean))] as string[]) : [];
  return (
    <>
      <nav className="quick-nav">
        <span style={{color: '#888', fontWeight: 'bold'}}>Quick Nav:</span>
        <a href="#top" style={{color: '#fff', textDecoration: 'none'}}>Top</a>
        {availableSets.length > 0 && <a href="#sets" style={{color: '#fff', textDecoration: 'none'}}>Safeguards</a>}
        <a href="#gear" style={{color: '#fff', textDecoration: 'none'}}>Gear</a>
        <a href="#enchants" style={{color: '#fff', textDecoration: 'none'}}>Enchants & Gems</a>
        <a href="#talents" style={{color: '#fff', textDecoration: 'none'}}>Talents</a>
      </nav>
      <section id="top" className="topgear-intro" style={{ position: "relative" }}>
        <div>
          <p className="eyebrow">BEST IN BAGS + VAULT CLAIMS</p>
          <h2>
            {inventory.vaultDetected
              ? "Great Vault rewards detected"
              : "Best in Bags"}
          </h2>
          <p>
            {inventory.vaultDetected
              ? "Vault rewards are separately evaluated as individual claims."
              : "Open the Vault before /simc and re-import to include reward choices."}
          </p>
        </div>
        <label>
          Profile limit
          <input
            value={p.limit}
            type="number"
            min="1"
            max="1000000"
            onChange={(e: any) => p.setLimit(Math.min(1000000, +e.target.value))}
          />
          {p.limit > 25000 && <span style={{color: 'orange', fontSize: '0.8rem', marginLeft: '0.5rem', display: 'block', marginTop: '0.25rem'}}>High limit may cause UI lag</span>}
        </label>
      </section>
      <section className="scenario-strip">
        <div>
          <span className="strip-label">Scenario</span>
          <div className="target-pills">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                className={p.targets === n ? "selected" : ""}
                onClick={() => p.setTargets(n)}
              >
                {n} target{n === 1 ? "" : "s"}
              </button>
            ))}
          </div>
        </div>
        <div className="setup-facts">
          <span>Patchwerk</span>
          <span>5m ±20%</span>
          <span>Full raid buffs</span>
          <span>Consumables: auto</span>
          <span>Lust: on pull</span>
          <span>PI: off</span>
        </div>
      </section>
      <Workload preview={p.preview} />
      <section id="gear" className="gear-board">
        {slotGroups.map(([group, slots]) => {
          const groupSlots = slots as readonly string[];
          return (
            <div className="slot-section" key={group}>
              <h2>{group}</h2>
              <div className="slot-grid">
                {groupSlots
                  .filter((slot) => slot !== "finger2" && slot !== "trinket2")
                  .map((slot) => (
                    <Slot
                      key={slot}
                      slot={slot}
                      candidates={inventory.candidates.filter(
                        (c) =>
                          c.slot === slot ||
                          ((slot === "finger1" || slot === "trinket1") &&
                            c.slot === slot.replace("1", "2")),
                      )}
                      {...p}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </section>
      {(() => {
        const availableSets = inventory ? ([...new Set(inventory.candidates.map(c => c.setName).filter(Boolean))] as string[]) : [];
        return availableSets.length > 0 && p.minSetBonuses && p.setMinSetBonuses ? (
          <section id="sets" className="panel compact item-sets-panel" style={{marginBottom:'24px'}}>
            <p className="eyebrow">SAFEGUARDS</p>
            <h2>Item Sets</h2>
            <p>Prevent combinations that break these set bonuses if you have them available.</p>
            <div className="enhancement-slot-groups">
              {availableSets.map(setName => (
                <div key={setName} className="enhancement-slot-group" style={{marginTop:'12px'}}>
                  <h4 style={{ margin: '8px 0 8px', fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{setName}</h4>
                  <div className="target-pills">
                    <button className={!p.minSetBonuses[setName] ? 'selected' : ''} onClick={() => p.setMinSetBonuses({...p.minSetBonuses, [setName]: 0})}>0 set</button>
                    <button className={p.minSetBonuses[setName] === 2 ? 'selected' : ''} onClick={() => p.setMinSetBonuses({...p.minSetBonuses, [setName]: 2})}>2 set</button>
                    <button className={p.minSetBonuses[setName] === 4 ? 'selected' : ''} onClick={() => p.setMinSetBonuses({...p.minSetBonuses, [setName]: 4})}>4 set</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null;
      })()}
      <OmniumFolioPicker value={p.omniumFolio} onChange={p.setOmniumFolio} />
      <Enhancements
        inventory={inventory}
        selected={p.enhancementIds}
        toggle={p.toggle}
        setSelected={p.setEnhancementIds}
      />
      <section className="topgear-actions">
        <div>
          <b>Ready to compare locally</b>
          <span>
            Selected options are preserved with the run input and native SimC
            report.
          </span>
        </div>
        <button className="primary" onClick={() => p.run(false)}>
          Find Top Gear
        </button>
      </section>
      <section id="talents" className="panel compact">
        <p className="eyebrow">TALENTS & CUSTOM GEAR</p>
        <div className="two-col">
          <div>
            <h2>Talent loadouts</h2>
            {inventory.talents.map((t) => (
              <label className="checkline" key={t.id}>
                <input
                  type="checkbox"
                  checked={p.talents.has(t.id)}
                  onChange={() => p.toggle(p.talents, t.id, p.setTalents)}
                />
                {t.name}
              </label>
            ))}
          </div>
          <div>
            <h2>Add raw SimC candidate</h2>
            <input
              value={p.custom}
              onChange={(e: any) => p.setCustom(e.target.value)}
              placeholder="finger1=my_ring,id=123"
            />
            <button onClick={p.addCustom}>Add candidate</button>
          </div>
        </div>
      </section>
    </>
  );
}
function TopGearDual(p: any) {
  const inventory: Inventory | undefined = p.inventory;
  if (!inventory?.dualWieldCapable) return <TopGear {...p} />;
  const mirrored = inventory.candidates.flatMap((candidate) =>
    candidate.handedness === "one-hand" &&
    ["main_hand", "off_hand"].includes(candidate.slot)
      ? [
          candidate,
          {
            ...candidate,
            slot: candidate.slot === "main_hand" ? "off_hand" : "main_hand",
          },
        ]
      : [candidate],
  );
  return (
    <>
      <p className="weapon-pool-note">
        Dual-wield pool active: verified one-handed weapons can be selected for
        either hand. A single item instance is still used only once.
      </p>
      <TopGear {...p} inventory={{ ...inventory, candidates: mirrored }} />
    </>
  );
}
function Slot({
  slot,
  candidates,
  ...p
}: {
  slot: string;
  candidates: Candidate[];
  [key: string]: any;
}) {
  const title = slotNames[slot],
    allSelected =
      candidates.length > 0 && candidates.every((c) => p.selected.has(c.id));
  const toggleAll = () => {
    const next = new Set(p.selected);
    if (allSelected) candidates.forEach((c) => next.delete(c.id));
    else candidates.forEach((c) => next.add(c.id));
    p.setSelected(next);
  };
  return (
    <article className="slot">
      <header>
        <span className="slot-symbol">{slotIcons[slot]}</span>
        <h3>{title}</h3>
        {candidates.length > 0 && (
          <label className="slot-select-all">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            All
          </label>
        )}
        {candidates.some((c) => c.source === "equipped") && (
          <button
            className={p.locks.has(slot) ? "slot-lock locked" : "slot-lock"}
            onClick={() => p.toggle(p.locks, slot, p.setLocks)}
          >
            {p.locks.has(slot) ? "Locked" : "Lock"}
          </button>
        )}
      </header>
      <div className="slot-items">
        {candidates.length ? (
          candidates.map((c) => (
            <label
              className={`gear-card ${p.selected.has(c.id) ? "picked" : ""} ${c.source}`}
              key={`${c.id}-${slot}`}
            >
              <input
                type="checkbox"
                checked={p.selected.has(c.id)}
                onChange={() => p.toggle(p.selected, c.id, p.setSelected)}
              />
              <span
                className="item-icon"
                style={{ position: "relative", overflow: "hidden" }}
              >
                {c.itemId ? (
                  <img
                    src={`/api/catalog/items/${c.itemId}/icon`}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                {slotIcons[slot]}
              </span>
              <span className="item-copy">
                <b>{c.name}</b>
                <small>
                  <em>{c.source === "vault" ? "Vault" : c.source}</em>
                  {c.itemLevel ? ` · ilvl ${c.itemLevel}` : ""}
                  {c.handedness === "one-hand" &&
                  ["main_hand", "off_hand"].includes(slot)
                    ? " · either hand"
                    : ""}
                </small>
                {c.enchant || c.gems?.length ? (
                  <i>
                    {c.enchant && `✦ enchant ${c.enchant}`}
                    {c.gems?.map((g) => ` ◇ gem ${g}`).join("")}
                  </i>
                ) : null}
              </span>
            </label>
          ))
        ) : (
          <p className="empty-slot">No candidates imported</p>
        )}
      </div>
    </article>
  );
}
function Enhancements({
  inventory,
  selected,
  toggle,
  setSelected,
}: {
  inventory: Inventory;
  selected: Set<string>;
  toggle: any;
  setSelected: any;
}) {
  const available = inventory.enhancements || [];
  const kinds = [
    ["gem", "Gems", "Socket choices"],
    ["enchant", "Slot enchants", "Armor and ring choices"],
    ["weapon", "Weapon enhancements", "Main-hand and off-hand choices"],
  ] as const;
  return (
    <section id="enchants" className="enhancements enhancement-workbench">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ENHANCEMENTS</p>
          <h2>Gem & enchant matrix</h2>
          <p>
            Imported enhancements are the baseline. Pick local alternatives to
            include in the exact search.
          </p>
        </div>
        <span>{selected.size} selected</span>
      </div>
      <div className="enhancement-controls">
        <label className="checkline">
          <input
            type="checkbox"
            checked={replaceExistingPreference}
            onChange={(e) => setReplaceExistingPreference(e.target.checked)}
          />
          <span>
            <b>Replace existing gems / enchants</b>
            <small>
              Test selected choices on every detected compatible existing
              enhancement.
            </small>
          </span>
        </label>
        <p
          className={
            replaceExistingPreference
              ? "replacement-warning active"
              : "replacement-warning"
          }
        >
          {replaceExistingPreference
            ? "Massive-search warning: this builds a full enhancement matrix and can increase compute time dramatically."
            : "Existing gems and enchants are preserved. Select this only when you want to retest all detected enhanced slots."}
        </p>
      </div>
      {available.length ? (
        <div className="enhancement-groups">
          {kinds.map(([type, title, detail]) => {
            const options = available.filter((x) => x.type === type);
            return (
              <article
                key={type}
                className={`enhancement-card enhancement-${type}`}
              >
                <header>
                  <div>
                    <h3>{title}</h3>
                    <p>{detail}</p>
                  </div>
                  <button
                    className="tiny-button"
                    onClick={() =>
                      setSelected(new Set(options.map((x) => x.id)))
                    }
                  >
                    Select all
                  </button>
                </header>
                {options.length ? (
                  type === "enchant" ? (
                    <div className="enhancement-slot-groups">
                      {Object.values(
                        options.reduce((acc: any, x) => {
                          const k = x.slots.join("-");
                          acc[k] = acc[k] || [];
                          acc[k].push(x);
                          return acc;
                        }, {}),
                      ).map((groupOptions: any) => (
                        <div
                          key={groupOptions[0].slots.join("-")}
                          className="enhancement-slot-group"
                        >
                          <h4
                            style={{
                              margin: "8px 0 4px",
                              fontSize: "0.8rem",
                              color: "#888",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {groupOptions[0].slots
                              .map((s: string) => slotNames[s] || s)
                              .join(", ")}
                          </h4>
                          <div className="enhancement-options">
                            {groupOptions.map((x: any) => (
                              <label
                                key={x.id}
                                className={`enhancement-option ${selected.has(x.id) ? "selected" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.has(x.id)}
                                  onChange={() =>
                                    toggle(selected, x.id, setSelected)
                                  }
                                />
                                  {x.iconFileDataId ? (
                                    <>
                                      <img src={`/api/catalog/icons/${x.iconFileDataId}`} className="item-icon small" onError={(e: any) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'inline-block'; }} />
                                      <span className="item-icon small fallback" style={{display: 'none'}}>✦</span>
                                    </>
                                  ) : (
                                    <span className="item-icon small">✦</span>
                                  )}
                                <span>
                                  <b>{x.name}</b>
                                  <small>
                                    {x.effect ? `${x.effect} · ` : ""}
                                    {x.slots
                                      .map((s: string) => slotNames[s] || s)
                                      .join(", ")}
                                  </small>
                                </span>
                                <i>{selected.has(x.id) ? "Selected" : ""}</i>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : type === "gem" ? (
                    <div className="enhancement-slot-groups">
                      {Object.entries(
                        options.reduce((acc: any, x) => {
                          const lower = x.name.toLowerCase();
                          let cat = "Other Gems";
                          if (lower.includes("diamond"))
                            cat = "Diamonds (Primary Stat)";
                          else if (lower.includes("deadly"))
                            cat = "Critical Strike";
                          else if (lower.includes("quick")) cat = "Haste";
                          else if (lower.includes("masterful")) cat = "Mastery";
                          else if (lower.includes("versatile"))
                            cat = "Versatility";
                          acc[cat] = acc[cat] || [];
                          acc[cat].push(x);
                          return acc;
                        }, {}),
                      )
                        .sort((a: any, b: any) => a[0].localeCompare(b[0]))
                        .map(([catName, groupOptions]: any) => (
                          <div key={catName} className="enhancement-slot-group">
                            <h4
                              style={{
                                margin: "8px 0 4px",
                                fontSize: "0.8rem",
                                color: "#888",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              {catName}
                            </h4>
                            <div className="enhancement-options">
                              {groupOptions.map((x: any) => (
                                <label
                                  key={x.id}
                                  className={`enhancement-option ${selected.has(x.id) ? "selected" : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected.has(x.id)}
                                    onChange={() =>
                                      toggle(selected, x.id, setSelected)
                                    }
                                  />
                                  {x.iconFileDataId ? (
                                    <>
                                      <img src={`/api/catalog/icons/${x.iconFileDataId}`} className="item-icon small" onError={(e: any) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'inline-block'; }} />
                                      <span className="item-icon small fallback" style={{display: 'none'}}>◇</span>
                                    </>
                                  ) : (
                                    <span className="item-icon small">◇</span>
                                  )}
                                  <span>
                                    <b>{x.name}</b>
                                    <small>
                                      {x.effect ? `${x.effect} · ` : ""}
                                      {x.slots
                                        .map((s: string) => slotNames[s] || s)
                                        .join(", ")}
                                    </small>
                                  </span>
                                  <i>{selected.has(x.id) ? "Selected" : ""}</i>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="enhancement-options">
                      {options.map((x) => (
                        <label
                          key={x.id}
                          className={`enhancement-option ${selected.has(x.id) ? "selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(x.id)}
                            onChange={() => toggle(selected, x.id, setSelected)}
                          />
                          <span className="item-icon small">
                            {type === "weapon" ? "⚔" : "✦"}
                          </span>
                          <span>
                            <b>{x.name}</b>
                            <small>
                              {x.effect ? `${x.effect} · ` : ""}
                              {x.slots.map((s) => slotNames[s] || s).join(", ")}
                            </small>
                          </span>
                          <i>{selected.has(x.id) ? "Selected" : ""}</i>
                        </label>
                      ))}
                    </div>
                  )
                ) : (
                  <p className="enhancement-empty">
                    No compatible local {title.toLowerCase()} are installed yet.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="enhancement-empty">
          No local enhancement records yet. Refresh the catalog to install
          current-season options.
        </div>
      )}
    </section>
  );
}
function Workload({ preview }: { preview?: Preview }) {
  if (!preview)
    return (
      <section className="workload muted">
        Calculating valid combinations…
      </section>
    );
  const profiles = Number(preview.profilesets || 1),
    iterations = Number(preview.iterations || 0),
    total = Number(preview.totalIterations ?? profiles * iterations),
    variants = Number(preview.enhancementVariants || 0),
    matrix = Number(preview.enhancementCombinations || 1);
  return (
    <section className={`workload ${preview.intensity || "green"}`}>
      <div>
        <span className="workload-label">Iterations</span>
        <strong>
          {total.toLocaleString()}{" "}
          <small>/ {profiles.toLocaleString()} profiles</small>
        </strong>
        <em>
          {Number(preview.combinations || 1).toLocaleString()} valid
          combinations
        </em>
      </div>
      <div>
        <span>Enhancement matrix</span>
        <b>{matrix.toLocaleString()}× candidate variants</b>
        <small>+{variants.toLocaleString()} generated variants</small>
      </div>
      <div>
        <span>SimC work</span>
        <b>{iterations.toLocaleString()} iter. per profile</b>
        <small>
          {preview.replaceExistingEnhancements
            ? "Replacing existing enhancements"
            : "Keeping imported enhancements"}
        </small>
      </div>
      <div>
        <span>Local estimate</span>
        <b>{formatTime(Number(preview.estimatedSeconds || 0))}</b>
        <small>
          {preview.calibration === "learned"
            ? "calibrated from local runs"
            : "first-run estimate"}
        </small>
      </div>
      <i>
        {preview.intensity === "green"
          ? "Light"
          : preview.intensity === "amber"
            ? "Moderate"
            : preview.intensity === "orange"
              ? "Heavy"
              : "Very heavy"}
      </i>
      {(preview.warnings || []).map((w) => (
        <p key={w}>{w}</p>
      ))}
    </section>
  );
}
function Catalog() {
  const [state, setState] = useState<any>(),
    [health, setHealth] = useState<any>(),
    [captures, setCaptures] = useState<any>(),
    [wowPath, setWowPath] = useState(""),
    [payload, setPayload] = useState(""),
    [message, setMessage] = useState("");
  const load = () =>
    Promise.all([
      api("/catalog/refresh-status"),
      api("/catalog/status"),
      api("/catalog/captures/status"),
    ]).then(([refresh, catalog, capture]) => {
      setState(refresh);
      setHealth(catalog);
      setCaptures(capture);
      setWowPath(capture.wowPath || "");
    });
  useEffect(() => {
    load();
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, []);
  const importPayload = () =>
    api("/catalog/captures/import", post({ payload }))
      .then((x: any) => {
        setMessage(
          `Installed ${x.verified} verified live variants.${x.unresolved?.length ? ` ${x.unresolved.length} unresolved.` : ""}`,
        );
        setPayload("");
        load();
      })
      .catch((e: Error) => setMessage(e.message));
  return (
    <section className="panel">
      <p className="eyebrow">BLIZZARD GAME DATA API</p>
      <h2>Current-season catalog</h2>
      <p>
        {state?.configured
          ? "Credentials are available from your environment. Refreshes build and validate a staged SQLite package before atomically installing it."
          : "Set BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET as user environment variables, then restart the dashboard."}
      </p>
      <div className="catalog-status">
        <b>{state?.status || "idle"}</b>
        <span>
          {state?.progress
            ? `${state.progress.phase}: ${state.progress.detail}`
            : state?.error || "No refresh currently running."}
        </span>
        <span>
          Bundled variant seed:{" "}
          {health?.variantSeed?.version || "not installed"} ·{" "}
          {health?.variantSeed?.verified || 0} exact variants. Live captures are
          included in the coverage below.
        </span>
        {health?.variantCoverage?.map((x: any) => (
          <span key={`${x.source}-${x.difficulty}`}>
            {x.source} · {x.difficulty}: {x.verified}/{x.total} verified
          </span>
        ))}
      </div>
      <button
        className="primary"
        disabled={!state?.configured || state?.status === "running"}
        onClick={() => api("/catalog/refresh", post({})).then(load)}
      >
        Refresh current season
      </button>
      <hr />
      <p className="eyebrow">LIVE ADDON CAPTURES</p>
      <h3>LocalSimDashCatalog</h3>
      <p>
        Install the bundled addon, run <code>/lsdscan all</code>, then either
        paste <code>/lsdexport</code> below or configure your Retail folder for
        automatic SavedVariables imports after <code>/reload</code>.
      </p>
      <label>
        Retail installation folder
        <input
          value={wowPath}
          onChange={(e) => setWowPath(e.target.value)}
          placeholder="C:\\Program Files (x86)\\World of Warcraft"
        />
      </label>
      <button
        onClick={() =>
          api("/catalog/captures/config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wowPath }),
          })
            .then(load)
            .catch((e: Error) => setMessage(e.message))
        }
      >
        Enable automatic import
      </button>
      <small>
        {captures?.savedVariablesPath
          ? `Watching ${captures.savedVariablesPath}`
          : "No SavedVariables file configured."}
      </small>
      <textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        placeholder="Paste LSDC1 addon export"
      />
      <button disabled={!payload} onClick={importPayload}>
        Import addon capture
      </button>
      {message && <p className="notice">{message}</p>}
      {captures?.unresolved?.length ? (
        <p className="result-warnings">
          Unresolved captures: {captures.unresolved.join(", ")}
        </p>
      ) : null}
    </section>
  );
}
function Droptimizer({ profileId, inventory, minSetBonuses, setMinSetBonuses }: { profileId?: number; inventory?: Inventory; minSetBonuses?: Record<string, number>; setMinSetBonuses?: (v: Record<string, number>) => void }) {
  const [sources, setSources] = useState<any[]>([]),
    [source, setSource] = useState(""),
    [difficulty, setDifficulty] = useState(""),
    [drops, setDrops] = useState<any[]>([]),
    [error, setError] = useState("");
  const [upgradeTargets, setUpgradeTargets] = useState<any[]>([]);
  const [upgradeTarget, setUpgradeTarget] = useState<number>(0);
  const [upgradeEquipped, setUpgradeEquipped] = useState<boolean>(false);
  const compute = useComputePower("droptimizer");
  useEffect(() => {
    api("/catalog/sources").then(setSources);
    api("/droptimizer/targets").then(setUpgradeTargets).catch(() => {});
  }, []);
  useEffect(() => {
    if (source)
      api(`/droptimizer/drops?profileId=${profileId}&instance=${encodeURIComponent(source)}`).then(
        setDrops,
      );
  }, [source, profileId]);
  const difficulties = [...new Set(drops.map((d) => d.difficulty))];
  const shown = difficulty
      ? drops.filter((d) => d.difficulty === difficulty)
      : drops,
    verified = shown.filter((d) => d.status === "verified"),
    unverifiedEligibility = shown.filter((d) => d.eligibility?.confidence === "unknown");
  const start = async () => {
    if (!profileId) {
      setError("Import or select a character before running Droptimizer.");
      return;
    }
    try {
      const x = await api(
        "/droptimizer/run",
        post({
          profileId,
          source,
          difficulty,
          threads: compute.threads,
          minSetBonuses,
          upgradeTarget,
          upgradeEquipped,
          scenario: defaultScenario(1),
        }),
      );
      window.dispatchEvent(new CustomEvent("droptimizer-run", { detail: x }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="droptimizer">
      <p className="drop-lead">
        Choose a current-season source and Droptimizer will evaluate its
        personal loot against your equipped character.
      </p>
      <div className="source-picker">
        <h2>Sources</h2>
        <div className="source-tiles">
          {sources.map((s) => (
            <button
              key={s.instanceName}
              className={
                source === s.instanceName
                  ? "source-tile selected"
                  : "source-tile"
              }
              onClick={() => {
                setSource(s.instanceName);
                setDifficulty("");
                setError("");
              }}
            >
              <small>{s.season}</small>
              <span>{s.instanceName}</span>
            </button>
          ))}
          {[
            "Great Vault",
            "Bonus rolls",
            "Delves",
            "Crafted items",
            "Catalyst",
          ].map((name) => (
            <div className="source-tile unavailable" key={name}>
              <span>{name}</span>
              <small>Catalog data not installed</small>
            </div>
          ))}
        </div>
        {source && (
          <>
            <h3>Difficulty / track</h3>
            <div className="target-pills">
              {difficulties.map((d) => (
                <button
                  key={d}
                  className={difficulty === d ? "selected" : ""}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="drop-summary">
              <b>
                {verified.length}/{shown.length} verified catalog variants
              </b>
              <span>
                {source}
                {difficulty ? ` · ${difficulty}` : ""}
              </span>
              <span>
                {shown.length - verified.length
                  ? `${shown.length - verified.length} need captured variant data.`
                  : "Every listed drop has an exact SimC variant."}
              </span>
              {unverifiedEligibility.length > 0 && <span className="result-warnings">{unverifiedEligibility.length} shown with unverified equipment eligibility.</span>}
            </div>
            <div className="upgrade-options" style={{ marginTop: '24px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Upgrade Track (Optional)</h3>
              <p style={{ marginBottom: '12px', fontSize: '0.9rem' }}>Override the item level of all simulated drops to evaluate them at a specific upgrade rank.</p>
              <select value={upgradeTarget} onChange={e => setUpgradeTarget(Number(e.target.value))} style={{ padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', width: '100%', marginBottom: '12px' }}>
                <option value={0}>No override (Use base drop item level)</option>
                {upgradeTargets.map(t => (
                  <option key={t.itemLevel} value={t.itemLevel}>{t.track} - {t.itemLevel} ilvl</option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={upgradeEquipped} onChange={e => setUpgradeEquipped(e.target.checked)} disabled={!upgradeTarget} />
                <span style={{ opacity: upgradeTarget ? 1 : 0.5 }}>Also upgrade my currently equipped gear to this level (for accurate relative comparisons)</span>
              </label>
            </div>
            {(() => {
              const availableSets = inventory ? ([...new Set(inventory.candidates.map(c => c.setName).filter(Boolean))] as string[]) : [];
              return availableSets.length > 0 && minSetBonuses && setMinSetBonuses ? (
                <section className="panel compact item-sets-panel" style={{marginBottom:'24px'}}>
                  <p className="eyebrow">SAFEGUARDS</p>
                  <h2>Item Sets</h2>
                  <p>Prevent combinations that break these set bonuses if you have them available.</p>
                  <div className="enhancement-slot-groups">
                    {availableSets.map(setName => (
                      <div key={setName} className="enhancement-slot-group" style={{marginTop:'12px'}}>
                        <h4 style={{ margin: '8px 0 8px', fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{setName}</h4>
                        <div className="target-pills">
                          <button className={!minSetBonuses[setName] ? 'selected' : ''} onClick={() => setMinSetBonuses({...minSetBonuses, [setName]: 0})}>0 set</button>
                          <button className={minSetBonuses[setName] === 2 ? 'selected' : ''} onClick={() => setMinSetBonuses({...minSetBonuses, [setName]: 2})}>2 set</button>
                          <button className={minSetBonuses[setName] === 4 ? 'selected' : ''} onClick={() => setMinSetBonuses({...minSetBonuses, [setName]: 4})}>4 set</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null;
            })()}
            <ComputePower
              value={compute.threads}
              setValue={compute.setThreads}
              capacity={compute.capacity}
              refresh={compute.refresh}
            />
            {error && <p className="result-warnings">{error}</p>}
            {verified.length > 50 && (
              <p className="result-warnings" style={{ color: 'orange', fontSize: '0.9rem', marginBottom: '1rem', marginTop: '1rem' }}>
                Warning: You are about to queue a very large Droptimizer batch ({verified.length} simulations). This may take several minutes to complete.
              </p>
            )}
            <button
              className="primary"
              disabled={!difficulty || !verified.length || !compute.threads}
              onClick={start}
            >
              Rank verified upgrades
            </button>
            <div className="drops">
              {shown.map((d) => (
                <div
                  key={`${d.id}-${d.boss}-${d.difficulty}`}
                  className={d.status === "verified" ? "" : "unavailable"}
                >
                  <span className="item-icon">
                    {d.id && (
                      <img
                        src={`/api/catalog/items/${d.id}/icon`}
                        onError={(e) =>
                          (e.currentTarget.style.display = "none")
                        }
                      />
                    )}
                  </span>
                  <b>{d.name}</b>
                  <small>
                    {d.status === "verified"
                      ? `Verified · ilvl ${d.itemLevel} · ${d.boss} · ${d.difficulty}`
                      : `Variant data required · ${d.boss} · ${d.difficulty}`}
                  </small>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
function Result({ runId, back }: { runId?: number; back: () => void }) {
  const [data, setData] = useState<any>();
  const [pending, setPending] = useState<any>();
  const [progress, setProgress] = useState<any>();
  useEffect(() => {
    if (!runId) return;
    let dead = false;
    const load = async () => {
      try {
        const value = await api(`/runs/${runId}/result`);
        if (!dead) setData(value);
      } catch {
        try {
          const [run, job] = await Promise.all([
            api(`/runs/${runId}`),
            api(`/runs/${runId}/progress`),
          ]);
          if (!dead) {
            setPending(run);
            setProgress(job);
          }
        } catch {
          /* server restarting; retain the last visible state. */
        }
      }
    };
    load();
    const timer = setInterval(load, 1200);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [runId]);
  if (!runId)
    return (
      <section className="panel">Choose a completed run from history.</section>
    );
  if (!data) {
    const total = progress?.totalProfiles || 0,
      doneRaw = progress?.completedProfiles || 0,
      done = Math.floor(doneRaw),
      pct = total ? Math.round((doneRaw / total) * 100) : 0;
    return (
      <section className="panel result-pending">
        <button onClick={back}>Back to run history</button>
        <h2>{pending?.title || "Preparing local result"}</h2>
        {pending?.status === "failed" ? (
          <p>{pending.summary}</p>
        ) : (
          <>
            <p>
              {progress?.stage === "baseline"
                ? "Running equipped baseline…"
                : total
                  ? `Simulating batch ${progress.currentBatch || 0} of ${progress.totalBatches || "…"} · ${done}/${total} candidate profiles evaluated.`
                  : "Reconnecting to the local simulation service…"}
            </p>
            <div className="progress-track">
              <i style={{ width: `${total ? pct : 55}%` }} />
            </div>
            <div className="progress-facts">
              <span>{total ? `${pct}% complete` : "Preparing"}</span>
              <span>
                {progress?.estimatedRemainingMs
                  ? `${formatTime(Math.ceil(progress.estimatedRemainingMs / 1000))} remaining`
                  : "Learning ETA…"}
              </span>
              {progress?.threads && (
                <span>{progress.threads} safe SimC threads</span>
              )}
              {progress?.failedProfiles ? (
                <span>{progress.failedProfiles} unavailable</span>
              ) : null}
            </div>
            {progress?.partialResults?.length ? (
              <div className="partial-leaders">
                <b>Provisional upgrades</b>
                {progress.partialResults.slice(0, 3).map((x: any) => (
                  <span key={x.name}>
                    {x.name}{" "}
                    {x.delta !== undefined
                      ? `${x.delta >= 0 ? "+" : ""}${Math.round(x.delta)} DPS`
                      : ""}
                  </span>
                ))}
              </div>
            ) : null}
            {progress?.cancelAvailable && (
              <button
                onClick={() =>
                  api(`/runs/${runId}/cancel`, post({})).then(() =>
                    setPending((x: any) =>
                      x ? { ...x, status: "cancelled" } : x,
                    ),
                  )
                }
              >
                Cancel simulation
              </button>
            )}
          </>
        )}
      </section>
    );
  }
  const { run, result } = data;
  const maxDamage = Math.max(
    ...(result.damage || []).map((x: any) => x.amount),
    1,
  );
  const maxBuff = Math.max(
    ...(result.buffs || []).map((x: any) => x.uptime),
    1,
  );
  const baselineGear =
    result.comparisons?.find(
      (x: any) => Math.abs(x.delta) < 0.01 && x.source === "bags",
    )?.gear ||
    result.comparisons?.[0]?.gear ||
    result.gear ||
    [];
  return (
    <section className="result-view">
      <button onClick={back}>← Run history</button>
      <div className="result-layout">
        <div>
          <section className="result-hero">
            <p className="eyebrow">
              {result.kind === "topgear"
                ? "TOP GEAR"
                : result.kind === "droptimizer"
                  ? "DROPTIMIZER"
                  : "QUICK SIM"}
            </p>
            <h2>
              {result.character?.name || run.title}
              <strong>{Math.round(result.dps).toLocaleString()} DPS</strong>
            </h2>
            <p>
              {result.character?.specialization || "Local Simulation"} ·{" "}
              {run.scenario.fightStyle} · {run.scenario.targets} target
              {run.scenario.targets === 1 ? "" : "s"}
            </p>
            <div className="result-gear">
              {result.gear?.map((g: any, i: number) => (
                <span
                  className="item-icon"
                  title={g.name}
                  key={`${g.slot}-${i}`}
                >
                  {g.itemId && (
                    <img
                      src={`/api/catalog/items/${g.itemId}/icon`}
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  )}
                </span>
              ))}
            </div>
          </section>
          {result.warnings?.length > 0 && (
            <section className="result-warnings">
              SimC reported {result.warnings.length} notification
              {result.warnings.length === 1 ? "" : "s"}.
            </section>
          )}
          {result.kind === "topgear" ? (
            <section className="result-table">
              <h2>Top Gear rankings</h2>
              {result.comparisons?.map((x: any, i: number) => {
                const isBaseline = Math.abs(x.delta) < 0.01;
                const diffs = isBaseline
                  ? []
                  : x.gear?.filter((g: any) => {
                      const baseItem = baselineGear.find(
                        (bg: any) => bg.slot === g.slot,
                      );
                      return !baseItem || baseItem.rawLine !== g.rawLine;
                    }) || [];
                const diffDescriptions = diffs.map((g: any) => {
                  const baseItem = baselineGear.find(
                    (bg: any) => bg.slot === g.slot,
                  );
                  if (!baseItem) return `+ ${g.name}`;
                  if (baseItem.name !== g.name)
                    return `+ ${g.name} (- ${baseItem.name})`;
                  const changes = [];
                  const gEnchant = g.rawLine.match(
                    /(?:^|,)enchant_id=([^,]+)/,
                  )?.[1];
                  const bEnchant = baseItem.rawLine.match(
                    /(?:^|,)enchant_id=([^,]+)/,
                  )?.[1];
                  if (gEnchant !== bEnchant)
                    changes.push(`Enchant: ${gEnchant || "None"}`);
                  const gGems = g.rawLine.match(/(?:^|,)gem_id=([^,]+)/)?.[1];
                  const bGems = baseItem.rawLine.match(
                    /(?:^|,)gem_id=([^,]+)/,
                  )?.[1];
                  if (gGems !== bGems)
                    changes.push(
                      `Gems: ${gGems ? gGems.split("/").join(", ") : "None"}`,
                    );
                  return `${g.name} (${changes.join("; ")})`;
                });
                return (
                  <div className="compare-row" key={x.name}>
                    <b>#{i + 1}</b>
                    <div className="compare-gear-diffs">
                      {isBaseline ? (
                        <span className="muted">Equipped — Current Gear</span>
                      ) : diffs.length ? (
                        diffs.map((g: any, j: number) => (
                          <span
                            className="item-icon changed"
                            title={g.name}
                            key={`${g.slot}-${j}`}
                          >
                            {g.itemId && (
                              <img
                                src={`/api/catalog/items/${g.itemId}/icon`}
                                onError={(e: any) =>
                                  (e.currentTarget.style.display = "none")
                                }
                              />
                            )}
                          </span>
                        ))
                      ) : (
                        <span className="muted">No items changed</span>
                      )}
                      {!isBaseline && diffDescriptions.length > 0 && (
                        <span
                          className="compare-diff-text"
                          style={{
                            fontSize: "0.85rem",
                            color: "#999",
                            marginLeft: "8px",
                            lineHeight: "1.4",
                          }}
                        >
                          {diffDescriptions.join(" | ")}
                        </span>
                      )}
                    </div>
                    <div className="compare-details">
                      <span>
                        {x.talent || "Loadout"} ·{" "}
                        {x.source === "vault" ? "Vault claim" : "Best in Bags"}
                      </span>
                      <strong>
                        {Math.round(x.dps).toLocaleString()}{" "}
                        <em>
                          {isBaseline
                            ? "-"
                            : `${x.delta >= 0 ? "+" : ""}${Math.round(x.delta)} DPS`}
                        </em>
                      </strong>
                    </div>
                  </div>
                );
              })}
            </section>
          ) : result.kind === "droptimizer" ? (
            <DroptimizerResults
              rows={result.comparisons || []}
              baseline={result.baselineDps}
              runId={run.id}
            />
          ) : (
            <>
              <MetricTable
                title="Damage Breakdown"
                rows={result.damage || []}
                max={maxDamage}
                value={(x: any) => x.amount}
                suffix=""
              />
              <MetricTable
                title="Buff Uptime"
                rows={result.buffs || []}
                max={maxBuff}
                value={(x: any) => x.uptime}
                suffix="%"
              />
            </>
          )}
        </div>
        <aside className="result-details">
          <h3>Simulation details</h3>
          <b>{run.scenario.fightStyle}</b>
          <p>
            {run.scenario.duration / 60} minutes · {run.scenario.targets} target
            {run.scenario.targets === 1 ? "" : "s"}
          </p>
          <p>Bloodlust: {run.scenario.bloodlust}</p>
          <p>
            Iterations: {result.iterations?.toLocaleString() || "Profilesets"}
          </p>
          <p>Margin of error: ±{Math.round(result.error || 0)} DPS</p>
          <p>Processing: {result.elapsedSeconds?.toFixed?.(2) || "—"}s</p>
          <p className="muted">{run.simcVersion}</p>
          <a href={`/api/runs/${run.id}/report`} target="_blank">
            Full SimC HTML report
          </a>
          <a href={`/api/runs/${run.id}/input`} target="_blank">
            Generated SimC input
          </a>
        </aside>
      </div>
    </section>
  );
}
function DroptimizerResults({
  rows,
  baseline,
  runId,
}: {
  rows: any[];
  baseline?: number;
  runId: number;
}) {
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [verified, setVerified] = useState<Record<string, any>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const visible = rows.map((row) => verified[`${row.itemId}-${row.slot}`] ? {...row,...verified[`${row.itemId}-${row.slot}`],targeted:true} : row).filter((x) => showUnavailable || !x.error);
  const verify = async (row:any) => {
    const key=`${row.itemId}-${row.slot}`;
    if(!confirm('This item seems to have a potentially erroneous sim value. Run a targeted verification to check its value?'))return;
    setVerifying(value=>({...value,[key]:true}));
    try {
      const created=await api(`/droptimizer/runs/${runId}/verify-item`,post({itemId:row.itemId,slot:row.slot}));
      const until=Date.now()+10*60*1000;
      while(Date.now()<until){
        await new Promise(resolve=>setTimeout(resolve,1200));
        try { const value=await api(`/runs/${created.id}/result`); const comparison=value.result.comparisons?.[0]; if(comparison){setVerified(value=>({...value,[key]:comparison}));return;} } catch { const status=await api(`/runs/${created.id}`); if(status.status==='failed')throw new Error(status.summary||'Verification failed.'); }
      }
      throw new Error('Verification timed out.');
    } catch(error) { alert(error instanceof Error?error.message:'Verification failed.'); }
    finally { setVerifying(value=>({...value,[key]:false})); }
  };
  return (
    <section className="result-table drop-results">
      <div className="drop-result-header">
        <div>
          <h2>Upgrade priority</h2>
          <small>
            Each item is compared independently against your equipped gear
            {baseline
              ? ` (${Math.round(baseline).toLocaleString()} DPS baseline)`
              : ""}
            .
          </small>
        </div>
        <label className="checkline">
          <input
            type="checkbox"
            checked={showUnavailable}
            onChange={(e) => setShowUnavailable(e.target.checked)}
          />
          Show unavailable
        </label>
      </div>
      {visible.map((x, i) => (
        <div
          className={`drop-result-row ${x.error ? "unavailable" : ""}`}
          key={`${x.itemId}-${x.slot}`}
        >
          <b>#{i + 1}</b>
          <span className="item-icon">
            {x.itemId && (
              <img
                src={`/api/catalog/items/${x.itemId}/icon`}
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
          </span>
          <div>
            <strong>{x.name}</strong>
            {x.verificationEligible && !x.targeted && <button className="verify-item" title={`This item seems to have a potentially erroneous sim value. Would you like to run a targeted sim for it to ensure its ranking is accurate?${x.verificationReasons?.length ? ` ${x.verificationReasons.join(' ')}` : ''}`} onClick={() => verify(x)} disabled={verifying[`${x.itemId}-${x.slot}`]}>{verifying[`${x.itemId}-${x.slot}`] ? '…' : '⚠'}</button>}
            <small>
              {x.itemLevel ? `ilvl ${x.itemLevel} · ` : ""}
              {x.slot} · {x.boss} · {x.difficulty}
            </small>
            {x.error && (
              <small className="row-error">Unavailable: {x.error}</small>
            )}
          </div>
          <div className="drop-score">
            <strong>
              {x.error ? "—" : Math.round(x.dps).toLocaleString()}
            </strong>
            <em className={x.significant === false ? "neutral" : x.delta >= 0 ? "gain" : "loss"}>
              {x.error
                ? "Not simulated"
                : x.targeted
                  ? `Targeted verification · ±${Math.round(x.uncertainty || 0)} DPS`
                : x.significant === false
                  ? `Inconclusive · ±${Math.round(x.uncertainty || 0)} DPS simulation uncertainty`
                  : `${x.delta >= 0 ? "+" : ""}${Math.round(x.delta)} DPS (${(x.relative * 100).toFixed(2)}%)`}
            </em>
          </div>
        </div>
      ))}
      {!visible.length && (
        <p className="muted">No compatible catalog drops were simulated.</p>
      )}
    </section>
  );
}
function MetricTable({
  title,
  rows,
  max,
  value,
  suffix,
}: {
  title: string;
  rows: any[];
  max: number;
  value: (x: any) => number;
  suffix: string;
}) {
  return (
    <section className="result-table">
      <h2>{title}</h2>
      {rows.slice(0, 30).map((x: any) => (
        <div className="metric-row" key={x.name}>
          <span>{x.name}</span>
          <i>
            <b style={{ width: `${Math.max(1, (value(x) / max) * 100)}%` }} />
          </i>
          <strong>
            {suffix
              ? `${value(x).toFixed(1)}${suffix}`
              : Math.round(value(x)).toLocaleString()}
          </strong>
          <small>{x.count || "—"}</small>
        </div>
      ))}
    </section>
  );
}
function Runs({
  runs,
  refreshRuns,
  openResult,
}: {
  runs: Run[];
  refreshRuns: () => Promise<unknown>;
  openResult: (id: number) => void;
}) {
  const [selected, setSelected] = useState(new Set<number>()),
    [query, setQuery] = useState("");
  const visible = runs.filter((r) =>
    `${r.title} ${r.character?.name || ""} ${r.status}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const terminal = (r: Run) => !["queued", "running"].includes(r.status);
  const remove = async (ids: number[]) => {
    if (
      !ids.length ||
      !confirm(
        `Delete ${ids.length} saved run${ids.length === 1 ? "" : "s"} and associated reports?`,
      )
    )
      return;
    await api("/runs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setSelected(new Set());
    await refreshRuns();
  };
  const toggleAll = () => {
    const next = new Set<number>();
    const eligible = visible.filter(terminal);
    if (selected.size !== eligible.length && eligible.length > 0)
      eligible.forEach((r) => next.add(r.id));
    setSelected(next);
  };
  return (
    <section className="panel history-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">RUN HISTORY</p>
          <h2>Local simulations</h2>
        </div>
        <div className="history-actions">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter runs"
          />
          <button onClick={toggleAll}>
            {selected.size > 0 &&
            selected.size === visible.filter(terminal).length
              ? "Deselect all"
              : "Select all"}
          </button>
          <button
            disabled={!selected.size}
            onClick={() => remove([...selected])}
          >
            Delete selected ({selected.size})
          </button>
        </div>
      </div>
      <div className="runs">
        {visible.length ? (
          visible.map((r) => (
            <div className="run progress-run" key={r.id}>
              <input
                aria-label={`Select ${r.title}`}
                type="checkbox"
                disabled={!terminal(r)}
                checked={selected.has(r.id)}
                onChange={() =>
                  setSelected((s) => {
                    const next = new Set(s);
                    next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                    return next;
                  })
                }
              />
              <span className={`status ${r.status}`} />
              <div>
                <b>
                  {r.character
                    ? `${r.character.name} · ${r.character.realm} · ${r.character.spec}`
                    : r.title}
                </b>
                <small>{r.title}</small>
                <small>
                  {new Date(r.createdAt).toLocaleString()} ·{" "}
                  {r.summary || r.status}
                </small>
              </div>
              <strong>{r.status}</strong>
              {["queued", "running"].includes(r.status) ? (
                <div className="run-actions">
                  <button aria-label={`Track simulation progress for ${r.title}`} onClick={() => openResult(r.id)}>Track</button>
                  <button onClick={() => api(`/runs/${r.id}/cancel`, post({})).then(refreshRuns)}>Cancel</button>
                </div>
              ) : (
                <div className="run-actions">
                  <button onClick={() => openResult(r.id)}>View</button>
                  <button onClick={() => remove([r.id])}>Delete</button>
                </div>
              )}
            </div>
          ))
        ) : (
          <p>No matching simulations.</p>
        )}
      </div>
    </section>
  );
}
function ConsumableReference() {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Record<string, string>>({});
  return (
    <aside className="consumable-reference">
      <button onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Consumables"} · 12.1 max rank
      </button>
      {open && (
        <section>
          <p className="eyebrow">MANUAL SEASON 2 SOURCE</p>
          <h3>Consumables</h3>
          <p>Choose a reference option for each category.</p>
          {(["Food", "Flask", "Potion"] as const).map((type) => {
            const options = consumables.filter((entry) => entry.type === type),
              value = selected[type] || "";
            const current = options.find((entry) => entry.name === value);
            return (
              <label key={type}>
                {type}
                <select
                  value={value}
                  onChange={(event) =>
                    setSelected({ ...selected, [type]: event.target.value })
                  }
                >
                  <option value="">Auto / imported profile</option>
                  {options.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name} — {entry.function}
                    </option>
                  ))}
                </select>
                {current && <small>{current.effect}</small>}
              </label>
            );
          })}
          <small className="muted">
            Selections are a front-end reference until per-item SimC mappings
            are verified; current simulations retain their
            imported-profile/default consumables.
          </small>
        </section>
      )}
    </aside>
  );
}
function CharacterManager({
  characters,
  activate,
  refresh,
  notice,
}: {
  characters: Character[];
  activate: (profileId: number) => void;
  refresh: () => Promise<void>;
  notice: (message: string) => void;
}) {
  const remove = async (character: Character) => {
    if (
      !confirm(
        `Remove ${character.name} and its saved spec snapshots? Historical reports will be kept.`,
      )
    )
      return;
    try {
      await api(`/characters/${character.id}`, { method: "DELETE" });
      notice(`${character.name} was removed. Historical reports were kept.`);
      await refresh();
    } catch (e) {
      notice((e as Error).message);
    }
  };
  return (
    <section className="character-manager">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PERSISTED CHARACTERS</p>
          <h2>Saved character profiles</h2>
          <p>
            Each character keeps a current import for every saved
            specialization.
          </p>
        </div>
      </div>
      {characters.length ? (
        <div className="character-grid">
          {characters.map((c) => (
            <article className="character-card" key={c.id}>
              <div>
                <h3>{c.name}</h3>
                <p>{c.realm}</p>
              </div>
              <small>
                {c.runCount} historical run{c.runCount === 1 ? "" : "s"}
                {c.lastRunAt
                  ? ` · last ${new Date(c.lastRunAt).toLocaleDateString()}`
                  : ""}
              </small>
              <div className="spec-list">
                {c.specs.map((s) => (
                  <button key={s.id} onClick={() => activate(s.id)}>
                    <b>{s.spec}</b>
                    <small>
                      Updated {new Date(s.updatedAt).toLocaleDateString()}
                    </small>
                  </button>
                ))}
              </div>
              <button className="danger" onClick={() => remove(c)}>
                Delete saved character
              </button>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <h2>No saved characters</h2>
          <p>
            Import a character and choose “Save reusable character” to retain
            spec snapshots for future sims.
          </p>
        </section>
      )}
    </section>
  );
}
function CatalogStatusPage() {
  const [status, setStatus] = useState<any>(),
    [refresh, setRefresh] = useState<any>(),
    [captures, setCaptures] = useState<any>();
  const load = () =>
    Promise.all([
      api("/catalog/status"),
      api("/catalog/refresh-status"),
      api("/catalog/captures/status"),
    ]).then(([s, r, c]) => {
      setStatus(s);
      setRefresh(r);
      setCaptures(c);
    });
  useEffect(() => {
    load();
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, []);
  const h = status?.health,
    db2 = status?.db2Derived;
  return (
    <section className="catalog-page">
      <div className={`catalog-health ${h?.health || "loading"}`}>
        <p className="eyebrow">LOCAL CATALOG SNAPSHOT</p>
        <h2>{h?.health || "loading"} catalog</h2>
        <p>
          {h?.reason ||
            `Last successful refresh: ${h?.lastSuccessfulRefreshAt ? new Date(h.lastSuccessfulRefreshAt).toLocaleString() : "not yet recorded"}.`}
        </p>
        <div className="catalog-facts">
          <span>
            Age: {h?.ageDays === undefined ? "unknown" : `${h.ageDays} days`}
          </span>
          <span>
            Coverage: {h?.coverage?.verified || 0}/{h?.coverage?.total || 0}{" "}
            verified
          </span>
          <span>Version: {status?.version || "starter"}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="primary"
            disabled={!refresh?.configured || refresh?.status === "running"}
            onClick={() => api("/catalog/refresh", post({})).then(load)}
          >
            Refresh current season
          </button>
          <button
            className="secondary"
            onClick={() => api("/catalog/synthesize", post({})).then(r => {
              alert(`Synthesized ${r.synthesized} missing variants!`);
              load();
            })}
            title="Heuristically generate SimC strings for unverified dungeon drops based on verified items on the same track."
          >
            Synthesize Missing Variants
          </button>
        </div>
        {!refresh?.configured && (
          <small>Blizzard credentials are required for manual refresh.</small>
        )}
      </div>
      <div className="catalog-health-grid">
        <article>
          <h3>Refresh lifecycle</h3>
          <p>{refresh?.status || h?.lifecycle?.status || "idle"}</p>
          <small>
            Last attempt:{" "}
            {h?.lastAttemptAt
              ? new Date(h.lastAttemptAt).toLocaleString()
              : "never"}
          </small>
          {h?.lastError && <small className="failure">{h.lastError}</small>}
          {refresh?.progress && (
            <small>
              {refresh.progress.phase}: {refresh.progress.detail}
            </small>
          )}
        </article>
        <article>
          <h3>Local captures</h3>
          <p>
            {captures?.overlay?.records?.length || 0} stored capture records
          </p>
          <small>
            {status?.captures?.verified || 0} most recently applied variants
          </small>
          <small>
            {captures?.unresolved?.length || 0} unresolved mappings retained for
            review
          </small>
        </article>
        <article>
          <h3>DB2 metadata</h3>
          <p>
            {db2 ? `${db2.items?.toLocaleString()} items` : "Not installed"}
          </p>
          <small>
            {db2
              ? `Build ${db2.clientBuild} · ${new Date(db2.generatedAt).toLocaleDateString()}`
              : "Refresh the seasonal catalog, then install local metadata."}
          </small>
        </article>
      </div>
      <section className="panel catalog-coverage">
        <h3>Verified variant coverage</h3>
        {status?.variantCoverage?.length ? (
          status.variantCoverage.map((x: any) => (
            <div key={`${x.source}-${x.difficulty}`}>
              <b>{x.source}</b>
              <span>{x.difficulty}</span>
              <strong>
                {x.verified || 0}/{x.total}
              </strong>
            </div>
          ))
        ) : (
          <p>No current-season source data is installed yet.</p>
        )}
      </section>
    </section>
  );
}
function CatalogPage() {
  return (
    <>
      <CatalogStatusPage />
      <CatalogAddonControls />
    </>
  );
}
function CatalogAddonControls() {
  const [status, setStatus] = useState<any>(),
    [wowPath, setWowPath] = useState(""),
    [payload, setPayload] = useState(""),
    [message, setMessage] = useState("");
  const load = () =>
    api("/catalog/captures/status").then((value: any) => {
      setStatus(value);
      setWowPath(value.wowPath || "");
    });
  useEffect(() => {
    load();
  }, []);
  const configure = () =>
    api("/catalog/captures/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wowPath }),
    })
      .then((value: any) => {
        setMessage(`Watching ${value.config.savedVariablesPath}`);
        load();
      })
      .catch((e: Error) => setMessage(e.message));
  const importPayload = () =>
    api("/catalog/captures/import", post({ payload }))
      .then((value: any) => {
        setMessage(
          `Installed ${value.verified} verified capture variants${value.unresolved?.length ? `; ${value.unresolved.length} need review` : ""}.`,
        );
        setPayload("");
        load();
      })
      .catch((e: Error) => setMessage(e.message));
  return (
    <section className="panel addon-capture-controls">
      <p className="eyebrow">LIVE ADDON CAPTURES</p>
      <h2>Watch your LocalSimDashCatalog addon</h2>
      <p>
        Enter your World of Warcraft Retail folder. The location is saved
        locally and watched for SavedVariables updates after you scan and reload
        in game.
      </p>
      <label>
        Retail installation folder
        <input
          value={wowPath}
          onChange={(e) => setWowPath(e.target.value)}
          placeholder="C:\Program Files (x86)\World of Warcraft"
        />
      </label>
      <div className="buttons">
        <button onClick={configure} disabled={!wowPath.trim()}>
          Save path & enable watching
        </button>
      </div>
      <small>
        {status?.savedVariablesPath
          ? `Watching: ${status.savedVariablesPath}`
          : "No addon SavedVariables file is configured."}
      </small>
      <hr />
      <h3>Paste an addon export</h3>
      <p>
        Alternatively, run <code>/lsdexport</code> and paste the complete LSDC1
        value below.
      </p>
      <textarea
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        placeholder="LSDC1..."
      />
      <button
        className="primary"
        disabled={!payload.trim()}
        onClick={importPayload}
      >
        Import addon capture
      </button>
      {message && <p className="notice">{message}</p>}
      {status?.unresolved?.length ? (
        <p className="result-warnings">
          Unresolved captures: {status.unresolved.join(", ")}
        </p>
      ) : null}
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <ConsumableReference />
    <GlobalItemTooltip />
  </StrictMode>,
);
