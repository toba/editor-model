// Mappable:: interface
// There are several things that positions can be mapped through.
// Such objects conform to this interface.
//
//   map:: (pos: number, assoc: ?number) → number
//   Map a position through this object. When given, `assoc` (should
//   be -1 or 1, defaults to 1) determines with which side the
//   position is associated, which determines in which direction to
//   move when a chunk of content is inserted at the mapped position.
//
//   mapResult:: (pos: number, assoc: ?number) → MapResult
//   Map a position, and return an object containing additional
//   information about the mapping. The result's `deleted` field tells
//   you whether the position was deleted (completely enclosed in a
//   replaced range) during the mapping. When content on only one side
//   is deleted, the position itself is only considered deleted when
//   `assoc` points in the direction of the deleted content.

// Recovery values encode a range index and an offset. They are
// represented as numbers, because tons of them will be created when
// mapping, for example, a large number of decorations. The number's
// lower 16 bits provide the index, the remaining bits the offset.
//
// Note: We intentionally don't use bit shift operators to en- and
// decode these, since those clip to 32 bits, which we might in rare
// cases want to overflow. A 64-bit float can represent 48-bit
// integers precisely.

const lower16 = 0xffff;
const factor16 = Math.pow(2, 16);

const makeRecover = (index: number, offset: number) =>
   index + offset * factor16;

const recoverIndex = value => value & lower16;

const recoverOffset = value => (value - (value & lower16)) / factor16;

// ::- An object representing a mapped position with extra
// information.
export class MapResult {
   deleted: boolean;
   /** Mapped version of the position */
   pos: number;

   recover: number | null;

   constructor(pos: number, deleted = false, recover = null) {
      // :: number The mapped version of the position.
      this.pos = pos;
      // :: bool Tells you whether the position was deleted, that is,
      // whether the step removed its surroundings from the document.
      this.deleted = deleted;
      this.recover = recover;
   }
}

// :: class extends Mappable
// A map describing the deletions and insertions made by a step, which
// can be used to find the correspondence between positions in the
// pre-step version of a document and the same position in the
// post-step version.
export class StepMap {
   inverted: boolean;

   ranges: number[];

   // :: ([number])
   // Create a position map. The modifications to the document are
   // represented as an array of numbers, in which each group of three
   // represents a modified chunk as `[start, oldSize, newSize]`.
   constructor(ranges: number[], inverted = false) {
      this.ranges = ranges;
      this.inverted = inverted;
   }

   recover(value) {
      let diff = 0;
      let index = recoverIndex(value);

      if (!this.inverted) {
         for (let i = 0; i < index; i++) {
            diff += this.ranges[i * 3 + 2] - this.ranges[i * 3 + 1];
         }
      }
      return this.ranges[index * 3] + diff + recoverOffset(value);
   }

   mapResult = (pos, assoc = 1): MapResult => this._map(pos, assoc, false);

   map = (pos: number, assoc = 1): number => this._map(pos, assoc, true);

