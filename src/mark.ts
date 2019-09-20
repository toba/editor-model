import { is } from '@toba/tools';
import { compareDeep } from './compare-deep';
import { MarkType } from './mark-type';
import { AttributeSpec, AttributeMap } from './attribute';
import { DOMOutputSpec, MarkSerializer } from './to-dom';
import { ParseRule } from './from-dom';
import { Schema } from './schema';

export interface MarkJSON {
   type: string;
   attrs: AttributeMap;
}

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
 * A mark is a piece of information that can be attached to a node, such as it
 * being emphasized, in code font, or a link. It has a type and optionally a set
 * of attributes that provide further information (such as the target of the
 * link). Marks are created through a `Schema`, which controls which types exist
 * and which attributes they have.
 */
export class Mark {
   /** Type of this mark */
   type: MarkType;
   /** Attributes associated with this mark */
   attrs: AttributeMap;

   constructor(type: MarkType, attrs: AttributeMap) {
      this.type = type;
      this.attrs = attrs;
   }

   /**
    * Given a set of marks, create a new set which contains this one as well, in
    * the right position. If this mark is already in the set, the set itself is
    * returned. If any marks that are set to be
    * [exclusive](#model.MarkSpec.excludes) with this mark are present, those
    * are replaced by this one.
    */
   addToSet(set: Mark[]): Mark[] {
      let copy;
      let placed = false;

      for (let i = 0; i < set.length; i++) {
         let other = set[i];

         if (this.eq(other)) {
            return set;
         }

         if (this.type.excludes(other.type)) {
            if (!copy) copy = set.slice(0, i);
         } else if (other.type.excludes(this.type)) {
            return set;
         } else {
            if (!placed && other.type.rank > this.type.rank) {
               if (!copy) copy = set.slice(0, i);
               copy.push(this);
               placed = true;
            }
            if (copy) copy.push(other);
         }
      }
      if (!copy) copy = set.slice();
      if (!placed) copy.push(this);

      return copy;
   }

   /**
    * Remove this mark from the given set, returning a new set. If this mark is
    * not in the set, the set itself is returned.
    */
   removeFromSet(set: Mark[]): Mark[] {
      for (let i = 0; i < set.length; i++) {
         if (this.eq(set[i])) {
            return set.slice(0, i).concat(set.slice(i + 1));
         }
      }
      return set;
   }

   /**
    * Test whether this mark is in the given set of marks.
    */
   isInSet(set: Mark[]): boolean {
      for (let i = 0; i < set.length; i++) {
         if (this.eq(set[i])) {
            return true;
         }
      }
      return false;
   }

   /**
    * Test whether this mark has the same type and attributes as another mark.
    */
   eq(other: Mark): boolean {
      return (
         this == other ||
         (this.type == other.type && compareDeep(this.attrs, other.attrs))
      );
   }

   /**
    * Convert this mark to a JSON-serializeable representation.
    */
   toJSON(): MarkJSON {
      const out: MarkJSON = { type: this.type.name, attrs: {} };
      for (let _ in this.attrs) {
         out.attrs = this.attrs;
         break;
      }
      return out;
   }

   static fromJSON(schema: Schema, json: MarkJSON): Mark {
      if (!json) {
         throw new RangeError('Invalid input for Mark.fromJSON');
      }
      let type = schema.marks[json.type];
      if (!type)
         throw new RangeError(
            `There is no mark type ${json.type} in this schema`
         );
      return type.create(json.attrs);
   }

   /**
    * Test whether two sets of marks are identical.
    */
   static sameSet(a: Mark[], b: Mark[]): boolean {
      if (a === b) {
         return true;
      }
      if (a.length != b.length) {
         return false;
      }
      for (let i = 0; i < a.length; i++) {
         if (!a[i].eq(b[i])) {
            return false;
         }
      }
      return true;
   }

   /**
    * Create a properly sorted mark set from null, a single mark, or an unsorted
    * array of marks.
    */
   static setFrom(marks?: Mark[] | Mark | null): Mark[] {
      if (
         marks === null ||
         marks === undefined ||
         (is.array<Mark>(marks) && marks.length == 0)
      ) {
         return Mark.none;
      }
      if (marks instanceof Mark) {
         return [marks];
      }
      const copy = marks.slice();
      copy.sort((a, b) => a.type.rank - b.type.rank);

      return copy;
   }

   /**
    * The empty set of marks.
    */
   static none: Mark[] = [];
}
