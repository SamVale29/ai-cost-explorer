import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(projectRoot, 'promo');
const outputPath = join(outputDir, 'ai-cost-explorer-promo-x.mp4');
const renderDir = await mkdtemp(join(tmpdir(), 'ai-cost-explorer-promo-'));
const ffmpegPath =
  process.env.FFMPEG_PATH ??
  join(tmpdir(), 'ai-cost-explorer-video-tools', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const calculatorScreenshot =
  process.env.PROMO_CALCULATOR_SCREENSHOT ??
  join(tmpdir(), 'ai-cost-explorer-promo-assets', 'calculator-screenshot.png');

const WIDTH = 1280;
const HEIGHT = 720;
const FONT = 'Arial, Helvetica, sans-serif';

const paths = {
  social: join(projectRoot, 'public', 'brand', 'social-preview.png'),
  landing: join(projectRoot, 'public', 'brand', 'landing-screenshot.png'),
  explorer: join(projectRoot, 'public', 'brand', 'explorer-screenshot.png'),
  calculator: calculatorScreenshot,
};

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function text(x, y, value, size, color, weight = 400, extra = '') {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${FONT}" font-size="${size}px" font-weight="${weight}" ${extra}>${escapeXml(value)}</text>`;
}

function svgCanvas(width, height, body) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
}

function baseSvg(body) {
  return svgCanvas(
    WIDTH,
    HEIGHT,
    `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#080d1c" />
        <stop offset="1" stop-color="#0d1b2b" />
      </linearGradient>
      <linearGradient id="mint" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#58e5b1" />
        <stop offset="1" stop-color="#37c997" />
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000000" flood-opacity="0.35" />
      </filter>
    </defs>
    <rect width="1280" height="720" fill="url(#bg)" />
    ${body}
  `,
  );
}

