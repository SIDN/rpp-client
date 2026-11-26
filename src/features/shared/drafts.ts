import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useForm, type DefaultValues, type FieldValues, type UseFormReturn } from "react-hook-form";
import { useConnection } from "@/app/connection-context";
import { draftKey, useDraftStore } from "@/app/draft-context";

/** The store key of a draft of the active connection. */
function useKey(key: string): string {
  const { session } = useConnection();
  return draftKey(session?.id, key);
}

/**
 * Like `useState`, but the value outlives the screen for as long as the connection does. `override`, when given,
 * replaces what was kept, as when a link names the object to work on. The key decides the type of its value: one key
 * is used for one kind of value only.
 */
export function useDraftState<T>(key: string, initial: T, override?: T): [T, (value: T) => void] {
  const store = useDraftStore();
  const full = useKey(key);
  const [fallback] = useState(() => {
    if (override !== undefined) store.seed(full, override);
    else if (!store.has(full)) store.seed(full, initial);
    return override ?? initial;
  });
  const subscribe = useCallback((listener: () => void) => store.subscribe(full, listener), [store, full]);
  const value = useSyncExternalStore(subscribe, () => (store.has(full) ? (store.get(full) as T) : fallback));
  const setValue = useCallback((next: T) => store.set(full, next), [store, full]);
  return [value, setValue];
}

/** Whether two form values are the same, member by member. */
export function sameValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameValues(item, b[index]));
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => sameValues(left[key], right[key]));
}

interface FormDraft<T> {
  /** What the form was last reset to: its empty values, what it was filled in from, or the object being changed. */
  base: T;
  values: T;
  /** The draft only applies to a form made for the same thing, such as the same state of the object being changed. */
  validFor: string | undefined;
  /** The object the form was filled in from, if it was. */
  source: string | undefined;
  /** The last object offered to fill the form in from, so that coming back does not offer it again. */
  offered: string | undefined;
}

export interface DraftForm<T extends FieldValues> {
  form: UseFormReturn<T>;
  /** The object the form was last filled in from, if any. */
  source: string | undefined;
  /** Whether the values are other than what the form was last reset to. */
  isEdited(): boolean;
  /** Replaces every value, and remembers where they came from. */
  resetTo(values: T, source?: string): void;
  /** Records that the form was offered this filling in; false when it was offered before. */
  offer(offer: string): boolean;
}

/**
 * A react-hook-form form whose values are kept in the draft store while it is typed in, and given back when the form
 * is made again. A draft made for another `validFor` is not used.
 */
export function useDraftForm<T extends FieldValues>(key: string, defaults: T, validFor?: string): DraftForm<T> {
  const store = useDraftStore();
  const full = useKey(key);
  const [initial] = useState<FormDraft<T>>(() => {
    const kept = store.get(full) as FormDraft<T> | undefined;
    return kept && kept.validFor === validFor ? kept : { base: defaults, values: defaults, validFor, source: undefined, offered: undefined };
  });
  const form = useForm<T>({ defaultValues: initial.values as DefaultValues<T> });
  const draft = useRef(initial);
  const [source, setSource] = useState(initial.source);

  const save = useCallback(() => {
    draft.current = { ...draft.current, values: form.getValues() };
    store.set(full, draft.current);
  }, [form, store, full]);

  useEffect(() => {
    const unsubscribe = form.subscribe({ formState: { values: true }, callback: save });
    return () => {
      unsubscribe();
      save();
    };
  }, [form, save]);

  const isEdited = useCallback(() => !sameValues(form.getValues(), draft.current.base), [form]);
  const resetTo = useCallback(
    (values: T, from?: string) => {
      draft.current = { ...draft.current, base: values, source: from };
      form.reset(values);
      setSource(from);
      save();
    },
    [form, save],
  );

  const offer = useCallback((next: string) => {
    if (draft.current.offered === next) return false;
    draft.current = { ...draft.current, offered: next };
    return true;
  }, []);

  return { form, source, isEdited, resetTo, offer };
}

/** A filled-in form for an object loaded elsewhere: its identifier, and the values it comes to. */
export interface PrefillSource<T> {
  id: string;
  values: T;
}

/**
 * Fills the form in from the object last loaded, when one is loaded that was not offered before, unless something has
 * been typed into the form since it was last reset.
 */
export function usePrefill<T extends FieldValues>(draftForm: DraftForm<T>, source: PrefillSource<T> | undefined): void {
  const fingerprint = source && JSON.stringify([source.id, source.values]);
  const latest = useRef(source);
  useEffect(() => {
    latest.current = source;
  });
  const { isEdited, resetTo, offer } = draftForm;
  useEffect(() => {
    const current = latest.current;
    if (!current || fingerprint === undefined || !offer(fingerprint) || isEdited()) return;
    resetTo(current.values, current.id);
  }, [fingerprint, offer, isEdited, resetTo]);
}
