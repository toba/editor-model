import { Position } from '../position/position';
import { EditorNode } from './node';

/**
 * Represents a flat range of content, i.e. one that starts and ends in the same
 * node.
 */
export class NodeRange {
   /**
    * A resolved position along the start of the content. May have a `depth`
    * greater than this object's `depth` property, since these are the positions
    * that were used to compute the range, not re-resolved positions directly at
    * its boundaries.
    */
   from: Position;
   /**
    * A position along the end of the content. See caveat for
    * [`from`](#model.NodeRange.$from)
    */
   to: Position;
   /** The depth of the node that this range points into */
   depth: number;

   /**
    * Construct a node range. `from` and `to` should point into the same node
    * until at least the given `depth`, since a node range denotes an adjacent
    * set of nodes in a single parent node.
    */
   constructor(from: Position, to: Position, depth: number) {
      this.from = from;
      this.to = to;
      this.depth = depth;
   }

   /**
    * The position at the start of the range.
    */
   get start(): number {
      return this.from.before(this.depth + 1);
   }

   /**
    * The position at the end of the range.
    */
   get end(): number {
      return this.to.after(this.depth + 1);
   }

   /**
    * The parent node that the range points into.
    */
   get parent(): EditorNode {
      return this.from.node(this.depth);
   }

   /**
    * The start index of the range in the parent node.
    */
   get startIndex(): number {
      return this.from.index(this.depth);
   }

   /**
    * The end index of the range in the parent node.
    */
   get endIndex(): number {
      return this.to.indexAfter(this.depth);
   }
}
