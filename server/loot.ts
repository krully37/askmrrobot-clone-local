export interface LootItem { id: number; name: string; slot: string; source: string; difficulty: string; }
export const lootCatalog = {
  version: '2026.08.14-starter',
  note: 'Starter catalog: replace this bundled file with the current season catalog package during updates.',
  sources: [
    { name: 'Example Raid', bosses: ['Example Boss'] },
    { name: 'Example Dungeon', bosses: ['Example Encounter'] }
  ],
  items: [] as LootItem[]
};
