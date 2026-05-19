#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CONFIG = 'scripts/tooling/image-2/xlab.json';
const DEFAULT_OUTPUT_DIR = 'scripts/tooling/image-2/generated';
const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_TIMEOUT_MS = 180000;

function usage() {
  return `Usage: node scripts/tooling/image-2/generate-image.mjs --prompt "<prompt>" [options]

Options:
  --config <path>           JSON config path. Default: ${DEFAULT_CONFIG}
  --output-dir <path>       Directory for generated PNG files. Default: ${DEFAULT_OUTPUT_DIR}
  --filename-prefix <text>  Output filename prefix. Default: prompt-derived slug
  --model <name>            Image model. Default: ${DEFAULT_MODEL}
  --timeout-ms <number>     Request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --quiet-json              Print compact JSON summary
  --help                    Show this help
`;
}

function parseArgs(argv) {
  const options = {
    config: DEFAULT_CONFIG,
    outputDir: DEFAULT_OUTPUT_DIR,
    model: DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    quietJson: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === '--help') {
      options.help = true;
    } else if (arg === '--prompt') {
      options.prompt = readValue();
    } else if (arg === '--config') {
      options.config = readValue();
    } else if (arg === '--output-dir') {
      options.outputDir = readValue();
    } else if (arg === '--filename-prefix') {
      options.filenamePrefix = readValue();
    } else if (arg === '--model') {
      options.model = readValue();
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(readValue());
    } else if (arg === '--quiet-json') {
      options.quietJson = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.help && !options.prompt) {
    throw new Error('Missing required --prompt');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number');
  }

  return options;
}

function endpointFromBase(baseURL) {
  const trimmed = String(baseURL || '').trim();
  if (!trimmed) {
    throw new Error('Config is missing baseURL');
  }

  const url = new URL(trimmed);
  const normalizedPath = url.pathname.replace(/\/+$/, '');
  if (!normalizedPath.endsWith('/images/generations')) {
    url.pathname = `${normalizedPath || ''}/images/generations`;
  }
  return url;
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'generated-image';
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function readConfig(configPath) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw new Error(`Could not read config file: ${configPath}`);
  }

  const apiKey = String(parsed.apikey || '').trim();
  if (!apiKey) {
    throw new Error('Config is missing apikey');
  }

  return {
    endpoint: endpointFromBase(parsed.baseURL),
    apiKey,
  };
}

async function requestImage({ endpoint, apiKey, model, prompt, timeoutMs }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      response_format: 'b64_json',
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  if (!response.ok) {
    let detail = '';
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error?.message || parsed?.message || '';
    } catch {}
    throw new Error(`Image generation request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Image generation response was not JSON');
  }

  const b64 = parsed?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== 'string') {
    throw new Error('Image generation response did not include data[0].b64_json');
  }
  return Buffer.from(b64, 'base64');
}

async function saveImage({ imageBuffer, outputDir, filenamePrefix }) {
  await fs.mkdir(outputDir, { recursive: true });
  const output = path.join(outputDir, `${slugify(filenamePrefix)}-${timestamp()}.png`);
  await fs.writeFile(output, imageBuffer);
  return output;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const { endpoint, apiKey } = await readConfig(options.config);
  const imageBuffer = await requestImage({
    endpoint,
    apiKey,
    model: options.model,
    prompt: options.prompt,
    timeoutMs: options.timeoutMs,
  });
  const output = await saveImage({
    imageBuffer,
    outputDir: options.outputDir,
    filenamePrefix: options.filenamePrefix || options.prompt,
  });

  const summary = {
    ok: true,
    model: options.model,
    prompt: options.prompt,
    output,
    bytes: imageBuffer.length,
  };

  process.stdout.write(`${JSON.stringify(summary, null, options.quietJson ? 0 : 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
