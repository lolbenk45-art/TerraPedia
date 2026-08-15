export const ITEM_GROUP_SOURCE_LAYERS = Object.freeze([
  'recipe_reference',
  'source_group',
  'central_override',
]);

export const ITEM_GROUP_SOURCE_PRIORITIES = Object.freeze({
  recipe_reference: 100,
  source_group: 300,
  central_override: 400,
});

export const ITEM_GROUP_ALLOWED_LAYERS = Object.freeze({
  admin_item_groups: ITEM_GROUP_SOURCE_LAYERS,
  admin_recipe_groups: Object.freeze(['recipe_reference', 'central_override']),
  recipe_tree: ITEM_GROUP_SOURCE_LAYERS,
  recipe_expansion: Object.freeze(['recipe_reference']),
  npc_shop: Object.freeze(['source_group', 'central_override']),
  shimmer: Object.freeze(['source_group', 'central_override']),
});

export function validateItemGroupSourceLayer(value) {
  return ITEM_GROUP_SOURCE_LAYERS.includes(String(value ?? '').trim());
}

export function sourcePriorityForLayer(value) {
  const layer = String(value ?? '').trim();
  if (!validateItemGroupSourceLayer(layer)) {
    throw new Error(`Unknown item group source layer: ${layer || '<empty>'}`);
  }
  return ITEM_GROUP_SOURCE_PRIORITIES[layer];
}
