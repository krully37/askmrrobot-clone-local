import { useState, useMemo } from 'react';
import './styles.css';

interface AdvisorProps {
  profileId?: number;
  setNotice: (notice: string) => void;
  queueRun: (run: any) => void;
  setResultId: (id: number) => void;
  setPage: (page: string) => void;
  refreshRuns: () => Promise<any>;
}

export function Advisor({ profileId, setNotice, queueRun, setResultId, setPage, refreshRuns }: AdvisorProps) {
  const [crests, setCrests] = useState({ adventurer: 0, veteran: 0, champion: 0, hero: 0, myth: 0 });
  const [sparks, setSparks] = useState(0);
  const [discounts, setDiscounts] = useState<Record<string, boolean>>({});
  const [tuning, setTuning] = useState<'raw-ilvl' | 'power' | 'crest-efficiency'>('raw-ilvl');
  const [advancedMode, setAdvancedMode] = useState(false);
  const [watermarks, setWatermarks] = useState('');
  
  const slots = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'main_hand', 'off_hand'];

  const toggleDiscount = (slot: string) => {
    setDiscounts(prev => ({ ...prev, [slot]: !prev[slot] }));
  };

  const handleRun = async () => {
    if (!profileId) {
      setNotice('Import or select a character before running the Advisor.');
      return;
    }

    let finalDiscounts = discounts;
    if (advancedMode) {
      try {
        const parsed = JSON.parse(watermarks);
        // Convert array/object into our expected boolean record format
        // assuming they enter something like {"head": true} or just an object of ilvls
        // We will just treat any truthy value as a discount
        finalDiscounts = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v) finalDiscounts[k] = true;
        }
      } catch (e) {
        setNotice('Invalid JSON for watermarks. Ensure you are using valid JSON format (e.g. {"head": true}).');
        return;
      }
    }

    try {
      const response = await fetch('/api/advisor/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          crests,
          sparks,
          discounts: finalDiscounts,
          tuning,
          threads: 1 // Default to 1 thread for now, or use ComputePower in future
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      queueRun(data.run);
      setResultId(data.id);
      setNotice(`Advisor #${data.id} queued (${data.planned.toLocaleString()} permutations generated).`);
      setPage('result');
      await refreshRuns();
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  return (
    <section className="panel">
      <p className="eyebrow">EQUIPMENT UPGRADE ADVISOR</p>
      <h2>Upgrade Advisor</h2>
      <p>Enter your available crests and sparks to find the best upgrade permutations for your current gear.</p>

      <div className="grid two">
        <div className="card">
          <h3>Currency</h3>
          <label>Sparks<input type="number" min="0" max="90" value={sparks} onChange={e => setSparks(Math.max(0, Math.min(90, +e.target.value)))} /></label>
          <label>Adventurer Crests<input type="number" min="0" max="90" value={crests.adventurer} onChange={e => setCrests({ ...crests, adventurer: Math.max(0, Math.min(90, +e.target.value)) })} /></label>
          <label>Veteran Crests<input type="number" min="0" max="90" value={crests.veteran} onChange={e => setCrests({ ...crests, veteran: Math.max(0, Math.min(90, +e.target.value)) })} /></label>
          <label>Champion Crests<input type="number" min="0" max="90" value={crests.champion} onChange={e => setCrests({ ...crests, champion: Math.max(0, Math.min(90, +e.target.value)) })} /></label>
          <label>Hero Crests<input type="number" min="0" max="90" value={crests.hero} onChange={e => setCrests({ ...crests, hero: Math.max(0, Math.min(90, +e.target.value)) })} /></label>
          <label>Myth Crests<input type="number" min="0" max="90" value={crests.myth} onChange={e => setCrests({ ...crests, myth: Math.max(0, Math.min(90, +e.target.value)) })} /></label>
        </div>

        <div className="card">
          <h3>Strategy</h3>
          <label>Tuning Knob
            <select value={tuning} onChange={e => setTuning(e.target.value as any)}>
              <option value="raw-ilvl">Raw Item Level (Max ilvl)</option>
              <option value="power">Power (Max DPS, ignore efficiency)</option>
              <option value="crest-efficiency">Crest Efficiency (DPS per crest)</option>
            </select>
          </label>

          <h3>Discounts</h3>
          <label className="checkline">
            <input type="checkbox" checked={advancedMode} onChange={e => setAdvancedMode(e.target.checked)} />
            Advanced watermark entry
          </label>
          
          {advancedMode ? (
            <label>
              Watermarks (JSON array)
              <textarea value={watermarks} onChange={e => setWatermarks(e.target.value)} placeholder='{"head": 620, "chest": 610}' />
            </label>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {slots.map(slot => (
                <label key={slot} className="checkline">
                  <input type="checkbox" checked={discounts[slot] || false} onChange={() => toggleDiscount(slot)} />
                  {slot.replace('_', ' ')}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="buttons" style={{ marginTop: '1rem' }}>
        <button className="primary" onClick={handleRun}>Run Advisor</button>
      </div>
    </section>
  );
}
