import { Fragment } from './fragment';
import { Schema } from '../schema/schema';
import { NodeJSON, EditorNode } from './node';

export interface SliceJSON {
   content: NodeJSON[] | null;
   openStart?: number;
   openEnd?: number;
}

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/replace.js#L96
 */
function removeRange(content: Fragment, from: number, to: number): Fragment {
   const { index, offset } = content.findIndex(from);
   const child = content.maybeChild(index);
   const { index: indexTo, offset: offsetTo } = content.findIndex(to);

   if (offset == from || (child !== undefined && child.isText)) {
      if (offsetTo != to && !content.child(indexTo).isText) {
         throw new RangeError('Removing non-flat range');
      }
      return content.cut(0, from).append(content.cut(to));
   }

   if (index != indexTo) {
      throw new RangeError('Removing non-flat range');
   }

   if (child === undefined) {
      throw new RangeError('No child node found in range');
   }

   return content.replaceChild(
      index,
      child.copy(removeRange(child.content, from - offset - 1, to - offset - 1))
   );
}

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/replace.js#L107
 */
function insertInto(
   content: Fragment,
   dist: number,
   insert: Fragment,
   parent?: EditorNode
): Fragment | null {
   const { index, offset } = content.findIndex(dist);
   const child = content.maybeChild(index);

   if (offset == dist || (child !== undefined && child.isText)) {
      if (parent && !parent.canReplace(index, index, insert)) {
         return null;
      }
      return content
         .cut(0, dist)
         .append(insert)
         .append(content.cut(dist));
   }

   if (child === undefined) {
      // TODO: this isn't handled in the ProseMirror analogue
      return null;
   }

   const inner = insertInto(child.content, dist - offset - 1, insert);

   return inner === null
      ? null
      : content.replaceChild(index, child.copy(inner));
}

/**
 * A slice represents a piece cut out of a larger document. It stores not only
 * a fragment, but also the depth up to which nodes on both side are ‘open’
 * (cut through).
 */
export class Slice {
   content: Fragment;
   /** The open depth at the start */
   openStart: number;
   /** The open depth at the end */
   openEnd: number;

   /**
    * Create a slice. When specifying a non-zero open depth, you must make sure
    * that there are nodes of at least that depth at the appropriate side of the
    * fragment — i.e. if the fragment is an empty paragraph node, `openStart`
    * and `openEnd` can't be greater than 1.
    *
    * It is not necessary for the content of open nodes to conform to the
    * schema's content constraints, though it should be a valid start/end/middle
    * for such a node, depending on which sides are open.
    */
   constructor(content: Fragment, openStart: number, openEnd: number) {
      this.content = content;
      this.openStart = openStart;
      this.openEnd = openEnd;
   }

   /**
    * The size this slice would add when inserted into a document.
    */
   get size(): number {
      return this.content.size - this.openStart - this.openEnd;
   }

   insertAt(pos: number, fragment: Fragment) {
      const content = insertInto(this.content, pos + this.openStart, fragment);
      return content && new Slice(content, this.openStart, this.openEnd);
   }

   removeBetween = (from: number, to: number): Slice =>
      new Slice(
         removeRange(this.content, from + this.openStart, to + this.openStart),
         this.openStart,
         this.openEnd
      );

   /**
    * Tests whether this slice is equal to another slice.
    */
   equals = (other: Slice): boolean =>
      this.content.equals(other.content) &&
      this.openStart == other.openStart &&
      this.openEnd == other.openEnd;

   // Maintain old name for ProseMirror compatibility
   eq = this.equals;

   toString = () =>
      this.content + '(' + this.openStart + ',' + this.openEnd + ')';

   /**
    * Convert a slice to a JSON-serializable representation.
    */
   toJSON(): SliceJSON | null {
      if (!this.content.size) {
         return null;
      }
      const json: SliceJSON = { content: this.content.toJSON() };

      if (this.openStart > 0) {
         json.openStart = this.openStart;
      }
      if (this.openEnd > 0) {
         json.openEnd = this.openEnd;
      }
      return json;
   }

   /**
    * Deserialize a slice from its JSON representation.
    */
   static fromJSON(schema: Schema, json?: SliceJSON) {
      if (json === undefined) {
         return Slice.empty;
      }
      const openStart = json.openStart || 0;
      const openEnd = json.openEnd || 0;

      if (typeof openStart != 'number' || typeof openEnd != 'number') {
         throw new RangeError('Invalid input for Slice.fromJSON');
      }

      return new Slice(
         Fragment.fromJSON(schema, json.content),
         json.openStart || 0,
         json.openEnd || 0
      );
   }

   /**
    * Create a slice from a fragment by taking the maximum possible open value
    * on both sides of the fragment.
    */
   static maxOpen(fragment: Fragment, openIsolating = true): Slice {
      let openStart = 0;
      let openEnd = 0;
      let n: EditorNode | null;

      /** Whether valid to continue traversing the node */
      const valid = (n: EditorNode | null): boolean =>
         n !== null && !n.isLeaf && (openIsolating || !n.type.spec.isolating);

      for (n = fragment.firstChild; valid(n); n = n!.firstChild) {
         openStart++;
      }

      for (n = fragment.lastChild; valid(n); n = n!.lastChild) {
         openEnd++;
      }
      return new Slice(fragment, openStart, openEnd);
   }

   static empty = new Slice(Fragment.empty, 0, 0);
}
