import { is } from '@toba/tools';
import { compareDeep } from './compare-deep';
import { MarkType } from './mark-type';
import { AttributeMap } from './attribute';
import { Schema } from './schema';

export interface MarkJSON {
   type: string;
   attrs: AttributeMap;
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
      if (!copy) {
         copy = set.slice();
      }
      if (!placed) {
         copy.push(this);
      }

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
         this === other ||
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
      const type = schema.marks.get(json.type);

      if (type === undefined)
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
      if (!is.value<Mark>(marks)) {
         return Mark.none;
      }

      if (is.array<Mark>(marks)) {
         if (marks.length == 0) {
            return Mark.none;
         }
         const copy = marks.slice();
         copy.sort((a, b) => a.type.rank - b.type.rank);
         return copy;
      }
      return [marks];
   }

   /**
    * The empty set of marks.
    */
   static none: Mark[] = [];
}
