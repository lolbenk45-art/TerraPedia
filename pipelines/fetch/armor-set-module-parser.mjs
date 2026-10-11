export function parseArmorSetBonuses(content) {
  const block = extractInitializeBody(content);
  const statements = splitStatements(block);
  const records = [];

  for (const statement of statements) {
    const parsed = parseArmorSetStatement(statement);
    if (parsed) records.push(parsed);
  }

  return records;
}

function extractInitializeBody(content) {
  const source = String(content ?? '');
  const marker = 'ArmorSetBonuses.Initialize = function()';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const bodyStart = start + marker.length;
  const end = source.indexOf('\nend', bodyStart);
  return end < 0 ? source.slice(bodyStart) : source.slice(bodyStart, end);
}

function splitStatements(block) {
  const statements = [];
  let current = '';
  let parenDepth = 0;
  let braceDepth = 0;
  let inString = false;

  for (let i = 0; i < block.length; i += 1) {
    const ch = block[i];
    const prev = i > 0 ? block[i - 1] : '';
    current += ch;

    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth -= 1;
    else if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth -= 1;

    if (ch === ';' && parenDepth === 0 && braceDepth === 0) {
      const text = current.trim();
      if (text.startsWith('ArmorSetBonuses.')) statements.push(text);
      current = '';
    }
  }

  return statements;
}

function parseArmorSetStatement(statement) {
  if (statement.startsWith('ArmorSetBonuses.Add(')) return parseAddStatement(statement);
  if (statement.startsWith('ArmorSetBonuses.Create(')) return parseCreateStatement(statement);
  return null;
}

function parseAddStatement(statement) {
  const args = extractCallArgs(statement, 'ArmorSetBonuses.Add(');
  if (args.length < 5 || args.length > 6) return null;
  const benefitExpression = cleanEffectRef(args[0]);
  const textKey = stripQuotes(args[1]);
  const primaryPart = args.length === 6 ? parsePrimaryPart(args[2]) : null;
  const offset = args.length === 6 ? 1 : 0;
  const set = [
    parseNumberArg(args[2 + offset]),
    parseNumberArg(args[3 + offset]),
    parseNumberArg(args[4 + offset])
  ];
  return buildRecord({ benefitExpression, textKey, primaryPart, sets: [set] });
}

function parseCreateStatement(statement) {
  const createArgs = extractCallArgs(statement, 'ArmorSetBonuses.Create(');
  if (createArgs.length < 2) return null;
  const benefitExpression = cleanEffectRef(createArgs[0]);
  const textKey = stripQuotes(createArgs[1]);
  const primaryPart = createArgs[2] ? parsePrimaryPart(createArgs[2]) : null;
  const sets = [];
  const setRegex = /:Set\(([\s\S]*?)\)/g;
  let match;
  while ((match = setRegex.exec(statement)) !== null) {
    const setArgs = splitTopLevelArgs(match[1]);
    if (setArgs.length !== 3) continue;
    const headOptions = parseSetArg(setArgs[0]);
    const bodyOptions = parseSetArg(setArgs[1]);
    const legsOptions = parseSetArg(setArgs[2]);
    for (const head of headOptions) {
      for (const body of bodyOptions) {
        for (const legs of legsOptions) sets.push([head, body, legs]);
      }
    }
  }
  return buildRecord({ benefitExpression, textKey, primaryPart, sets });
}

function buildRecord({ benefitExpression, textKey, primaryPart, sets }) {
  const normalizedSets = sets.map((set) => set.map((value) => Number.isFinite(value) ? value : 0));
  const uniqueItemIds = [...new Set(normalizedSets.flat().filter((value) => Number.isFinite(value)))];
  return { benefitExpression, primaryPart, setCount: normalizedSets.length, sets: normalizedSets, textKey, uniqueItemIds };
}

function extractCallArgs(statement, prefix) {
  const start = statement.indexOf(prefix);
  if (start < 0) return [];
  let cursor = start + prefix.length;
  let depth = 1;
  let content = '';
  let inString = false;
  while (cursor < statement.length) {
    const ch = statement[cursor];
    const prev = cursor > 0 ? statement[cursor - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      content += ch;
      cursor += 1;
      continue;
    }
    if (!inString) {
      if (ch === '(') depth += 1;
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    content += ch;
    cursor += 1;
  }
  return splitTopLevelArgs(content);
}

function splitTopLevelArgs(content) {
  const parts = [];
  let current = '';
  let parenDepth = 0;
  let braceDepth = 0;
  let inString = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const prev = i > 0 ? content[i - 1] : '';
    if (ch === '"' && prev !== '\\') {
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString) {
      if (ch === '(') parenDepth += 1;
      else if (ch === ')') parenDepth -= 1;
      else if (ch === '{') braceDepth += 1;
      else if (ch === '}') braceDepth -= 1;
      else if (ch === ',' && parenDepth === 0 && braceDepth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSetArg(arg) {
  const text = arg.trim();
  if (text.startsWith('{') && text.endsWith('}')) {
    return splitTopLevelArgs(text.slice(1, -1)).map(parseNumberArg).filter((value) => value != null);
  }
  const value = parseNumberArg(text);
  return value == null ? [0] : [value];
}

function parseNumberArg(arg) {
  const text = String(arg).trim();
  if (text === '' || text === 'nil') return 0;
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function parsePrimaryPart(arg) {
  const text = String(arg).trim();
  if (text.endsWith('.Head')) return 'Head';
  if (text.endsWith('.Body')) return 'Body';
  if (text.endsWith('.Legs')) return 'Legs';
  return null;
}

function cleanEffectRef(arg) {
  return String(arg).trim();
}

function stripQuotes(arg) {
  return String(arg).trim().replace(/^"/, '').replace(/"$/, '');
}