function frame(x, y, width, height) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="#0b1322" stroke="#2a3a55" stroke-width="2" filter="url(#shadow)" />`;
}

async function roundedImage(source, width, height, crop) {
  let pipeline = sharp(source);
  if (crop) pipeline = pipeline.extract(crop);
  const resized = await pipeline
    .resize(width, height, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer();
  const mask = svgCanvas(
    width,
    height,
    `<rect width="${width}" height="${height}" rx="18" fill="#ffffff" />`,
  );
  return sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function writeScene(path, background, layers = []) {
  await sharp(background).composite(layers).png().toFile(path);
}

async function renderHero(path) {
  const image = await sharp(paths.social)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
  const overlay = svgCanvas(
    WIDTH,
    HEIGHT,
    `
    <defs>
      <linearGradient id="heroShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.55" stop-color="#080d1c" stop-opacity="0" />
        <stop offset="1" stop-color="#080d1c" stop-opacity="0.84" />
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#heroShade)" />
    ${text(76, 650, 'OPEN-SOURCE AI API DECISIONS', 16, '#58e5b1', 700, 'letter-spacing="4"')}
    ${text(1204, 650, 'samvale29.github.io/ai-cost-explorer', 15, '#d8e0ee', 500, 'text-anchor="end"')}
  `,
  );
  await writeScene(path, image, [{ input: overlay }]);
}

async function renderCatalog(path) {
  const shotX = 454;
  const shotY = 52;
  const shotWidth = 754;
  const shotHeight = 606;
  const shot = await roundedImage(paths.landing, shotWidth, shotHeight, {
    left: 0,
    top: 0,
    width: 1440,
    height: 1040,
  });
  const background = baseSvg(`
    <circle cx="1120" cy="40" r="310" fill="#12344b" opacity="0.33" />
    <circle cx="1170" cy="690" r="240" fill="#0d4e48" opacity="0.23" />
    ${text(72, 105, 'THE CATALOG', 16, '#58e5b1', 700, 'letter-spacing="4"')}
    ${text(72, 158, 'See the market', 40, '#f5f7fb', 700)}
    ${text(72, 207, 'before you choose.', 40, '#f5f7fb', 700)}
    ${text(72, 268, 'A sharper starting point than a price list.', 20, '#a9b6ca', 400)}
    ${text(72, 335, '48 curated offers', 25, '#58e5b1', 700)}
    ${text(72, 365, 'across 9 direct API providers', 17, '#d8e0ee', 500)}
    ${text(72, 425, '22 official sources', 25, '#f6b94b', 700)}
    ${text(72, 455, 'linked at field level', 17, '#d8e0ee', 500)}
    ${text(72, 535, 'Prices, context, capabilities and status.', 16, '#8090a9', 400)}
    ${text(72, 562, 'Transparent by design.', 16, '#8090a9', 400)}
    ${frame(shotX, shotY, shotWidth, shotHeight)}
  `);
  const border = svgCanvas(
    WIDTH,
    HEIGHT,
    `<rect x="${shotX}" y="${shotY}" width="${shotWidth}" height="${shotHeight}" rx="20" fill="none" stroke="#2a3a55" stroke-width="2" />`,
  );
  await writeScene(path, background, [{ input: shot, left: shotX, top: shotY }, { input: border }]);
}

async function renderExplorer(path) {
  const shotX = 448;
  const shotY = 44;
  const shotWidth = 760;
  const shotHeight = 624;
  const shot = await roundedImage(paths.explorer, shotWidth, shotHeight, {
    left: 0,
    top: 0,
    width: 1612,
    height: 1180,
  });
  const background = baseSvg(`
    <circle cx="80" cy="690" r="265" fill="#0d4e48" opacity="0.23" />
    <circle cx="1200" cy="130" r="270" fill="#12344b" opacity="0.28" />
    ${text(72, 105, 'MODEL EXPLORER', 16, '#58e5b1', 700, 'letter-spacing="4"')}
    ${text(72, 158, 'Filter the noise.', 40, '#f5f7fb', 700)}
    ${text(72, 207, 'Compare options.', 40, '#f5f7fb', 700)}
    ${text(72, 268, 'Search offers side by side.', 20, '#a9b6ca', 400)}
    ${text(72, 337, 'INPUT / CACHE / OUTPUT', 15, '#58e5b1', 700, 'letter-spacing="2"')}
    ${text(72, 370, 'Context windows', 22, '#f5f7fb', 600)}
    ${text(72, 405, 'Capabilities', 22, '#f5f7fb', 600)}
    ${text(72, 440, 'Freshness and provenance', 22, '#f5f7fb', 600)}
    ${text(72, 538, 'Unknown stays unknown.', 18, '#f6b94b', 700)}
    ${text(72, 568, 'No invented certainty.', 16, '#8090a9', 400)}
    ${frame(shotX, shotY, shotWidth, shotHeight)}
  `);
  const border = svgCanvas(
    WIDTH,
    HEIGHT,
    `<rect x="${shotX}" y="${shotY}" width="${shotWidth}" height="${shotHeight}" rx="20" fill="none" stroke="#2a3a55" stroke-width="2" />`,
  );
  await writeScene(path, background, [{ input: shot, left: shotX, top: shotY }, { input: border }]);
}

async function renderCalculator(path) {
  const shotX = 452;
  const shotY = 42;
  const shotWidth = 756;
  const shotHeight = 630;
  const shot = await roundedImage(paths.calculator, shotWidth, shotHeight, {
    left: 0,
    top: 0,
    width: 1440,
    height: 1450,
  });
  const background = baseSvg(`
    <circle cx="1110" cy="700" r="270" fill="#0d4e48" opacity="0.24" />
    <circle cx="100" cy="20" r="260" fill="#12344b" opacity="0.26" />
    ${text(72, 105, 'COST SIMULATOR', 16, '#58e5b1', 700, 'letter-spacing="4"')}
    ${text(72, 158, 'Model the workload', 38, '#f5f7fb', 700)}
    ${text(72, 207, 'before the bill.', 38, '#f5f7fb', 700)}
    ${text(72, 268, 'Cache, retries, batch and context tiers.', 19, '#a9b6ca', 400)}
    ${text(72, 350, 'SAVE SCENARIOS', 15, '#58e5b1', 700, 'letter-spacing="2"')}
    ${text(72, 384, 'Shareable calculator links', 22, '#f5f7fb', 600)}
    ${text(72, 427, 'JSON import / export', 22, '#f5f7fb', 600)}
    ${text(72, 470, 'No provider request required', 22, '#f5f7fb', 600)}
    ${text(72, 565, 'Turn assumptions into a decision.', 17, '#8090a9', 400)}
    ${frame(shotX, shotY, shotWidth, shotHeight)}
  `);
  const border = svgCanvas(
    WIDTH,
    HEIGHT,
    `<rect x="${shotX}" y="${shotY}" width="${shotWidth}" height="${shotHeight}" rx="20" fill="none" stroke="#2a3a55" stroke-width="2" />`,
  );
  await writeScene(path, background, [{ input: shot, left: shotX, top: shotY }, { input: border }]);
}

async function renderEnd(path) {
  const background = baseSvg(`
    <circle cx="1110" cy="70" r="300" fill="#12344b" opacity="0.46" />
    <circle cx="1120" cy="650" r="270" fill="#0d4e48" opacity="0.38" />
    <circle cx="160" cy="620" r="220" fill="#0f1d34" opacity="0.9" />
    <rect x="76" y="83" width="54" height="54" rx="16" fill="#10283a" stroke="#2a876e" stroke-width="2" />
    <rect x="93" y="98" width="20" height="4" rx="2" fill="#58e5b1" />
    <rect x="93" y="108" width="14" height="4" rx="2" fill="#58e5b1" />
    <rect x="93" y="118" width="8" height="4" rx="2" fill="#58e5b1" />
    ${text(76, 215, 'AI COST EXPLORER', 20, '#58e5b1', 700, 'letter-spacing="6"')}
    ${text(76, 295, 'Open source.', 58, '#f5f7fb', 700)}
    ${text(76, 360, 'Transparent by design.', 58, '#f5f7fb', 700)}
    ${text(78, 427, 'Choose the right AI model before the bill arrives.', 21, '#a9b6ca', 400)}
    <rect x="76" y="514" width="520" height="62" rx="14" fill="#101a2d" stroke="#2a3a55" stroke-width="2" />
    ${text(104, 553, 'samvale29.github.io/ai-cost-explorer', 21, '#58e5b1', 600)}
    ${text(76, 652, 'Built by Sam Vale  ·  MIT licensed  ·  Independent project', 16, '#8090a9', 500)}
  `);
  await writeScene(path, background);
}

async function renderVideo() {
  await mkdir(outputDir, { recursive: true });
  const scenePaths = [
    join(renderDir, '01-hero.png'),
    join(renderDir, '02-catalog.png'),
    join(renderDir, '03-explorer.png'),
    join(renderDir, '04-calculator.png'),
    join(renderDir, '05-end.png'),
  ];
  await renderHero(scenePaths[0]);
  await renderCatalog(scenePaths[1]);
  await renderExplorer(scenePaths[2]);
  await renderCalculator(scenePaths[3]);
  await renderEnd(scenePaths[4]);

  const durations = [4.5, 5, 5, 5, 4.5];
  const args = ['-y'];
  for (let index = 0; index < scenePaths.length; index += 1) {
    args.push(
      '-loop',
      '1',
      '-framerate',
      '30',
      '-t',
      String(durations[index]),
      '-i',
      scenePaths[index],
    );
  }
  const offsets = [3.9, 8.3, 12.7, 17.1];
  const filters = [];
  for (let index = 0; index < scenePaths.length; index += 1) {
    filters.push(
      `[${index}:v]zoompan=z='min(1.0+on*0.00035,1.045)':d=1:s=${WIDTH}x${HEIGHT}:fps=30,setsar=1[v${index}]`,
    );
  }
  filters.push(`[v0][v1]xfade=transition=fade:duration=0.6:offset=${offsets[0]}[x1]`);
  filters.push(`[x1][v2]xfade=transition=fade:duration=0.6:offset=${offsets[1]}[x2]`);
  filters.push(`[x2][v3]xfade=transition=fade:duration=0.6:offset=${offsets[2]}[x3]`);
  filters.push(`[x3][v4]xfade=transition=fade:duration=0.6:offset=${offsets[3]}[video]`);
  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[video]',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  );
  await execFileAsync(ffmpegPath, args, { maxBuffer: 10 * 1024 * 1024 });
  console.log(outputPath);
}

try {
  await renderVideo();
} finally {
  await rm(renderDir, { recursive: true, force: true });
}
