import { EditorNode, NodeJSON } from './node';
import { Schema } from './schema';
import { TextNode } from './text-node';

export type FragmentJSON = NodeJSON[];

/**
 * A fragment represents a node's collection of child nodes.
 *
 * Like nodes, fragments are persistent data structures, and you should not
 * mutate them or their content. Rather, you create new instances whenever
 * needed. The API tries to make this easy.
 */
export class Fragment {
   content: EditorNode[];
   /**
    * The size of the fragment, which is the total of the size of its content
    * nodes.
    */
   size: number;

   constructor(content: EditorNode[], size: number = 0) {
      this.content = content;
      this.size = size;

      if (size == null) {
         for (let i = 0; i < content.length; i++) {
            this.size += content[i].nodeSize;
         }
      }
   }

   /**
    * Invoke a callback for all descendant nodes between the given two positions
    * (relative to start of this fragment). Doesn't descend into a node when the
    * callback returns `false`.
    */
   forEachNodeBetween(
      from: number,
      to: number,
      fn: (
         node: EditorNode,
         start: number,
         parent?: EditorNode,
         index?: number
      ) => boolean | void,
      nodeStart = 0,
      parent?: EditorNode
   ) {
      for (let i = 0, pos = 0; pos < to; i++) {
         let child = this.content[i];
         let end = pos + child.nodeSize;
         if (
            end > from &&
            fn(child, nodeStart + pos, parent, i) !== false &&
            child.content.size
         ) {
            let start = pos + 1;
            child.forEachNodeBetween(
               Math.max(0, from - start),
               Math.min(child.content.size, to - start),
               fn,
               nodeStart + start
            );
         }
         pos = end;
      }
   }

   /**
    * Call the given callback for every descendant node. The callback may return
    * `false` to prevent traversal of a given node's children.
    */
   forEachDescendant(
      fn: (node: EditorNode, pos: number, parent: EditorNode) => boolean
   ) {
      this.forEachNodeBetween(0, this.size, fn);
   }

   textBetween(
      from: number,
      to: number,
      blockSeparator?: string,
      leafText?: string
   ) {
      let text = '';
      let separated = true;

      this.forEachNodeBetween(
         from,
         to,
         (node, pos) => {
            if (node.isText) {
               text += node.text.slice(Math.max(from, pos) - pos, to - pos);
               separated = !blockSeparator;
            } else if (node.isLeaf && leafText) {
               text += leafText;
               separated = !blockSeparator;
            } else if (!separated && node.isBlock) {
               text += blockSeparator;
               separated = true;
            }
         },
         0
      );
      return text;
   }

   /**
    * Create a new fragment containing the combined content of this fragment and
    * the other.
    */
   append(other: Fragment): Fragment {
      if (other.size == 0) {
         return this;
      }
      if (this.size == 0) {
         return other;
      }
      const last: EditorNode | null = this.lastChild;
      const first: EditorNode | null = other.firstChild;
      const content: (EditorNode | TextNode)[] = this.content.slice();
      let i = 0;

      if (
         last !== null &&
         first !== null &&
         last.isText &&
         last.sameMarkup(first)
      ) {
         const firstText = (first as unknown) as TextNode;
         const lastText = (last as unknown) as TextNode;
         content[content.length - 1] = lastText.withText(
            lastText.text + firstText.text
         );
         i = 1;
      }
      for (; i < other.content.length; i++) {
         content.push(other.content[i]);
      }
      return new Fragment(content, this.size + other.size);
   }

   /**
    * Cut out the sub-fragment between the two given positions.
    */
   cut(from: number, to?: number): Fragment {
      if (to == null) {
         to = this.size;
      }
      if (from == 0 && to == this.size) {
         return this;
      }
      let result = [];
      let size = 0;

      if (to > from) {
         for (let i = 0, pos = 0; pos < to; i++) {
            let child = this.content[i];
            const end = pos + child.nodeSize;

            if (end > from) {
               if (pos < from || end > to) {
                  if (child.isText)
                     child = child.cut(
                        Math.max(0, from - pos),
                        Math.min(child.text.length, to - pos)
                     );
                  else
                     child = child.cut(
                        Math.max(0, from - pos - 1),
                        Math.min(child.content.size, to - pos - 1)
                     );
               }
               result.push(child);
               size += child.nodeSize;
            }
            pos = end;
         }
      }
      return new Fragment(result, size);
   }

