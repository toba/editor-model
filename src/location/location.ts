import { TrioList, makeTrioList } from '@toba/tools';
import { Mark } from '../mark/mark';
import { EditorNode, NodeRange } from '../node';

const cache: Location[] = [];
let cacheIndex = 0;
let cacheSize = 12;

/**
 * You can `EditorNode.resolve()` a position to get more information about it.
 * Objects of this class represent such a resolved position, providing
 * various pieces of context information, and some helper methods.
 *
 * Throughout this interface, methods that take an optional `depth` parameter
 * will interpret undefined as `this.depth` and negative numbers as
 * `this.depth + value`.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/resolvedpos.js
 */
export class Location {
   /** Position that was resolved */
   pos: number;
   /** `EditorNode`, index and offset */
   path: TrioList<EditorNode, number, number>;
   /**
    * Zero-based number of levels the parent node is from the root. If this
    * position points directly into the root node, it is 0. If it points into a
    * top-level paragraph, 1, and so on.
    */
   depth: number;
   /** Offset this position has into its parent node */
   parentOffset: number;

   constructor(
      pos: number,
      path: TrioList<EditorNode, number, number>,
      parentOffset: number
   ) {
      this.pos = pos;
      this.path = path;
      this.depth = path.size() - 1;
      this.parentOffset = parentOffset;
   }

   resolveDepth(d?: number): number {
      if (d === undefined) {
         return this.depth;
      }
      return d < 0 ? this.depth + d : d;
   }

   /**
    * The parent node that the position points into. Note that even if a
    * position points into a text node, that node is not considered the
    * parent—text nodes are ‘flat’ in this model, and have no content.
    */
   get parent(): EditorNode {
      return this.node(this.depth);
   }

   /**
    * The root node in which the position was resolved.
    */
   get doc(): EditorNode {
      return this.node(0);
   }

   /**
    * The ancestor node at the given level. `p.node(p.depth)` is the same as
    * `p.parent`. An exception is thrown if the depth is out or range.
    */
   node = (depth: number = this.depth): EditorNode => {
      const d = this.resolveDepth(depth);
      if (d < 0 || d >= this.path.size()) {
         throw new RangeError(`Depth ${d} is out of range`);
      }
      return this.path.item(d)![0];
   };

   /**
    * The index into the ancestor at the given level. If this points at the 3rd
    * node in the 2nd paragraph on the top level, for example, `p.index(0)` is 2
    * and `p.index(1)` is 3.
    */
   index = (depth?: number): number => {
      const d = this.resolveDepth(depth);
      return this.path.size() > d ? this.path.item(d)![1] : -1;
   };

   /**
    * The index pointing after this position into the ancestor at the given
    * level.
    */
   indexAfter(depth?: number): number {
      depth = this.resolveDepth(depth);
      return (
         this.index(depth) + (depth == this.depth && !this.textOffset ? 0 : 1)
      );
   }

   /**
    * The (absolute) position at the start of the node at the given level.
    */
   start(depth?: number): number {
      const d = this.resolveDepth(depth);
      return d == 0 || d >= this.path.size() ? 0 : this.path.item(d)![1] + 1;
   }

   /**
    * The (absolute) position at the end of the node at the given level.
    */
   end(depth?: number): number {
      const d = this.resolveDepth(depth);
      const node = this.node(d);
      return this.start(d) + node.content.size;
   }

   /**
    * The (absolute) position directly before the wrapping node at the given
    * level, or, when `depth` is `this.depth + 1`, the original position.
    */
   before(depth?: number): number {
      const d = this.resolveDepth(depth);
      if (d == 0 || d > this.path.size()) {
         throw new RangeError('There is no position before the top-level node');
      }
      return d == this.depth + 1 ? this.pos : this.path.item(d)![1];
   }

   /**
    * The (absolute) position directly after the wrapping node at the given
    * level, or the original position when `depth` is `this.depth + 1`.
    */
   after(depth?: number): number {
      const d = this.resolveDepth(depth);
      if (d == 0 || d > this.path.size()) {
         throw new RangeError('There is no position after the top-level node');
      }
      return d == this.depth + 1
         ? this.pos
         : this.path.item(d - 1)![2] + this.path.item(d)![0].size;
   }

   /**
    * When this position points into a text node, this returns the distance
    * between the position and the start of the text node. Will be zero for
    * positions that point between nodes.
    */
   get textOffset(): number {
      const pathEnd = this.path.lastItem();
      if (pathEnd === undefined) {
         throw Error('Cannot compute text offset for undefined path');
      }
      return this.pos - pathEnd[2];
   }

   /**
    * Get the node directly after the position, if any. If the position points
    * into a text node, only the part of that node after the position is
    * returned.
    */
   get nodeAfter(): EditorNode | undefined {
      const parent = this.parent;
      const index = this.index(this.depth);

      if (index == parent.childCount) {
         return undefined;
      }
      const pathEnd = this.path.lastItem();

      if (pathEnd === undefined) {
         throw Error('Cannot compute next node for undefined path');
      }
      const dOff = this.pos - pathEnd[2];
      const child = parent.child(index);

      return dOff ? parent.child(index).cut(dOff) : child;
   }

