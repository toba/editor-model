import { Schema } from './schema';
import { Mark, MarkSpec } from './mark';
import {
   AttributeMap,
   initAttrs,
   defaultAttrs,
   computeAttrs
} from './attribute';

/**
 * Like nodes, marks (which are associated with nodes to signify things like
 * emphasis or being part of a link) are [tagged](#model.Mark.type) with type
 * objects, which are instantiated once per `Schema`.
 */
export class MarkType {
   /** Name of the mark type */
   name: string;
   /** Schema that this mark type instance is part of */
   schema: Schema;
   /** Spec on which the type is based */
   spec: MarkSpec;
   rank: number;
   attrs: AttributeMap;
   instance: Mark;
   excluded: MarkType[] | null;

   constructor(name: string, rank: number, schema: Schema, spec: MarkSpec) {
      this.name = name;
      this.schema = schema;
      this.spec = spec;
      this.attrs = initAttrs(spec.attrs);
      this.rank = rank;
      this.excluded = null;
      let defaults = defaultAttrs(this.attrs);
      this.instance = defaults && new Mark(this, defaults);
   }

   /**
    * Create a mark of this type. `attrs` may be `null` or an object containing
    * only some of the mark's attributes. The others, if they have defaults,
    * will be added.
    */
   create = (attrs: AttributeMap): Mark =>
      !attrs && this.instance
         ? this.instance
         : new Mark(this, computeAttrs(this.attrs, attrs));

   static compile(marks: Mark[], schema: Schema) {
      const result: { [key: string]: MarkType } = Object.create(null);
      let rank = 0;

      marks.forEach(
         (name, spec) =>
            (result[name] = new MarkType(name, rank++, schema, spec))
      );
      return result;
   }

   /**
    * When there is a mark of this type in the given set, a new set without it
    * is returned. Otherwise, the input set is returned.
    */
   removeFromSet(set: Mark[]): Mark[] {
      for (var i = 0; i < set.length; i++) {
         if (set[i].type == this) {
            return set.slice(0, i).concat(set.slice(i + 1));
         }
      }
      return set;
   }

   /**
    * Tests whether there is a mark of this type in the given set.
    */
   isInSet(set: Mark[]): Mark | undefined {
      for (let i = 0; i < set.length; i++)
         if (set[i].type == this) {
            return set[i];
         }
   }

   /**
    * Queries whether a given mark type is [excluded](#model.MarkSpec.excludes)
    * by this one.
    */
   excludes = (other: MarkType): boolean =>
      this.excluded !== null && this.excluded.indexOf(other) > -1;
}
