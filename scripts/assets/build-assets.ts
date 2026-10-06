/**
 * Pipeline de assets — Fase V1 (PRD v2 §4.3).
 * Valida o manifesto declarativo: existência dos ficheiros, créditos (D-02)
 * e budgets de tamanho (D-01: ≤ 120 MB total; ≤ 40 MB no primeiro frame).
 * Uso: bun scripts/assets/build-assets.ts  (a partir da raiz do projeto)
 * Sai com código 1 se qualquer gate falhar.
 */
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

interface ManifestAsset {
  id: string;
  type: string;
  path: string;
  files?: string[];
  source: string;
  license: string;
  priority: "P0" | "P1";
  /** Ponteiro lovable-assets (.asset.json) para asset externo ao repo. */
  assetJson?: string;
}

interface Manifest {
  budgetTotalMB: number;
  budgetFirstFrameMB: number;
  assets: ManifestAsset[];
}

const root = process.cwd();
const manifestPath = join(root, "scripts", "assets", "manifest.json");
const creditsPath = join(root, "public", "game-assets", "CREDITS.md");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
const credits = existsSync(creditsPath) ? readFileSync(creditsPath, "utf8") : "";

function sizeOf(asset: ManifestAsset): number {
  // Asset externo via lovable-assets: o binário fica fora do repositório e o
  // ponteiro .asset.json guarda o tamanho original.
  if (asset.assetJson) {
    const pointer = JSON.parse(readFileSync(join(root, asset.assetJson), "utf8")) as {
      size?: number;
    };
    if (!pointer.size) throw new Error(`Ponteiro sem "size": ${asset.assetJson}`);
    return pointer.size;
  }
  const stat = statSync(join(root, asset.path));
  if (stat.isFile()) return stat.size;
  const files = asset.files ?? [];
  if (files.length === 0) throw new Error(`Pasta ${asset.path} sem "files" no manifesto`);
  return files.reduce((sum, f) => {
    const p = join(root, asset.path, f);
    if (!existsSync(p)) throw new Error(`Ficheiro em falta: ${p}`);
    return sum + statSync(p).size;
  }, 0);
}

const MB = 1024 * 1024;
const report: Array<{ id: string; mb: number; priority: string; ok: boolean }> = [];
let firstFrameBytes = 0;
let totalBytes = 0;
let failed = false;

for (const asset of manifest.assets) {
  try {
    const bytes = sizeOf(asset);
    totalBytes += bytes;
    if (asset.priority === "P0") firstFrameBytes += bytes;
    // D-02: créditos obrigatórios para assets externos CC0/CC-BY
    const needsCredit = asset.license === "CC0" || asset.license.startsWith("CC-BY");
    if (needsCredit && !credits.includes(asset.source)) {
      throw new Error(`Sem entrada em CREDITS.md para ${asset.source} (${asset.id})`);
    }
    report.push({ id: asset.id, mb: +(bytes / MB).toFixed(2), priority: asset.priority, ok: true });
  } catch (err) {
    failed = true;
    report.push({
      id: asset.id,
      mb: 0,
      priority: asset.priority,
      ok: false,
    });
    console.error(`[assets] ${asset.id}: ${(err as Error).message}`);
  }
}

const totalMB = +(totalBytes / MB).toFixed(2);
const firstFrameMB = +(firstFrameBytes / MB).toFixed(2);

if (totalMB > manifest.budgetTotalMB) {
  console.error(`[assets] Budget total excedido: ${totalMB} MB > ${manifest.budgetTotalMB} MB`);
  failed = true;
}
if (firstFrameMB > manifest.budgetFirstFrameMB) {
  console.error(
    `[assets] Budget do primeiro frame excedido: ${firstFrameMB} MB > ${manifest.budgetFirstFrameMB} MB`,
  );
  failed = true;
}

mkdirSync(join(root, "scripts", "assets"), { recursive: true });
writeFileSync(
  join(root, "scripts", "assets", "report.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalMB,
      firstFrameMB,
      budgetTotalMB: manifest.budgetTotalMB,
      budgetFirstFrameMB: manifest.budgetFirstFrameMB,
      assets: report,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `[assets] total ${totalMB} MB / ${manifest.budgetTotalMB} MB · primeiro frame ${firstFrameMB} MB / ${manifest.budgetFirstFrameMB} MB`,
);
process.exit(failed ? 1 : 0);