   /**
    * Get the node directly before the position, if any. If the position points
    * into a text node, only the part of that node before the position is
    * returned.
    */
   get nodeBefore(): EditorNode | undefined {
      const index = this.index(this.depth);
      const pathEnd = this.path.lastItem();

      if (pathEnd === undefined) {
         throw Error('Cannot compute previous node for undefined path');
      }
      let dOff = this.pos - pathEnd[2];

      if (dOff != 0) {
         return this.parent.child(index).cut(0, dOff);
      }
      return index == 0 ? undefined : this.parent.child(index - 1);
   }

   /**
    * Get the marks at this position, factoring in the surrounding marks'
    * [`inclusive`](#model.MarkSpec.inclusive) property. If the position is at
    * the start of a non-empty node, the marks of the node after it (if any) are
    * returned.
    */
   marks(): Mark[] {
      const parent = this.parent;
      const index = this.index();

      // In an empty parent, return the empty array
      if (parent.content.size == 0) {
         return Mark.empty;
      }

      // When inside a text node, just return the text node's marks
      if (this.textOffset) {
         return parent.child(index).marks;
      }

      let main = parent.maybeChild(index - 1);
      let other = parent.maybeChild(index);

      // If the `after` flag is true of there is no node before, make the node
      // after this position the main reference.
      if (main === undefined) {
         let tmp = main;
         main = other;
         other = tmp;
      }

      // Use all marks in the main node, except those that have `inclusive` set
      // to false and are not present in the other node.
      let marks = main === undefined ? [] : main.marks;

      for (var i = 0; i < marks.length; i++)
         if (
            marks[i].type.spec.inclusive === false &&
            (!other || !marks[i].isIn(other.marks))
         )
            marks = marks[i--].removeFrom(marks);

      return marks;
   }

   /**
    * Get the marks after the current position, if any, except those that are
    * non-inclusive and not present at position `end`. This is mostly useful for
    * getting the set of marks to preserve after a deletion. Will return `null`
    * if this position is at the end of its parent node or its parent node isn't
    * a textblock (in which case no marks should be preserved).
    */
   marksAcross(end: Location): Mark[] | null {
      const after = this.parent.maybeChild(this.index());

      if (after === undefined || !after.isInline) {
         return null;
      }
      let marks: Mark[] = after.marks;
      let next: EditorNode | undefined = end.parent.maybeChild(end.index());

      for (let i = 0; i < marks.length; i++) {
         if (
            marks[i].type.spec.inclusive === false &&
            (!next || !marks[i].isIn(next.marks))
         ) {
            marks = marks[i--].removeFrom(marks);
         }
      }
      return marks;
   }

   /**
    * The depth up to which this position and the given (non-resolved) position
    * share the same parent nodes.
    */
   sharedDepth(pos: number): number {
      for (let depth = this.depth; depth > 0; depth--) {
         if (this.start(depth) <= pos && this.end(depth) >= pos) {
            return depth;
         }
      }
      return 0;
   }

   /**
    * Returns a range based on the place where this position and the given
    * position diverge around block content. If both point into the same
    * textblock, for example, a range around that textblock will be returned. If
    * they point into different blocks, the range around those blocks in their
    * shared ancestor is returned.
    *
    * @param pred optional predicate that will be called with a parent node to
    * see if a range into that parent is acceptable
    */
   blockRange(
      other: Location = this,
      pred?: (node: EditorNode | undefined) => boolean
   ): NodeRange | null {
      if (other.pos < this.pos) {
         return other.blockRange(this);
      }
      for (
         let d =
            this.depth -
            (this.parent.inlineContent || this.pos == other.pos ? 1 : 0);
         d >= 0;
         d--
      ) {
         if (
            other.pos <= this.end(d) &&
            (pred === undefined || pred(this.node(d)))
         ) {
            return new NodeRange(this, other, d);
         }
      }
      return null;
   }

   /**
    * Whether given position has the same parent node.
    */
   sameParent = (other: Location): boolean =>
      this.pos - this.parentOffset == other.pos - other.parentOffset;

   /**
    * Return the greater of this and another position.
    */
   max = (other: Location): Location => (other.pos > this.pos ? other : this);

   /**
    * Return the smaller of this and another position.
    */
   min = (other: Location): Location => (other.pos < this.pos ? other : this);

   toString(): string {
      let str = '';

      for (let i = 1; i <= this.depth; i++) {
         const n = this.node(i);
         if (n !== undefined) {
            str += (str ? '/' : '') + n.type.name + '_' + this.index(i - 1);
         }
      }
      return str + ':' + this.parentOffset;
   }

   static resolve(doc: EditorNode, pos: number): Location {
      if (pos < 0 || pos > doc.content.size) {
         throw new RangeError('Position ' + pos + ' is out of range');
      }
      const path: TrioList<EditorNode, number, number> = makeTrioList();
      let start = 0;
      let parentOffset = pos;

      for (let node = doc; ; ) {
         const { index, offset } = node.content.findIndex(parentOffset);
         let remaining: number = parentOffset - offset;

         path.push(node, index, start + offset);

         if (!remaining) {
            break;
         }
         node = node.child(index);

         if (node.isText) {
            break;
         }
         parentOffset = remaining - 1;
         start += offset + 1;
      }
      return new Location(pos, path, parentOffset);
   }

   static resolveCached(doc: EditorNode, pos: number): Location {
      for (let i = 0; i < cache.length; i++) {
         const cached: Location = cache[i];
         if (cached.pos == pos && cached.doc === doc) {
            return cached;
         }
      }
      const result = Location.resolve(doc, pos);

      cache[cacheIndex] = result;
      cacheIndex = (cacheIndex + 1) % cacheSize;

      return result;
   }
}