   _map(pos: number, assoc: number, simple: boolean): number|MapResult {
      let diff = 0;
      let oldIndex = this.inverted ? 2 : 1;
      let newIndex = this.inverted ? 1 : 2;

      for (let i = 0; i < this.ranges.length; i += 3) {
         let start = this.ranges[i] - (this.inverted ? diff : 0);
         if (start > pos) {
            break;
         }

         let oldSize = this.ranges[i + oldIndex];
         let newSize = this.ranges[i + newIndex];
         let end = start + oldSize;

         if (pos <= end) {
            let side = !oldSize
               ? assoc
               : pos == start
               ? -1
               : pos == end
               ? 1
               : assoc;
            let result = start + diff + (side < 0 ? 0 : newSize);
            if (simple) {
               return result;
            }
            let recover = makeRecover(i / 3, pos - start);

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

   touches(pos, recover) {
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

   // :: ((oldStart: number, oldEnd: number, newStart: number, newEnd: number))
   // Calls the given function on each of the changed ranges included in
   // this map.
   forEach(f) {
      let oldIndex = this.inverted ? 2 : 1;
      let newIndex = this.inverted ? 1 : 2;

      for (let i = 0, diff = 0; i < this.ranges.length; i += 3) {
         let start = this.ranges[i];
         let oldStart = start - (this.inverted ? diff : 0);
         let newStart = start + (this.inverted ? 0 : diff);
         let oldSize = this.ranges[i + oldIndex];
         let newSize = this.ranges[i + newIndex];

         f(oldStart, oldStart + oldSize, newStart, newStart + newSize);

         diff += newSize - oldSize;
      }
   }

   // :: () → StepMap
   // Create an inverted version of this map. The result can be used to
   // map positions in the post-step document to the pre-step document.
   invert = () => new StepMap(this.ranges, !this.inverted);

   toString = () => (this.inverted ? '-' : '') + JSON.stringify(this.ranges);

   static empty = () => new StepMap([]);

   // :: (n: number) → StepMap
   // Create a map that moves all positions by offset `n` (which may be
   // negative). This can be useful when applying steps meant for a
   // sub-document to a larger document, or vice-versa.
   static offset = (n: number) =>
      n == 0 ? StepMap.empty : new StepMap(n < 0 ? [0, -n, 0] : [0, 0, n]);
}

// :: class extends Mappable
// A mapping represents a pipeline of zero or more [step
// maps](#transform.StepMap). It has special provisions for losslessly
// handling mapping positions through a series of steps in which some
// steps are inverted versions of earlier steps. (This comes up when
// ‘[rebasing](/docs/guide/#transform.rebasing)’ steps for
// collaboration or history management.)
export class Mapping {
   maps: StepMap[];
   from: number;
   to: number;
   mirror: number[];

   // :: (?[StepMap])
   // Create a new mapping with the given position maps.
   constructor(maps: StepMap[], mirror: number[], from: number, to: number) {
      // :: [StepMap]
      // The step maps in this mapping.
      this.maps = maps || [];
      // :: number
      // The starting position in the `maps` array, used when `map` or
      // `mapResult` is called.
      this.from = from || 0;
      // :: number
      // The end position in the `maps` array.
      this.to = to == null ? this.maps.length : to;
      this.mirror = mirror;
   }

   /**
    * Create a mapping that maps only through a part of this one.
    */
   slice = (from = 0, to = this.maps.length): Mapping =>
      new Mapping(this.maps, this.mirror, from, to);

   copy = () =>
      new Mapping(
         this.maps.slice(),
         this.mirror && this.mirror.slice(),
         this.from,
         this.to
      );

   // :: (StepMap, ?number)
   // Add a step map to the end of this mapping. If `mirrors` is
   // given, it should be the index of the step map that is the mirror
   // image of this one.
   appendMap(map: StepMap, mirrors?: number) {
      this.to = this.maps.push(map);
      if (mirrors != null) {
         this.setMirror(this.maps.length - 1, mirrors);
      }
   }

   /**
    * Add all the step maps in a given mapping to this one (preserving mirroring
    * information).
    */
   appendMapping(mapping: Mapping) {
      for (
         let i = 0, startSize = this.maps.length;
         i < mapping.maps.length;
         i++
      ) {
         let mirr = mapping.getMirror(i);
         this.appendMap(
            mapping.maps[i],
            mirr != null && mirr < i ? startSize + mirr : null
         );
      }
   }

   /**
    * Finds the offset of the step map that mirrors the map at the given offset,
    * in this mapping (as per the second argument to `appendMap`).
    */
   getMirror(n: number): number | undefined {
      if (this.mirror) {
         for (let i = 0; i < this.mirror.length; i++) {
            if (this.mirror[i] == n) {
               return this.mirror[i + (i % 2 ? -1 : 1)];
            }
         }
      }
   }

   setMirror(n: number, m: number) {
      if (!this.mirror) {
         this.mirror = [];
      }
      this.mirror.push(n, m);
   }

   /**
    * Append the inverse of the given mapping to this one.
    */
   appendMappingInverted(mapping: Mapping) {
      for (
         let i = mapping.maps.length - 1,
            totalSize = this.maps.length + mapping.maps.length;
         i >= 0;
         i--
      ) {
         let mirr = mapping.getMirror(i);
         this.appendMap(
            mapping.maps[i].invert(),
            mirr != null && mirr > i ? totalSize - mirr - 1 : null
         );
      }
   }

   /**
    * Create an inverted version of this mapping.
    */
   invert(): Mapping {
      let inverse = new Mapping();
      inverse.appendMappingInverted(this);
      return inverse;
   }

   /**
    * Map a position through this mapping.
    */
   map(pos: number, assoc = 1) {
      if (this.mirror) {
         return this._map(pos, assoc, true);
      }
      for (let i = this.from; i < this.to; i++) {
         pos = this.maps[i].map(pos, assoc);
      }
      return pos;
   }

   /**
    * Map a position through this mapping, returning a mapping result.
    */
   mapResult = (pos: number, assoc = 1): MapResult =>
      this._map(pos, assoc, false);

   _map(pos: number, assoc: number, simple: boolean): MapResult {
      let deleted = false;
      let recoverables = null;

      for (let i = this.from; i < this.to; i++) {
         let map = this.maps[i];
         let rec = recoverables && recoverables[i];

         if (rec != null && map.touches(pos, rec)) {
            pos = map.recover(rec);
            continue;
         }

         let result = map.mapResult(pos, assoc);

         if (result.recover != null) {
            let corr = this.getMirror(i);
            if (corr != null && corr > i && corr < this.to) {
               if (result.deleted) {
                  i = corr;
                  pos = this.maps[corr].recover(result.recover);
                  continue;
               } else {
                  (recoverables || (recoverables = Object.create(null)))[corr] =
                     result.recover;
               }
            }
         }

         if (result.deleted) deleted = true;
         pos = result.pos;
      }

      return simple ? pos : new MapResult(pos, deleted);
   }
}
