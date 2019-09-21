import { ValueType, is } from '@toba/tools';

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/comparedeep.js
 */
export function compareDeep<T extends object | Array<any>>(
   a: T,
   b: T
): boolean {
   if (a === b) {
      return true;
   }
   if (
      !(a && typeof a == ValueType.Object) ||
      !(b && typeof b == ValueType.Object)
   ) {
      return false;
   }

   if (is.array<any>(a)) {
      if (!is.array<any>(b)) {
         return false;
      }
      // both arrays
      if (a.length != b.length) {
         return false;
      }
      for (let i = 0; i < a.length; i++) {
         if (!compareDeep(a[i], b[i])) {
            return false;
         }
      }
   } else {
      // objects
      for (let p in a) {
         if (!(p in b) || !compareDeep<any>(a[p], b[p])) {
            return false;
         }
      }
      for (let p in b) {
         if (!(p in a)) {
            return false;
         }
      }
   }
   return true;
}
