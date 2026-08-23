import { useEffect, useState } from 'react';
import { OMNIUM_FOLIO_DPS_ROWS, OMNIUM_FOLIO_ROWS, omniumFolioVariants } from '../shared/omnium-folio';

export interface OmniumSpell { id: number; name: string; description: string; iconUrl: string; }

export function OmniumFolioPicker({ value, equipped, onChange }: { value: number[]; equipped: number[]; onChange: (val: number[]) => void }) {
  const [spells, setSpells] = useState<OmniumSpell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/catalog/spells', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: any) => { if (data.error) throw new Error(data.error); setSpells(data); setLoading(false); })
      .catch(() => { setError('Failed to load Omnium Folio data.'); setLoading(false); });
  }, []);

  const toggle = (talentId: number, rowIdx: number) => {
    const rowSpells = OMNIUM_FOLIO_ROWS[rowIdx];
    const selectedInRow = value.filter(id => rowSpells.some(rune => rune.talentId === id));
    if (!OMNIUM_FOLIO_DPS_ROWS.has(rowIdx)) {
      onChange([...value.filter(id => !rowSpells.some(rune => rune.talentId === id)), talentId]);
      return;
    }
    if (value.includes(talentId)) {
      if (selectedInRow.length === 1) return;
      onChange(value.filter(id => id !== talentId));
    } else onChange([...value, talentId]);
  };

  if (loading) return <div className="panel"><p>Loading Omnium Folio...</p></div>;
  if (error) return null;
  const variants = omniumFolioVariants(value);
  return <section className="panel omnium-folio-picker">
    <div className="panel-header">
      <div><h2>Omnium Folio</h2><p>Equipped powers are preselected. Select multiple options in DPS rows to compare legal Folio builds.</p></div>
      <span className="muted">{equipped.length} imported · {variants.length || 1} Folio variant{variants.length === 1 ? '' : 's'}</span>
    </div>
    <div className="folio-grid">
      {OMNIUM_FOLIO_ROWS.map((rowRunes, rowIdx) => <div key={rowIdx} className="folio-row">
        <span className="folio-row-label">Row {rowIdx + 1}{OMNIUM_FOLIO_DPS_ROWS.has(rowIdx) ? ' · DPS' : ''}</span>
        <div className="folio-options">
          {rowRunes.map(rune => {
            const spell = spells.find(s => s.id === rune.spellId), selected = value.includes(rune.talentId), isEquipped = equipped.includes(rune.talentId);
            return <button key={rune.talentId} type="button" className={`folio-node ${selected ? 'selected' : ''} ${isEquipped ? 'equipped' : ''}`} onClick={() => toggle(rune.talentId, rowIdx)} title={spell?.description || 'Omnium Folio power'} aria-pressed={selected}>
              {spell?.iconUrl ? <img src={spell.iconUrl} alt="" /> : <span className="folio-icon-placeholder" />}
              <span>{rune.name}</span>
              {isEquipped ? <small className="folio-state imported">Imported</small> : selected ? <small className="folio-state selected">Selected</small> : null}
            </button>;
          })}
        </div>
      </div>)}
    </div>
  </section>;
}
