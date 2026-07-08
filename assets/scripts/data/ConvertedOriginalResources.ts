import { BufferAsset, JsonAsset, resources, TextAsset } from 'cc';

export type ConvertedOriginalGroup = 'unityBundles' | 'balancy' | 'unityData' | 'configs' | 'archives';

export interface ConvertedOriginalEntry {
  id: string;
  group: ConvertedOriginalGroup;
  kind: string;
  name: string;
  originalExtension: string;
  cocosExtension: string;
  importType: 'BufferAsset' | 'JsonAsset' | 'TextAsset';
  sourcePath: string;
  outputPath: string;
  resourceLoadPath: string;
  bytes: number;
  sha256: string;
  container?: string;
  zipEntry?: string;
  note?: string;
}

export interface ConvertedOriginalManifest {
  version: number;
  generatedAt: string;
  cocosCreatorVersion: string;
  resources: {
    root: string;
    convertedRoot: string;
    masterManifestPath: string;
    masterManifestLoadPath: string;
  };
  totals: {
    entries: number;
    bytes: number;
  };
  entries: ConvertedOriginalEntry[];
}

const MANIFEST_PATH = 'data/cocos-converted-resource-manifest';

export async function loadConvertedOriginalManifest(): Promise<ConvertedOriginalManifest> {
  const asset = await loadJsonAsset(MANIFEST_PATH);
  return asset.json as unknown as ConvertedOriginalManifest;
}

export async function loadConvertedJson<T = unknown>(resourcePath: string): Promise<T> {
  const asset = await loadJsonAsset(resourcePath);
  return asset.json as T;
}

export async function loadConvertedText(resourcePath: string): Promise<string> {
  const asset = await new Promise<TextAsset>((resolve, reject) => {
    resources.load(resourcePath, TextAsset, (error, textAsset) => {
      if (error || !textAsset) {
        reject(error || new Error(`Failed to load text asset: ${resourcePath}`));
        return;
      }
      resolve(textAsset);
    });
  });
  return asset.text;
}

export async function loadConvertedBinary(resourcePath: string): Promise<ArrayBuffer> {
  const asset = await new Promise<BufferAsset>((resolve, reject) => {
    resources.load(resourcePath, BufferAsset, (error, bufferAsset) => {
      if (error || !bufferAsset) {
        reject(error || new Error(`Failed to load binary asset: ${resourcePath}`));
        return;
      }
      resolve(bufferAsset);
    });
  });
  return asset.buffer();
}

export function findConvertedEntries(
  manifest: ConvertedOriginalManifest,
  group: ConvertedOriginalGroup,
  kind?: string,
): ConvertedOriginalEntry[] {
  return manifest.entries.filter((entry) => entry.group === group && (!kind || entry.kind === kind));
}

async function loadJsonAsset(resourcePath: string): Promise<JsonAsset> {
  return new Promise<JsonAsset>((resolve, reject) => {
    resources.load(resourcePath, JsonAsset, (error, jsonAsset) => {
      if (error || !jsonAsset) {
        reject(error || new Error(`Failed to load json asset: ${resourcePath}`));
        return;
      }
      resolve(jsonAsset);
    });
  });
}
