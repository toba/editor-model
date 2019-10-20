import { is } from '@toba/tools';
import { Schema } from '../schema';
import { Mark } from './mark';
import { MarkSpec } from './spec';
import { OrderedMap } from '../ordered-map';
import {
   AttributeMap,
   initAttrs,
   defaultAttrs,
   computeAttrs,
   Attributes
} from '../node/attribute';

/**
 * Like nodes, marks (which are associated with nodes to signify things like
 * emphasis or being part of a link) are [tagged](#model.Mark.type) with type
 * objects, which are instantiated once per `Schema`.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L235
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
   instance?: Mark;
   excluded?: MarkType[];

   constructor(name: string, rank: number, schema: Schema, spec: MarkSpec) {
      this.name = name;
      this.schema = schema;
      this.spec = spec;
      this.attrs = initAttrs(spec.attrs);
      this.rank = rank;
      this.excluded = undefined;

      const defaults = defaultAttrs(this.attrs);

      this.instance = defaults && new Mark(this, defaults);
   }

   static compile(specs: OrderedMap<MarkSpec>, schema: Schema) {
      let rank = 0;

      return specs.map(
         (name, spec) => new MarkType(name, rank++, schema, spec)
      );
   }

   /**
    * Create a mark of this type. `attrs` may be `null` or an object containing
    * only some of the mark's attributes. The others, if they have defaults,
    * will be added.
    */
   create = (attrs?: Attributes): Mark =>
      !is.value<Attributes>(attrs) && this.instance !== undefined
         ? this.instance
         : new Mark(this, computeAttrs(this.attrs, attrs));

   /**
    * When there is a mark of this type in the given list, a new list without it
    * is returned. Otherwise, the input list is returned.
    */
   removeSelf(marks: Mark[]): Mark[] {
      for (var i = 0; i < marks.length; i++) {
         if (marks[i].type === this) {
            return marks.slice(0, i).concat(marks.slice(i + 1));
         }
      }
      return marks;
   }

   /**
    * Find `Mark` of this type in the list.
    */
   find = (marks: Mark[]): Mark | undefined => marks.find(m => m.type === this);

   /**
    * Whether mark type is in group defined by its `MarkSpec`.
    */
   isInGroup = (name: string): boolean =>
      this.spec.group === undefined
         ? false
         : this.spec.group.split(' ').includes(name);

   /**
    * Whether a given mark type is excluded by this one.
    */
   excludes = (other: MarkType): boolean =>
      this.excluded !== undefined && this.excluded.includes(other);
}
