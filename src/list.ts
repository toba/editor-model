export type ArrayCallback<T, R> = (item: T, index: number) => R;
export type DuoCallback<T, U, R> = (t: T, u: U, i: number) => R;
export type TrioCallback<T, U, V, R> = (t: T, u: U, v: V, i: number) => R;

/**
 * More than twice as fast as built-in array `forEach`.
 *
 * @see https://jsperf.com/toba-array
 */
export function forEach<T>(list: T[], fn: ArrayCallback<T, void>) {
   const length = list.length;
   for (let i = 0; i < length; i++) {
      fn(list[i], i);
   }
}

/**
 * @param filter Method that returns `true` if the array item should be processed
 * @param fn Method applied to array item
 */
export function filterEach<T>(
   list: T[],
   filter: ArrayCallback<T, boolean>,
   fn: ArrayCallback<T, void>
) {
   forEach(list, (item, index) => {
      if (filter(item, index)) {
         fn(item, index);
      }
   });
}

/**
 * Utility methods for treating an array of alternating types as a simple array.
 */
const duo = {
   size: 2,

   each<T, U>(list: (T | U)[], fn: DuoCallback<T, U, void>) {
      const length = list.length;
      for (let i = 0; i < length; i += this.size) {
         fn(list[i] as T, list[i + 1] as U, i / this.size);
      }
   },

   find<T, U>(
      list: (T | U)[],
      fn: DuoCallback<T, U, boolean>
   ): [T, U] | undefined {
      const length = list.length;
      for (let i = 0; i < length; i += this.size) {
         const t = list[i] as T;
         const u = list[i + 1] as U;

         if (fn(t, u, i / this.size)) {
            return [t, u];
         }
      }
   },

   pop<T, U>(list: (T | U)[]): [T, U] {
      const u = list.pop() as U;
      const t = list.pop() as T;
      return [t, u];
   },

   push<T, U>(list: (T | U)[], t: T, u: U): number {
      list.push(t);
      const length = list.push(u);
      return length / this.size;
   },

   item<T, U>(list: (T | U)[], i: number): [T, U] {
      i *= this.size;
      return [list[i] as T, list[i + 1] as U];
   },

   lastItem<T, U>(list: (T | U)[]): [T, U] {
      const i = list.length / this.size;
      return this.item<T, U>(list, i);
   },

   indexOf<T, U>(list: (T | U)[], t?: T, u?: U): number {
      if (t !== undefined) {
         const index = list.indexOf(t);
         if (index !== -1) {
            return index / this.size;
         }
      }
      if (u !== undefined) {
         const index = list.indexOf(u);
         if (index !== -1) {
            return (index - 1) / this.size;
         }
      }
      return -1;
   }
};

/**
 * Utility methods for treating an array of three types as a simple array.
 */
const trio = {
   size: 3,

   each<T, U, V>(list: (T | U | V)[], fn: TrioCallback<T, U, V, void>) {
      const length = list.length;
      for (let i = 0; i < length; i += this.size) {
         fn(list[i] as T, list[i + 1] as U, list[i + 2] as V, i / this.size);
      }
   },

   find<T, U, V>(
      list: (T | U | V)[],
      fn: TrioCallback<T, U, V, boolean>
   ): [T, U, V] | undefined {
      const length = list.length;
      for (let i = 0; i < length; i += this.size) {
         const t = list[i] as T;
         const u = list[i + 1] as U;
         const v = list[i + 2] as V;

         if (fn(t, u, v, i / this.size)) {
            return [t, u, v];
         }
      }
   },

   pop<T, U, V>(list: (T | U | V)[]): [T, U, V] {
      const v = list.pop() as V;
      const u = list.pop() as U;
      const t = list.pop() as T;
      return [t, u, v];
   },

   push<T, U, V>(list: (T | U | V)[], t: T, u: U, v: V): number {
      list.push(t);
      list.push(u);
      const length = list.push(v);
      return length / this.size;
   },

   item<T, U, V>(list: (T | U | V)[], i: number): [T, U, V] {
      i *= this.size;
      return [list[i] as T, list[i + 1] as U, list[i + 2] as V];
   },

   lastItem<T, U, V>(list: (T | U | V)[]): [T, U, V] {
      const i = list.length / this.size;
      return this.item<T, U, V>(list, i);
   },

   indexOf<T, U, V>(list: (T | U | V)[], t?: T, u?: U, v?: V): number {
      if (t !== undefined) {
         const index = list.indexOf(t);
         if (index !== -1) {
            return index / this.size;
         }
      }
      if (u !== undefined) {
         const index = list.indexOf(u);
         if (index !== -1) {
            return (index - 1) / this.size;
         }
      }
      if (v !== undefined) {
         const index = list.indexOf(v);
         if (index !== -1) {
            return (index - 2) / this.size;
         }
      }
      return -1;
   }
};

interface TupleList<G> {
   size: () => number;
   item: (index: number) => G;
   pop: () => G;
   lastItem: () => G;
}

/**
 * Alternating list of two item types stored internally as a flat array.
 */
export interface DuoList<T, U> extends TupleList<[T, U]> {
   list: (T | U)[];
   each: (fn: DuoCallback<T, U, void>) => void;
   find: (fn: DuoCallback<T, U, boolean>) => [T, U] | undefined;
   push: (t: T, u: U) => number;
   indexOf: (t?: T, u?: U) => number;
}

/**
 * Alternating list of three item types stored internally as a flat array.
 */
export interface TrioList<T, U, V> extends TupleList<[T, U, V]> {
   list: (T | U | V)[];
   each: (fn: TrioCallback<T, U, V, void>) => void;
   find: (fn: TrioCallback<T, U, V, boolean>) => [T, U, V] | undefined;
   push: (t: T, u: U, v: V) => number;
   indexOf: (t?: T, u?: U, v?: V) => number;
}

export function makeDuoList<T, U>(list: (T | U)[] = []): DuoList<T, U> {
   if (list.length % 2 !== 0) {
      throw new RangeError(
         `Invalid array length: ${list.length} — must be 0 or a multiple of 2`
      );
   }
   return {
      list,
      each: (fn: DuoCallback<T, U, void>) => duo.each(list, fn),
      find: (fn: DuoCallback<T, U, boolean>) => duo.find(list, fn),
      pop: () => duo.pop<T, U>(list),
      push: (t: T, u: U) => duo.push(list, t, u),
      item: (i: number) => duo.item<T, U>(list, i),
      lastItem: () => duo.lastItem<T, U>(list),
      size: () => list.length / 2,
      indexOf: (t?: T, u?: U) => duo.indexOf(list, t, u)
   };
}

export function makeTrioList<T, U, V>(
   list: (T | U | V)[] = []
): TrioList<T, U, V> {
   if (list.length % 3 !== 0) {
      throw new RangeError(
         `Invalid array length: ${list.length} — must be 0 or a multiple of 3`
      );
   }
   return {
      list,
      each: (fn: TrioCallback<T, U, V, void>) => trio.each(list, fn),
      find: (fn: TrioCallback<T, U, V, boolean>) => trio.find(list, fn),
      pop: () => trio.pop<T, U, V>(list),
      push: (t: T, u: U, v: V) => trio.push(list, t, u, v),
      item: (i: number) => trio.item<T, U, V>(list, i),
      lastItem: () => trio.lastItem<T, U, V>(list),
      size: () => list.length / 3,
      indexOf: (t?: T, u?: U, v?: V) => trio.indexOf(list, t, u, v)
   };
}
