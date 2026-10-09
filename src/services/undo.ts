// Undo for changes made in this browser tab. Every change runs as one "operation": all its
// requests carry the same x-operation-id header, which the database audit log records, and
// undo_operation() reverses exactly those rows. The list lives in sessionStorage (survives a refresh).
import { useSyncExternalStore } from 'react';
import { operationContext } from './operationContext';
import { supabase } from './supabase';

export type UndoKind = 'add' | 'addPerson' | 'edit' | 'delete' | 'order' | 'connect' | 'word' | 'photo' | 'photoRemove' | 'fill';
export type UndoEntry = { id: string; kind: UndoKind; name: string };

const KEY = 'ft.undo';
const MAX = 20;
let entries: UndoEntry[] = load();
const listeners = new Set<() => void>();

function load(): UndoEntry[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as UndoEntry[];
  } catch {
    return [];
  }
}
function save(next: UndoEntry[]) {
  entries = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // not remembered across refresh; still works in memory
  }
  for (const l of listeners) l();
}

/** Runs a change as one undoable operation. */
export async function recordChange<T>(kind: UndoKind, name: string, fn: () => Promise<T>): Promise<T> {
  const id = crypto.randomUUID();
  operationContext.set(id);
  try {
    const result = await fn();
    save([...entries, { id, kind, name }].slice(-MAX));
    return result;
  } catch (e) {
    // a change that failed half-way can still be rolled back
    save([...entries, { id, kind, name }].slice(-MAX));
    throw e;
  } finally {
    operationContext.set(null);
  }
}

/** Undo the most recent change from this tab. */
export async function undoLast(): Promise<UndoEntry | null> {
  const last = entries.at(-1);
  if (!last) return null;
  const { error } = await supabase.rpc('undo_operation', { p_op: last.id });
  // "Nothing to undo": the change never reached the database (it failed before saving anything)
  if (error && !/Nothing to undo/.test(error.message)) throw error;
  save(entries.slice(0, -1));
  return last;
}

export function useUndoList(): UndoEntry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
  );
}
