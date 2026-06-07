// si-runtime-js — Capability Scanner
// Parses CAPABILITY.toml manifests and discovers integrations

import type { CapabilityManifest, IntegrationSuggestion } from './types';

/** Simplified TOML parser — handles [section], key = value, arrays, inline tables */
function parseSimpleToml(toml: string): Record<string, any> {
  const result: Record<string, any> = {};
  let currentObj: Record<string, any> = result;

  for (const rawLine of toml.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Section header
    const sectionMatch = line.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      result[sectionMatch[1]] = {};
      currentObj = result[sectionMatch[1]];
      continue;
    }

    // Key = value
    const kvMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value: any = kvMatch[2].trim();

      // Inline table: { key = "val", key2 = "val2" }
      if (value.startsWith('{') && value.endsWith('}')) {
        const inner = value.slice(1, -1);
        const obj: Record<string, string> = {};
        for (const pair of inner.split(',')) {
          const trimmed = pair.trim();
          const pm = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
          if (pm) {
            obj[pm[1]] = pm[2];
          }
        }
        value = obj;
      }
      // Array: ["a", "b"]
      else if (value.startsWith('[')) {
        value = value
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((s: string) => s.trim().replace(/^"|"$/g, ''))
          .filter(Boolean);
      } else if (value.startsWith('"')) {
        value = value.replace(/^"|"$/g, '');
      } else if (!isNaN(Number(value))) {
        value = Number(value);
      }
      currentObj[key] = value;
    }
  }
  return result;
}

export class CapabilityScanner {
  /** Parse a CAPABILITY.toml string into a manifest */
  parse(tomlString: string): CapabilityManifest {
    const data = parseSimpleToml(tomlString);
    const caps = data.capability || data;

    return {
      name: caps.name ?? '',
      layer: caps.layer ?? '',
      provides: Array.isArray(caps.provides) ? caps.provides : [],
      requires: Array.isArray(caps.requires) ? caps.requires : [],
      integrates: typeof caps.integrates === 'object' && !Array.isArray(caps.integrates)
        ? caps.integrates
        : {},
    };
  }

  /** Scan multiple file paths (or toml strings) into manifests */
  scanDir(filePaths: string[]): CapabilityManifest[] {
    return filePaths.map(path => {
      // In a real implementation this would read from filesystem
      // Here we treat each path as a TOML string for portability
      return this.parse(path);
    });
  }

  /** Find integration suggestions between known capabilities */
  findIntegrations(known: CapabilityManifest[]): IntegrationSuggestion[] {
    const suggestions: IntegrationSuggestion[] = [];

    for (let i = 0; i < known.length; i++) {
      for (let j = 0; j < known.length; j++) {
        if (i === j) continue;
        const a = known[i];
        const b = known[j];

        // A provides what B requires
        const overlap = a.provides.filter(p => b.requires.includes(p));
        if (overlap.length > 0) {
          suggestions.push({
            from: a.name,
            to: b.name,
            reason: `${a.name} provides [${overlap.join(', ')}] needed by ${b.name}`,
            priority: overlap.length,
          });
        }

        // Explicit integrates match
        for (const [ikey, value] of Object.entries(a.integrates)) {
          if (b.name === value || b.name === ikey) {
            const sugKey = `${a.name}->${b.name}:explicit:${ikey}`;
            suggestions.push({
              from: a.name,
              to: b.name,
              reason: `Explicit integration: ${ikey} → ${value}`,
              priority: 10,
              _key: sugKey,
            } as any);
          }
        }
      }
    }

    // Deduplicate and sort by priority descending
    const seen = new Set<string>();
    return suggestions
      .filter((s: any) => {
        const key: string = s._key ?? `${s.from}->${s.to}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ _key, ...s }: any) => s as IntegrationSuggestion)
      .sort((a, b) => b.priority - a.priority);
  }
}
