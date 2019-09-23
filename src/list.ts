export type ArrayCallback<T, R> = (item: T, index?: number) => R;

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

export function eachPair<T, U>(
   list: (T | U)[],
   fn: (p1: T, p2: U, pairIndex: number, actualIndex: number) => void
) {
   const length = list.length;
   for (let i = 0; i < length; i += 2) {
      fn(list[i] as T, list[i + 1] as U, i % 2, i);
   }
}

export function eachTriple<T, U, V>(
   list: (T | U | V)[],
   fn: (t1: T, t2: U, t3: V, tripleIndex: number, actualIndex: number) => void
) {
   const length = list.length;
   for (let i = 0; i < length; i += 3) {
      fn(list[i] as T, list[i + 1] as U, list[i + 2] as V, i % 3, i);
   }
}