   cutByIndex(from: number, to: number): Fragment {
      if (from == to) {
         return Fragment.empty;
      }
      if (from == 0 && to == this.content.length) {
         return this;
      }
      return new Fragment(this.content.slice(from, to));
   }

   /**
    * Create a new fragment in which the node at the given index is replaced by
    * the given node.
    */
   replaceChild(index: number, node: EditorNode): Fragment {
      const current = this.content[index];
      if (current === node) {
         return this;
      }
      const copy = this.content.slice();
      const size = this.size + node.nodeSize - current.nodeSize;

      copy[index] = node;

      return new Fragment(copy, size);
   }

   /**
    * Create a new fragment by prepending the given node to this fragment.
    */
   addToStart = (node: EditorNode): Fragment =>
      new Fragment([node].concat(this.content), this.size + node.nodeSize);

   /**
    * Create a new fragment by appending the given node to this fragment.
    */
   addToEnd = (node: EditorNode): Fragment =>
      new Fragment(this.content.concat(node), this.size + node.nodeSize);

   /**
    * Compare this fragment to another one.
    */
   eq(other: Fragment): boolean {
      if (this.content.length != other.content.length) {
         return false;
      }
      for (let i = 0; i < this.content.length; i++) {
         if (!this.content[i].eq(other.content[i])) {
            return false;
         }
      }
      return true;
   }

   /**
    * The first child of the fragment, or `null` if it is empty.
    */
   get firstChild(): EditorNode | null {
      return this.content.length ? this.content[0] : null;
   }

   /**
    * The last child of the fragment, or `null` if it is empty.
    */
   get lastChild(): EditorNode | null {
      return this.content.length ? this.content[this.content.length - 1] : null;
   }

   /**
    * The number of child nodes in this fragment.
    */
   get childCount(): number {
      return this.content.length;
   }

   /**
    * Get the child node at the given index. Raise an error when the index is
    * out of range.
    */
   child(index: number): EditorNode {
      const found = this.content[index];
      if (!found) {
         throw new RangeError('Index ' + index + ' out of range for ' + this);
      }
      return found;
   }

   /**
    * Get the child node at the given index, if it exists.
    */
   maybeChild = (index: number): EditorNode | undefined => this.content[index];

   /**
    * Call `fn` for every child node, passing the node, its offset into this
    * parent node, and its index.
    */
   forEach(fn: (node: EditorNode, offset: number, index: number) => void) {
      for (let i = 0, p = 0; i < this.content.length; i++) {
         const child = this.content[i];
         fn(child, p, i);
         p += child.nodeSize;
      }
   }

   /**
    * Find the first position at which this fragment and another fragment
    * differ, or `null` if they are the same.
    */
   findDiffStart = (other: Fragment, pos = 0): number | null =>
      findDiffStart(this, other, pos);

   /**
    * Find the first position, searching from the end, at which this fragment
    * and the given fragment differ, or `null` if they are the same. Since this
    * position will not be the same in both nodes, an object with two separate
    * positions is returned.
    */
   findDiffEnd = (
      other: Fragment,
      pos = this.size,
      otherPos = other.size
   ): { a: number; b: number } | null =>
      findDiffEnd(this, other, pos, otherPos);

   /**
    * Find the index and inner offset corresponding to a given relative
    * position in this fragment. The result object will be reused (overwritten)
    * the next time the function is called. (Not public.)
    */
   findIndex(pos: number, round = -1): { index: number; offset: number } {
      if (pos == 0) {
         return retIndex(0, pos);
      }
      if (pos == this.size) return retIndex(this.content.length, pos);
      if (pos > this.size || pos < 0)
         throw new RangeError(`Position ${pos} outside of fragment (${this})`);
      for (let i = 0, curPos = 0; ; i++) {
         let cur = this.child(i),
            end = curPos + cur.nodeSize;
         if (end >= pos) {
            if (end == pos || round > 0) return retIndex(i + 1, end);
            return retIndex(i, curPos);
         }
         curPos = end;
      }
   }

   /**
    * Return a debugging string that describes this fragment.
    */
   toString = (): string => '<' + this.toStringInner() + '>';

   toStringInner = () => this.content.join(', ');

   /**
    * Ceate a JSON-serializeable representation of this fragment.
    */
   toJSON = (): FragmentJSON | null =>
      this.content.length ? this.content.map(n => n.toJSON()) : null;

