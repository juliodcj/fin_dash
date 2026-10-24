// Tudo fica salvo só neste aparelho (localStorage).
import { migrateTargets } from './assets';
import type { Settings, Trade } from './types';

const PREFIX = 'findash:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // armazenamento cheio ou bloqueado: o app continua funcionando na sessão
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // idem
  }
}

export function clearAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    // idem
  }
}

export const DEFAULT_SETTINGS: Settings = {
  annualize: true,
  defaultPeriod: '12M',
  method: 'twr',
  demo: false,
  targets: {},
  classes: {},
  hideValues: false,
};

export const loadTrades = () => load<Trade[]>('trades', []);
export const loadSettings = (): Settings => withDefaults(load<Partial<Settings>>('settings', {}));

/** ajustes salvos ou importados, com os padrões e as metas antigas (por ticker) convertidas em metas por classe */
export function withDefaults(s: Partial<Settings>): Settings {
  const out = { ...DEFAULT_SETTINGS, ...s };
  return { ...out, targets: migrateTargets(out.targets, out.classes) };
}

interface Cached<T> {
  at: number;
  from: string;
  data: T;
}

/** cache de dados de mercado: válido por `maxAgeMs` e se cobrir a data inicial pedida */
export function cached<T>(key: string, from: string, maxAgeMs: number): { data: T; fresh: boolean } | null {
  const c = load<Cached<T> | null>(`cache:${key}`, null);
  if (!c || c.from > from) return null;
  return { data: c.data, fresh: Date.now() - c.at < maxAgeMs };
}

export const putCache = (key: string, from: string, data: unknown) => save(`cache:${key}`, { at: Date.now(), from, data });

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
