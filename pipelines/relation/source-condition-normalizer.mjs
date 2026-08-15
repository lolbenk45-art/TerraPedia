function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => String(left).localeCompare(String(right)));
}

function pushIf(match, list, value) {
  if (match) list.push(value);
}

export function normalizeSourceConditionFields({
  conditions,
  notes,
  biomeCode,
  allowUpstreamBiomeCode = true
} = {}) {
  const textParts = [normalizeText(conditions), normalizeText(notes)].filter(Boolean);
  const sourceText = textParts.length > 0 ? textParts.join(' ') : null;
  const upstreamBiomeCode = allowUpstreamBiomeCode ? normalizeText(biomeCode) : null;

  if (!sourceText) {
    return {
      conditionSourceText: null,
      conditionParseStatus: upstreamBiomeCode ? 'source_fields_only' : 'no_condition_text',
      conditionBiomeCode: upstreamBiomeCode,
      conditionGamePeriodCode: null,
      conditionTimeCode: null,
      conditionWeatherCode: null,
      conditionEventsJson: null,
      specialFlagsJson: null
    };
  }

  const events = [];
  const specialFlags = [];
  const normalized = sourceText.toLowerCase();

  const textBiomeCode =
    (/snow biome|ice biome/.test(normalized) ? 'snow' : null)
    ?? (/jungle/.test(normalized) ? 'jungle' : null)
    ?? (/corruption/.test(normalized) ? 'corruption' : null)
    ?? (/crimson/.test(normalized) ? 'crimson' : null)
    ?? (/hallow/.test(normalized) ? 'hallow' : null)
    ?? (/desert/.test(normalized) ? 'desert' : null)
    ?? (/ocean/.test(normalized) ? 'ocean' : null)
    ?? (/forest/.test(normalized) ? 'forest' : null);

  const conditionBiomeCode = upstreamBiomeCode
    ?? (/snow biome|ice biome/.test(normalized) ? 'snow' : null)
    ?? (/jungle/.test(normalized) ? 'jungle' : null)
    ?? (/corruption/.test(normalized) ? 'corruption' : null)
    ?? (/crimson/.test(normalized) ? 'crimson' : null)
    ?? (/hallow/.test(normalized) ? 'hallow' : null)
    ?? (/desert/.test(normalized) ? 'desert' : null)
    ?? (/ocean/.test(normalized) ? 'ocean' : null)
    ?? (/forest/.test(normalized) ? 'forest' : null);

  const conditionGamePeriodCode =
    /\bpre-hardmode\b/.test(normalized)
      ? 'pre_hardmode'
      : (/(^|[^-])\bhardmode\b/.test(normalized) ? 'hardmode' : null);

  const conditionTimeCode =
    /\(\s*night\s*\)|\bnight\b/.test(normalized)
      ? 'night'
      : (/\bday\b|daytime/.test(normalized) ? 'day' : null);

  const conditionWeatherCode =
    /\bwindy day\b/.test(normalized)
      ? 'windy_day'
      : (/\brain\b/.test(normalized) ? 'rain' : null);

  pushIf(/\bblood moon\b/.test(normalized), events, 'blood_moon');
  pushIf(/\bsolar eclipse\b/.test(normalized), events, 'solar_eclipse');
  pushIf(/\bnew moon\b/.test(normalized), events, 'new_moon');
  pushIf(/\bwaning crescent\b/.test(normalized), events, 'waning_crescent');
  pushIf(/\bwaxing crescent\b/.test(normalized), events, 'waxing_crescent');
  pushIf(/\bfull moon\b/.test(normalized), events, 'full_moon');

  pushIf(/after plantera has been defeated|post-\s*plantera/.test(normalized), specialFlags, 'post_plantera');
  pushIf(/after completing 70%.*bestiary|\b70%\b.*bestiary/.test(normalized), specialFlags, 'bestiary_70_percent');
  pushIf(/mechanical bosses? has been defeated|one of the mechanical bosses has been defeated|any mechanical boss/.test(normalized), specialFlags, 'any_mech_boss_defeated');
  pushIf(/martian madness event has been defeated/.test(normalized), specialFlags, 'martian_madness_completed');

  const textSignals = [
    textBiomeCode,
    conditionGamePeriodCode,
    conditionTimeCode,
    conditionWeatherCode,
    ...events,
    ...specialFlags
  ].filter(Boolean);

  return {
    conditionSourceText: sourceText,
    conditionParseStatus: textSignals.length > 0 ? 'parsed' : 'unparsed',
    conditionBiomeCode,
    conditionGamePeriodCode,
    conditionTimeCode,
    conditionWeatherCode,
    conditionEventsJson: uniqueSorted(events).length > 0 ? JSON.stringify(uniqueSorted(events)) : null,
    specialFlagsJson: uniqueSorted(specialFlags).length > 0 ? JSON.stringify(uniqueSorted(specialFlags)) : null
  };
}
