import { MapResult, StepMap, Mappable, Association } from './step-map';

/**
 * A mapping represents a pipeline of zero or more `StepMap`s. It has special
 * provisions for losslessly handling mapping positions through a series of
 * steps in which some steps are inverted versions of earlier steps.
 */
export class Mapping implements Mappable {
   /** Steps in this mapping */
   maps: StepMap[];
   /**
    * Starting position in the `maps` array, used when `map` or `mapResult` is
    * called
    */
   from: number;
   /** End position in the maps array */
   to: number;
   /**
    * Paired `maps` indexes indicating which are mirrors of each other.
    */
   mirror?: number[];

   /**
    * Create a new mapping with the given position maps.
    */
   constructor(
      maps: StepMap[] = [],
      mirror?: number[],
      from: number = 0,
      to?: number
   ) {
      this.maps = maps;
      this.from = from;
      this.to = to === undefined ? this.maps.length : to;
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

   /**
    * Add a step map to the end of this mapping.
    * @param mirrors Index of step map that is the mirror image of this one
    */
   appendMap(map: StepMap, mirrors?: number) {
      this.to = this.maps.push(map);

      if (mirrors !== undefined) {
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
         const mirr = mapping.getMirror(i);
         this.appendMap(
            mapping.maps[i],
            mirr !== undefined && mirr < i ? startSize + mirr : undefined
         );
      }
   }

   /**
    * Finds the offset of the step map that mirrors the map at the given offset,
    * in this mapping (as per the second argument to `appendMap`).
    */
   getMirror(n: number): number | undefined {
      if (this.mirror !== undefined) {
         for (let i = 0; i < this.mirror.length; i++) {
            if (this.mirror[i] == n) {
               return this.mirror[i + (i % 2 ? -1 : 1)];
            }
         }
      }
   }

   /**
    * @param n `maps` index
    * @param m `maps` index of item that mirrors `n`
    */
   setMirror(n: number, m: number) {
      if (this.mirror === undefined) {
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
            mirr != undefined && mirr > i ? totalSize - mirr - 1 : undefined
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
   map(pos: number, assoc = Association.After): number {
      if (this.mirror !== undefined) {
         // TODO: type guard?
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
   mapResult = (pos: number, assoc = Association.After): MapResult =>
      this._map(pos, assoc, false);

   // For `B extends true` pattern see
   // https://www.typescriptlang.org/docs/handbook/advanced-types.html#conditional-types
   // https://stackoverflow.com/a/52818072
   _map<B extends boolean>(
      pos: number,
      assoc: Association,
      simple: B
   ): B extends true ? number : MapResult;
   _map(pos: number, assoc: Association, simple: boolean): number | MapResult {
      let deleted = false;
      let recoverables: { [key: number]: number } | null = null;

      for (let i = this.from; i < this.to; i++) {
         const map: StepMap = this.maps[i];
         const rec = recoverables !== null ? recoverables[i] : null;

         if (rec !== null && map.touches(pos, rec)) {
            pos = map.recover(rec);
            continue;
         }

         const result = map.mapResult(pos, assoc);

         if (result.recover !== undefined) {
            const corr = this.getMirror(i);

            if (corr !== undefined && corr > i && corr < this.to) {
               if (result.deleted) {
                  i = corr;
                  pos = this.maps[corr].recover(result.recover);
                  continue;
               } else {
                  if (recoverables === null) {
                     recoverables = Object.create(null);
                  }
                  recoverables![corr] = result.recover;
               }
            }
         }

         if (result.deleted) {
            deleted = true;
         }
         pos = result.pos;
      }

      return simple ? pos : new MapResult(pos, deleted);
   }
}