   /**
    * Deserialize a fragment from its JSON representation.
    */
   static fromJSON(schema: Schema, value?: FragmentJSON | null): Fragment {
      if (!value) {
         return Fragment.empty;
      }
      if (!Array.isArray(value)) {
         throw new RangeError('Invalid input for Fragment.fromJSON');
      }
      return new Fragment(value.map(schema.nodeFromJSON));
   }

   /**
    * Build a fragment from an array of nodes. Ensures that adjacent text nodes
    * with the same marks are joined together.
    */
   static fromArray(nodes: EditorNode[]): Fragment {
      if (nodes.length == 0) {
         return Fragment.empty;
      }
      let joined: EditorNode[] | null = null;
      let size = 0;

      for (let i = 0; i < nodes.length; i++) {
         let node = nodes[i];
         size += node.nodeSize;

         if (i > 0 && node.isText && nodes[i - 1].sameMarkup(node)) {
            if (joined === null) {
               joined = nodes.slice(0, i);
            }
            joined[joined.length - 1] = node.withText(
               joined[joined.length - 1].text + node.text
            );
         } else if (joined !== null) {
            joined.push(node);
         }
      }
      return new Fragment(joined || nodes, size);
   }

   /**
    * Create a fragment from something that can be interpreted as a set of
    * nodes. For `null`, it returns the empty fragment. For a fragment, the
    * fragment itself. For a node or array of nodes, a fragment containing those
    * nodes.
    */
   static from(nodes?: Fragment | EditorNode | EditorNode[]): Fragment {
      if (nodes === undefined) {
         return Fragment.empty;
      }
      if (nodes instanceof Fragment) {
         return nodes;
      }
      if (Array.isArray(nodes)) {
         return this.fromArray(nodes);
      }
      if (nodes.attrs) {
         return new Fragment([nodes], nodes.nodeSize);
      }
      throw new RangeError(
         'Can not convert ' +
            nodes +
            ' to a Fragment' +
            (nodes.forEachNodeBetween
               ? ' (looks like multiple versions of prosemirror-model were loaded)'
               : '')
      );
   }

   /**
    * An empty fragment. Intended to be reused whenever a node doesn't contain
    * anything (rather than allocating a new empty fragment for each leaf node).
    */
   static empty = new Fragment([], 0);
}

const found = { index: 0, offset: 0 };
function retIndex(index: number, offset: number) {
   found.index = index;
   found.offset = offset;
   return found;
}

export function findDiffStart(
   a: Fragment,
   b: Fragment,
   pos: number
): number | null {
   for (let i = 0; ; i++) {
      if (i == a.childCount || i == b.childCount)
         return a.childCount == b.childCount ? null : pos;

      let childA = a.child(i),
         childB = b.child(i);
      if (childA == childB) {
         pos += childA.nodeSize;
         continue;
      }

      if (!childA.sameMarkup(childB)) return pos;

      if (childA.isText && childA.text != childB.text) {
         for (let j = 0; childA.text[j] == childB.text[j]; j++) pos++;
         return pos;
      }
      if (childA.content.size || childB.content.size) {
         let inner = findDiffStart(childA.content, childB.content, pos + 1);
         if (inner != null) return inner;
      }
      pos += childA.nodeSize;
   }
}

export function findDiffEnd(
   a: Fragment,
   b: Fragment,
   posA: number,
   posB: number
): { a: number; b: number } | null {
   for (let iA = a.childCount, iB = b.childCount; ; ) {
      if (iA == 0 || iB == 0) {
         return iA == iB ? null : { a: posA, b: posB };
      }
      const childA = a.child(--iA);
      const childB = b.child(--iB);
      const size = childA.nodeSize;

      if (childA == childB) {
         posA -= size;
         posB -= size;
         continue;
      }

      if (!childA.sameMarkup(childB)) {
         return { a: posA, b: posB };
      }

      if (childA.isText && childA.text != childB.text) {
         let same = 0;
         const minSize = Math.min(childA.text.length, childB.text.length);

         while (
            same < minSize &&
            childA.text[childA.text.length - same - 1] ==
               childB.text[childB.text.length - same - 1]
         ) {
            same++;
            posA--;
            posB--;
         }
         return { a: posA, b: posB };
      }
      if (childA.content.size || childB.content.size) {
         let inner = findDiffEnd(
            childA.content,
            childB.content,
            posA - 1,
            posB - 1
         );
         if (inner) return inner;
      }
      posA -= size;
      posB -= size;
   }
}
