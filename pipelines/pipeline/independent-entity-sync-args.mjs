const SUPPORTED_ENTITIES = ['buffs', 'projectiles', 'armor_sets', 'npcs'];
const DEFAULT_ENTITIES = ['buffs', 'projectiles', 'armor_sets'];

export function buildIndependentEntityFetchArgs(entity) {
  const entities = entity == null ? DEFAULT_ENTITIES : resolveEntities(entity);
  return [
    '--mode=apply',
    `--entity=${entities.join(',')}`
  ];
}

export function buildIndependentEntityImportArgs(options = {}) {
  const args = [];
  if (options.entity != null) args.push(`--entity=${resolveEntities(options.entity).join(',')}`);
  if (!isTrue(options.apply)) args.push('--dry-run=true');
  return args;
}

export function resolveEntities(value) {
  if (value == null) return SUPPORTED_ENTITIES;
  const raw = String(value).split(',');
  const entities = [...new Set(raw.map((item) => item.trim()).filter(Boolean))];
  if (!entities.length || entities.some((entity) => !SUPPORTED_ENTITIES.includes(entity))) {
    throw new Error(`Unsupported independent entity selection: ${value}`);
  }
  return entities;
}

function isTrue(value) {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}
