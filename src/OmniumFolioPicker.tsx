import { useEffect, useState } from 'react';

export interface OmniumSpell { id: number; name: string; description: string; iconUrl: string; }

const layout = [
  ['Void-Touched Orbs', 'Unleashed Fire'],
  ['Self-Mending', 'Void-Tainted Shell', 'Lynxlike Reflexes'],
  ['Lingering'],
  ['Critical Power', 'Burning Haste', 'Masterful Cunning', 'The Versatile Warrior'],
  ['Overload', 'Residual Energy', 'Echoes']
];

export function OmniumFolioPicker({ value, onChange }: { value: string[], onChange: (val: string[]) => void }) {
  const [spells, setSpells] = useState<OmniumSpell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/catalog/spells', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) throw new Error(data.error);
        setSpells(data);
        setLoading(false);
      })
      .catch((e: any) => {
        console.error('Failed to load Omnium Folio spells', e);
        setError('Failed to load Omnium Folio data.');
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="panel"><p>Loading Omnium Folio...</p></div>;
  if (error) return null;

  const toggle = (spellName: string, rowIdx: number) => {
    const rowSpells = layout[rowIdx];
    let next = [...value].filter(v => !rowSpells.includes(v)); // remove any selected in this row
    if (!value.includes(spellName)) {
      next.push(spellName); // select the new one if it wasn't selected
    }
    onChange(next);
  };

  return (
    <section className="panel omnium-folio-picker">
      <div className="panel-header">
        <h2>Omnium Folio</h2>
        <span className="muted">{value.length} selected</span>
      </div>
      <div className="folio-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
        {layout.map((rowNames, rowIdx) => (
          <div key={rowIdx} className="folio-row" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span className="muted" style={{ width: '45px', fontSize: '0.9rem' }}>Row {rowIdx + 1}</span>
            {rowNames.map(name => {
              const spell = spells.find(s => s.name === name);
              const isSelected = value.includes(name);
              return (
                <div 
                  key={name}
                  className={`folio-node ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggle(name, rowIdx)}
                  title={spell?.description}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 12px', borderRadius: '4px',
                    border: `1px solid ${isSelected ? 'var(--primary, #d4a017)' : '#333'}`,
                    backgroundColor: isSelected ? 'rgba(212, 160, 23, 0.1)' : '#1a1a1a',
                    cursor: 'pointer', opacity: spell ? 1 : 0.5,
                    minWidth: '180px'
                  }}
                >
                  {spell?.iconUrl ? <img src={spell.iconUrl} alt={name} style={{ width: '24px', height: '24px', borderRadius: '4px' }} /> : <div style={{ width: '24px', height: '24px', background: '#333', borderRadius: '4px' }} />}
                  <span style={{ fontSize: '0.9rem' }}>{name}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
