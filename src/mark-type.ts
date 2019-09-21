import { is } from '@toba/tools';
import { Schema } from './schema';
import { Mark } from './mark';
import { MarkSerializer } from './to-dom';
import { OrderedMap } from './ordered-map';
import { ParseRule } from './parse-dom';
import {
   AttributeMap,
   AttributeSpec,
   initAttrs,
   defaultAttrs,
   computeAttrs,
   Attributes
} from './attribute';

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L404
 */
export interface MarkSpec {
   /**
    * The attributes that marks of this type get.
    */
   attrs?: { [key: string]: AttributeSpec<any> };

   /**
    * Whether this mark should be active when the cursor is positioned at its
    * end (or at its start when that is also the start of the parent node).
    * Defaults to `true`.
    */
   inclusive?: boolean;

   /**
    * Determines which other marks this mark can coexist with. Should be a
    * space-separated strings naming other marks or groups of marks. When a mark
    * is [added](#model.Mark.addToSet) to a set, all marks that it excludes are
    * removed in the process. If the set contains any mark that excludes the
    * new mark but is not, itself, excluded by the new mark, the mark can not be
    * added an the set. You can use the value `"_"` to indicate that the mark
    * excludes all marks in the schema.
    *
    * Defaults to only being exclusive with marks of the same type. You can set
    * it to an empty string (or any string not containing the mark's own name)
    * to allow multiple marks of a given type to coexist (as long as they have
    * different attributes).
    */
   excludes?: string;

   /**
    * The group or space-separated groups to which this mark belongs.
    */
   group?: string;

   /**
    * Determines whether marks of this type can span multiple adjacent nodes
    * when serialized to DOM/HTML. Defaults to `true`.
    */
   spanning?: boolean;

   /**
    * Defines the default way marks of this type should be serialized to
    * DOM/HTML. When the resulting spec contains a hole, that is where the
    * marked content is placed. Otherwise, it is appended to the top node.
    */
   toDOM?: MarkSerializer;

   /**
    * Associates DOM parser information with this mark (see the corresponding
    * [node spec field](#model.NodeSpec.parseDOM)). The `mark` field in the
    * rules is implied.
    */
   parseDOM?: ParseRule[];
}

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
   instance: Mark | null;
   excluded: MarkType[] | null;

   constructor(name: string, rank: number, schema: Schema, spec: MarkSpec) {
      this.name = name;
      this.schema = schema;
      this.spec = spec;
      this.attrs = initAttrs(spec.attrs);
      this.rank = rank;
      this.excluded = null;

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
      !is.value<Attributes>(attrs) && this.instance !== null
         ? this.instance
         : new Mark(this, computeAttrs(this.attrs, attrs));

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
      for (let i = 0; i < set.length; i++) {
         if (set[i].type == this) {
            return set[i];
         }
      }
   }

   /**
    * Whether mark type is in group defined by its `MarkSpec`.
    */
   isInGroup = (name: string): boolean =>
      this.spec.group === undefined
         ? false
         : this.spec.group.split(' ').includes(name);

   /**
    * Queries whether a given mark type is [excluded](#model.MarkSpec.excludes)
    * by this one.
    */
   excludes = (other: MarkType): boolean =>
      this.excluded !== null && this.excluded.indexOf(other) > -1;
}
