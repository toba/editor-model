/**
 * Determines with which side the position is associated, which determines in
 * which direction to move when a chunk of content is inserted at the mapped
 * position.
 */
export const enum Association {
   Before = -1,
   After = 1
}

/**
 * There are several things that positions can be mapped through. Such objects
 * conform to this interface.
 */
export interface Mappable {
   /**
    * Map a position through this object
    */
   map(pos: number, assoc?: Association): number;

   /**
    * Map a position, and return an object containing additional information
    * about the mapping. The result's `deleted` field tells you whether the
    * position was deleted (completely enclosed in a replaced range) during the
    * mapping.
    *
    * When content on only one side is deleted, the position itself is only
    * considered deleted when `assoc` points in the direction of the deleted
    * content.
    */
   mapResult(pos: number, assoc?: Association): MapResult;
}

export type MapForEachCallback = (
   oldStart: number,
   oldEnd: number,
   newStart: number,
   newEnd: number
) => void;

const lower16 = 0xffff;
const factor16 = Math.pow(2, 16);

/**
 * Recovery values encode a range index and an offset. They are represented as
 * numbers, because tons of them will be created when mapping, for example, a
 * large number of decorations. The number's lower 16 bits provide the index,
 * the remaining bits the offset.
 *
 * *Note*: We intentionally don't use bit shift operators to en- and decode
 * these, since those clip to 32 bits, which we might in rare cases want to
 * overflow. A 64-bit float can represent 48-bit integers precisely.
 */
const makeRecover = (index: number, offset: number) =>
   index + offset * factor16;

const recoverIndex = (value: number) => value & lower16;
const recoverOffset = (value: number) => (value - (value & lower16)) / factor16;

/**
 * A mapped position with extra information.
 */
export class MapResult {
   /**
    * Whether the position was deleted, that is, whether the step removed its
    * surroundings from the document
    */
   deleted: boolean;

   /** Mapped version of the position */
   pos: number;

   recover?: number;

   constructor(pos: number, deleted = false, recover?: number) {
      this.pos = pos;
      this.deleted = deleted;
      this.recover = recover;
   }
}

/**
 * A map describing the deletions and insertions made by a step, which can be
 * used to find the correspondence between positions in the pre-step version of
 * a document and the same position in the post-step version.
 */
export class StepMap implements Mappable {
   inverted: boolean;
   ranges: number[];

   /**
    * Create a position map. The modifications to the document are represented
    * as an array of numbers, in which each group of three represents a modified
    * chunk as `[start, oldSize, newSize]`.
    */
   constructor(ranges: number[], inverted = false) {
      this.ranges = ranges;
      this.inverted = inverted;
   }

   recover(value: number): number {
      let diff = 0;
      let index = recoverIndex(value);

      if (!this.inverted) {
         for (let i = 0; i < index; i++) {
            diff += this.ranges[i * 3 + 2] - this.ranges[i * 3 + 1];
         }
      }
      return this.ranges[index * 3] + diff + recoverOffset(value);
   }

   mapResult = (pos: number, assoc = Association.After): MapResult =>
      this._map(pos, assoc, false);

   map = (pos: number, assoc = Association.After): number =>
      this._map(pos, assoc, true);

   // For `B extends true` pattern see
   // https://www.typescriptlang.org/docs/handbook/advanced-types.html#conditional-types
   _map<B extends boolean>(
      pos: number,
      assoc: Association,
      simple: B
   ): B extends true ? number : MapResult {
      let diff = 0;
      const oldIndex = this.inverted ? 2 : 1;
      const newIndex = this.inverted ? 1 : 2;

      for (let i = 0; i < this.ranges.length; i += 3) {
         const start = this.ranges[i] - (this.inverted ? diff : 0);

         if (start > pos) {
            break;
         }

         let oldSize = this.ranges[i + oldIndex];
         let newSize = this.ranges[i + newIndex];
         const end = start + oldSize;

         if (pos <= end) {
            const side = !oldSize
               ? assoc
               : pos == start
               ? -1
               : pos == end
               ? 1
               : assoc;

            const result = start + diff + (side < 0 ? 0 : newSize);

            if (simple === true) {
               return result;
            }
            const recover = makeRecover(i / 3, pos - start);

            return new MapResult(
               result,
               assoc < 0 ? pos != start : pos != end,
               recover
            );
         }
         diff += newSize - oldSize;
      }
      return simple ? pos + diff : new MapResult(pos + diff);
   }

   touches(pos: number, recover: number): boolean {
      let diff = 0;
      let index = recoverIndex(recover);
      let oldIndex = this.inverted ? 2 : 1;
      let newIndex = this.inverted ? 1 : 2;

      for (let i = 0; i < this.ranges.length; i += 3) {
         let start = this.ranges[i] - (this.inverted ? diff : 0);
         if (start > pos) {
            break;
         }
         let oldSize = this.ranges[i + oldIndex];
         let end = start + oldSize;

         if (pos <= end && i == index * 3) {
            return true;
         }

         diff += this.ranges[i + newIndex] - oldSize;
      }
      return false;
   }

   /**
    * Calls the given function on each of the changed ranges included in this
    * map.
    */
   forEach(fn: MapForEachCallback) {
      const oldIndex = this.inverted ? 2 : 1;
      const newIndex = this.inverted ? 1 : 2;

      for (let i = 0, diff = 0; i < this.ranges.length; i += 3) {
         const start = this.ranges[i];
         const oldStart = start - (this.inverted ? diff : 0);
         const newStart = start + (this.inverted ? 0 : diff);
         const oldSize = this.ranges[i + oldIndex];
         const newSize = this.ranges[i + newIndex];

         fn(oldStart, oldStart + oldSize, newStart, newStart + newSize);

         diff += newSize - oldSize;
      }
   }

   /**
    * Create an inverted version of this map. The result can be used to map
    * positions in the post-step document to the pre-step document.
    */
   invert = () => new StepMap(this.ranges, !this.inverted);

   toString = () => (this.inverted ? '-' : '') + JSON.stringify(this.ranges);

   static get empty() {
      return new StepMap([]);
   }

   /**
    * Create a map that moves all positions by offset `n` (which may be
    * negative). This can be useful when applying steps meant for a sub-document
    * to a larger document, or vice-versa.
    */
   static offset = (n: number): StepMap =>
      n == 0 ? StepMap.empty : new StepMap(n < 0 ? [0, -n, 0] : [0, 0, n]);
}
