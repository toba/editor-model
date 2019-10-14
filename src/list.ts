/** Method to call for each item in an array */
export type ArrayCallback<T, R> = (item: T, index: number) => R;
/** Method to call for both items in equal length array pairs */
export type DuoCallback<T, U, R> = (t: T, u: U, i: number) => R;
/** Method to call for all three items in three equal length arrays */
export type TrioCallback<T, U, V, R> = (t: T, u: U, v: V, i: number) => R;

/**
 * Execute method for each item in an array (more than twice as fast as
 * built-in array `forEach`).
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

function trioEach<T, U, V>(
   a: T[],
   b: U[],
   c: V[],
   fn: TrioCallback<T, U, V, void>
) {
   const length = a.length;
   for (let i = 0; i < length; i++) {
      fn(a[i], b[i], c[i], i);
   }
}

function duoEach<T, U>(a: T[], b: U[], fn: DuoCallback<T, U, void>) {
   const length = a.length;
   for (let i = 0; i < length; i++) {
      fn(a[i], b[i], i);
   }
}

function duoFind<T, U>(
   a: T[],
   b: U[],
   fn: DuoCallback<T, U, boolean>
): [T, U] | undefined {
   const length = a.length;

   for (let i = 0; i < length; i++) {
      const t = a[i];
      const u = b[i];

      if (fn(t, u, i)) {
         return [t, u];
      }
   }
}

function trioFind<T, U, V>(
   a: T[],
   b: U[],
   c: V[],
   fn: TrioCallback<T, U, V, boolean>
): [T, U, V] | undefined {
   const length = a.length;

   for (let i = 0; i < length; i++) {
      const t = a[i];
      const u = b[i];
      const v = c[i];

      if (fn(t, u, v, i)) {
         return [t, u, v];
      }
   }
}

const duoPop = <T, U>(a: T[], b: U[]): [T, U] | undefined =>
   a.length === 0 ? undefined : [a.pop()!, b.pop()!];

const trioPop = <T, U, V>(a: T[], b: U[], c: V[]): [T, U, V] | undefined =>
   a.length == 0 ? undefined : [a.pop()!, b.pop()!, c.pop()!];

function duoPush<T, U>(a: T[], b: U[], t: T, u: U): number {
   a.push(t);
   return b.push(u);
}

function trioPush<T, U, V>(a: T[], b: U[], c: V[], t: T, u: U, v: V): number {
   a.push(t);
   b.push(u);
   return c.push(v);
}

const duoItem = <T, U>(a: T[], b: U[], i: number): [T, U] | undefined =>
   a.length <= i ? undefined : [a[i], b[i]];

const trioItem = <T, U, V>(
   a: T[],
   b: U[],
   c: V[],
   i: number
): [T, U, V] | undefined => (a.length <= i ? undefined : [a[i], b[i], c[i]]);

const duoLastItem = <T, U>(a: T[], b: U[]) => duoItem(a, b, a.length - 1);

const trioLastItem = <T, U, V>(a: T[], b: U[], c: V[]) =>
   trioItem(a, b, c, a.length - 1);

/**
 * Get the first index that matches _one_ (all do not need to match) of the
 * given values.
 */
function duoIndexOf<T, U>(a: T[], b: U[], t?: T, u?: U): number {
   let index = -1;

   if (t !== undefined && (index = a.indexOf(t)) >= 0) {
      return index;
   }
   if (u !== undefined && (index = b.indexOf(u)) >= 0) {
      return index;
   }
   return index;
}

/**
 * Get the first index that matches _one_ (all do not need to match) of the
 * given values.
 */
function trioIndexOf<T, U, V>(
   a: T[],
   b: U[],
   c: V[],
   t?: T,
   u?: U,
   v?: V
): number {
   let index = -1;

   if (t !== undefined && (index = a.indexOf(t)) >= 0) {
      return index;
   }
   if (u !== undefined && (index = b.indexOf(u)) >= 0) {
      return index;
   }
   if (v !== undefined && (index = c.indexOf(v)) >= 0) {
      return index;
   }
   return index;
}

const duoFlat = <T, U>(a: T[], b: U[]): (T | U)[] => {
   const flat: (T | U)[] = [];
   forEach(a, (item, index) => {
      flat.push(item, b[index]);
   });
   return flat;
};

const trioFlat = <T, U, V>(a: T[], b: U[], c: V[]): (T | U | V)[] => {
   const flat: (T | U | V)[] = [];
   forEach(a, (item, index) => {
      flat.push(item, b[index], c[index]);
   });
   return flat;
};

interface TupleList<G> {
   size: () => number;
   item: (index: number) => G | undefined;
   pop: () => G | undefined;
   lastItem: () => G | undefined;
}

/**
 * Alternating list of two item types stored internally as two equal length
 * arrays.
 */
export interface DuoList<T, U> extends TupleList<[T, U]> {
   each: (fn: DuoCallback<T, U, void>) => void;
   find: (fn: DuoCallback<T, U, boolean>) => [T, U] | undefined;
   push: (t: T, u: U) => number;
   indexOf: (t?: T, u?: U) => number;
   flat: () => (T | U)[];
}

/**
 * Alternating list of three item types stored internally as three equal length
 * arrays.
 */
export interface TrioList<T, U, V> extends TupleList<[T, U, V]> {
   each: (fn: TrioCallback<T, U, V, void>) => void;
   find: (fn: TrioCallback<T, U, V, boolean>) => [T, U, V] | undefined;
   push: (t: T, u: U, v: V) => number;
   indexOf: (t?: T, u?: U, v?: V) => number;
   flat: () => (T | U | V)[];
}

export function makeDuoList<T, U>(...list: [T, U][]): DuoList<T, U> {
   const length = list.length;
   const a: T[] = new Array(length);
   const b: U[] = new Array(length);

   forEach(list, (item, i) => {
      a[i] = item[0];
      b[i] = item[1];
   });

   return {
      each: (fn: DuoCallback<T, U, void>) => duoEach(a, b, fn),
      find: (fn: DuoCallback<T, U, boolean>) => duoFind(a, b, fn),
      pop: () => duoPop<T, U>(a, b),
      push: (t: T, u: U) => duoPush(a, b, t, u),
      item: (i: number) => duoItem<T, U>(a, b, i),
      lastItem: () => duoLastItem<T, U>(a, b),
      size: () => a.length,
      indexOf: (t?: T, u?: U) => duoIndexOf(a, b, t, u),
      flat: () => duoFlat(a, b)
   };
}

export function makeTrioList<T, U, V>(...list: [T, U, V][]): TrioList<T, U, V> {
   const length = list.length;
   const a: T[] = new Array(length);
   const b: U[] = new Array(length);
   const c: V[] = new Array(length);

   forEach(list, (item, i) => {
      a[i] = item[0];
      b[i] = item[1];
      c[i] = item[2];
   });

   return {
      each: (fn: TrioCallback<T, U, V, void>) => trioEach(a, b, c, fn),
      find: (fn: TrioCallback<T, U, V, boolean>) => trioFind(a, b, c, fn),
      pop: () => trioPop<T, U, V>(a, b, c),
      push: (t: T, u: U, v: V) => trioPush(a, b, c, t, u, v),
      item: (i: number) => trioItem<T, U, V>(a, b, c, i),
      lastItem: () => trioLastItem<T, U, V>(a, b, c),
      size: () => a.length,
      indexOf: (t?: T, u?: U, v?: V) => trioIndexOf(a, b, c, t, u, v),
      flat: () => trioFlat(a, b, c)
   };
}
