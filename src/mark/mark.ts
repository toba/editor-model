import { is } from '@toba/tools';
import { compareDeep } from '../compare-deep';
import { MarkType } from './mark-type';
import { Attributes } from '../node';
import { Schema } from '../schema/schema';

export interface MarkJSON {
   type: string;
   attrs: Attributes;
}

/**
 * A mark is a piece of information that can be attached to a node, such as it
 * being emphasized, in code font, or a link. It has a type and optionally a set
 * of attributes that provide further information (such as the target of the
 * link). Marks are created through a `Schema`, which controls which types exist
 * and which attributes they have.
 */
export class Mark {
   /** Type of mark */
   type: MarkType;
   /** Associated attributes */
   attrs: Attributes;

   constructor(type: MarkType, attrs: Attributes) {
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
   addToSet(target: Mark[]): Mark[] {
      /** New set of marks with current instance added */
      let out: Mark[] | null = null;
      /** Whether mark has already been added to the output */
      let placed = false;

      for (let i = 0; i < target.length; i++) {
         const other: Mark = target[i];

         if (this.equals(other)) {
            return target;
         }

         if (this.type.excludes(other.type)) {
            if (out === null) {
               out = target.slice(0, i);
            }
         } else if (other.type.excludes(this.type)) {
            return target;
         } else {
            if (!placed && other.type.rank > this.type.rank) {
               if (out === null) {
                  out = target.slice(0, i);
               }
               out.push(this);
               placed = true;
            }
            if (out !== null) {
               out.push(other);
            }
         }
      }
      if (out === null) {
         out = target.slice();
      }
      if (!placed) {
         out.push(this);
      }
      return out;
   }

   /**
    * Remove this mark from the given set, returning a new set. If this mark is
    * not in the set, the set itself is returned.
    */
   removeFromSet(set: Mark[]): Mark[] {
      for (let i = 0; i < set.length; i++) {
         if (this.equals(set[i])) {
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
         if (this.equals(set[i])) {
            return true;
         }
      }
      return false;
   }

   /**
    * Test whether this mark has the same type and attributes as another mark.
    */
   equals(other: Mark): boolean {
      return (
         this === other ||
         (this.type == other.type && compareDeep(this.attrs, other.attrs))
      );
   }

   /** Maintain old method name for ProseMirror compatibility */
   eq = this.equals;

   /**
    * Convert this mark to a JSON-serializeable representation.
    */
   toJSON(): MarkJSON {
      const out: MarkJSON = {
         type: this.type.name,
         attrs: Object.create(null)
      };

      for (let _ in this.attrs) {
         // TODO: what is this doing?
         out.attrs = this.attrs;
         break;
      }
      return out;
   }

   static fromJSON(schema: Schema, json?: MarkJSON): Mark {
      if (!is.value<MarkJSON>(json)) {
         throw new RangeError('Invalid input for Mark.fromJSON');
      }
      const type = schema.marks[json.type];

      if (type === undefined) {
         throw new RangeError(
            `There is no mark type ${json.type} in this schema`
         );
      }
      return type.create(json.attrs);
   }

   /**
    * Whether two sets of marks are identical. This will return `false` if the
    * lists have the same marks but in a different order.
    */
   static areEqual(m1: Mark[], m2: Mark[]): boolean {
      if (m1 === m2) {
         return true;
      }
      if (m1.length != m2.length) {
         return false;
      }
      for (let i = 0; i < m1.length; i++) {
         if (!m1[i].equals(m2[i])) {
            return false;
         }
      }
      return true;
   }

   /**
    * Create a rank-sorted mark list from null, a single mark, or an unsorted
    * array of marks.
    */
   static setFrom(marks?: Mark[] | Mark | null): Mark[] {
      if (!is.value<Mark>(marks)) {
         return Mark.empty;
      }

      if (is.array<Mark>(marks)) {
         if (marks.length == 0) {
            return Mark.empty;
         }
         const copy = marks.slice();
         copy.sort((m1, m2) => m1.type.rank - m2.type.rank);
         return copy;
      }
      return [marks];
   }

   /**
    * The empty set of marks.
    */
   static empty: Mark[] = [];
}
