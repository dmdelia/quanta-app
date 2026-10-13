import type { MathfieldElement } from 'mathlive';

const defaults = new WeakMap<MathfieldElement, MathfieldElement['macros']>();

export function applyMathMacros(field: MathfieldElement, macros: Record<string, string>) {
  if (!defaults.has(field)) defaults.set(field, {...field.macros});
  field.macros = {
    ...defaults.get(field),
    ...Object.fromEntries(Object.entries(macros).map(([name, value]) => [name.replace(/^\\/, ''), value])),
  };
}
