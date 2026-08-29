export function buildLocalDbConnectionOptions({ config = {}, env = process.env } = {}) {
  const database = config?.database ?? {};
  return {
    host: firstText(env.TERRAPEDIA_DB_HOST, database.host, '127.0.0.1'),
    port: positiveInteger(env.TERRAPEDIA_DB_PORT, database.port, 13306),
    user: firstText(env.TERRAPEDIA_DB_USERNAME, database.username, 'root'),
    password: firstText(env.TERRAPEDIA_DB_PASSWORD, database.password, 'root')
  };
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function positiveInteger(...values) {
  for (const value of values) {
    const numericValue = Number(value);
    if (Number.isInteger(numericValue) && numericValue > 0) return numericValue;
  }
  return 13306;
}
