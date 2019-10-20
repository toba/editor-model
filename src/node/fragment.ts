import { is, forEach } from '@toba/tools';
import { EditorNode, NodeJSON, PerNodeCallback } from './node';
import { Schema } from '../schema';
import { TextNode } from './text';

export type FragmentJSON = NodeJSON[];

interface FragmentIndex {
   index: number;
   offset: number;
}

/** Last found index */
const found: FragmentIndex = { index: 0, offset: 0 };

function setIndex(index: number, offset: number): FragmentIndex {
   found.index = index;
   found.offset = offset;
   return found;
}

/**
 * A fragment represents a node's collection of child nodes.
 *
 * Like nodes, fragments are persistent data structures, and you should not
 * mutate them or their content. Rather, you create new instances whenever
 * needed. The API tries to make this easy.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/fragment.js
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
            this.size += content[i].size;
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
      fn: PerNodeCallback,
      nodeStart = 0,
      parent?: EditorNode
   ) {
      for (let i = 0, pos = 0; pos < to; i++) {
         let child = this.content[i];
         let end = pos + child.size;
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
   forEachDescendant(fn: PerNodeCallback) {
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
               text += (node as TextNode).text.slice(
                  Math.max(from, pos) - pos,
                  to - pos
               );
               separated = !blockSeparator;
            } else if (node.isLeaf && leafText !== undefined) {
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
   append(other?: Fragment): Fragment {
      if (other === undefined || other.size == 0) {
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
    * Cut out the sub-fragment between the given positions.
    */
   cut(from: number, to?: number): Fragment {
      if (to === undefined) {
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
            const end = pos + child.size;

            if (end > from) {
               if (pos < from || end > to) {
                  if (child.isText)
                     child = child.cut(
                        Math.max(0, from - pos),
                        Math.min((child as TextNode).text.length, to - pos)
                     );
                  else
                     child = child.cut(
                        Math.max(0, from - pos - 1),
                        Math.min(child.content.size, to - pos - 1)
                     );
               }
               result.push(child);
               size += child.size;
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
      const size = this.size + node.size - current.size;

      copy[index] = node;

      return new Fragment(copy, size);
   }

   /**
    * Create a new fragment by prepending the given node to this fragment.
    */
   addToStart = (node: EditorNode): Fragment =>
      new Fragment([node].concat(this.content), this.size + node.size);

   /**
    * Create a new fragment by appending the given node to this fragment.
    */
   addToEnd = (node: EditorNode): Fragment =>
      new Fragment(this.content.concat(node), this.size + node.size);

   /**
    * Compare this fragment to another one.
    */
   equals(other: Fragment): boolean {
      if (this.content.length != other.content.length) {
         return false;
      }
      for (let i = 0; i < this.content.length; i++) {
         if (!this.content[i].equals(other.content[i])) {
            return false;
         }
      }
      return true;
   }

   /** Retain old name for ProseMirror compatibility */
   eq = this.equals;

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
    * Number of child nodes in this fragment.
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
    * Invoke callback for every child node, passing the node, its parent offset
    * and index.
    */
   forEachChild(fn: (node: EditorNode, offset: number, index: number) => void) {
      for (let i = 0, p = 0; i < this.content.length; i++) {
         const child = this.content[i];
         fn(child, p, i);
         p += child.size;
      }
   }

   /**
    * Retain old name for ProseMirror compatibility
    * @deprecated
    */
   forEach = this.forEachChild;

   /**
    * Find the first position at which this fragment and another fragment
    * differ, or `undefined` if they are the same.
    */
   findDiffStart = (other: Fragment, pos = 0): number | undefined =>
      findDiffStart(this, other, pos);

   /**
    * Find the first position, searching from the end, at which this fragment
    * and the given fragment differ, or `undefined` if they are the same. Since
    * this position will not be the same in both nodes, an object with two
    * separate positions is returned.
    */
   findDiffEnd = (
      other: Fragment,
      pos = this.size,
      otherPos = other.size
   ): { a: number; b: number } | undefined =>
      findDiffEnd(this, other, pos, otherPos);

   /**
    * Find the index and inner offset corresponding to a given relative
    * position in this fragment. The result object will be reused (overwritten)
    * the next time the function is called.
    */
   findIndex(pos: number, round = -1): FragmentIndex {
      if (pos == 0) {
         return setIndex(0, pos);
      }
      if (pos == this.size) {
         return setIndex(this.content.length, pos);
      }
      if (pos > this.size || pos < 0) {
         throw new RangeError(`Position ${pos} outside of fragment (${this})`);
      }
      for (let i = 0, curPos = 0; ; i++) {
         const node: EditorNode = this.child(i);
         const end = curPos + node.size;

         if (end >= pos) {
            if (end == pos || round > 0) {
               return setIndex(i + 1, end);
            }
            return setIndex(i, curPos);
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
      if (!is.value<FragmentJSON>(value)) {
         return Fragment.empty;
      }
      if (!is.array<NodeJSON>(value)) {
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

      forEach(nodes, (node, i) => {
         size += node.size;

         if (i > 0 && node.isText && nodes[i - 1].sameMarkup(node)) {
            if (joined === null) {
               joined = nodes.slice(0, i);
            }
            joined[joined.length - 1] = (node as TextNode).withText(
               (joined[joined.length - 1] as TextNode).text +
                  (node as TextNode).text
            );
         } else if (joined !== null) {
            joined.push(node);
         }
      });

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
         return new Fragment([nodes], nodes.size);
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

export function findDiffStart(
   a: Fragment,
   b: Fragment,
   pos: number
): number | undefined {
   for (let i = 0; ; i++) {
      if (i == a.childCount || i == b.childCount) {
         return a.childCount == b.childCount ? undefined : pos;
      }
      const childA = a.child(i);
      const childB = b.child(i);

      if (childA === childB) {
         pos += childA.size;
         continue;
      }

      if (!childA.sameMarkup(childB)) {
         return pos;
      }

      if (childA.isText) {
         const textNodeA = childA as TextNode;
         const textNodeB = childB as TextNode;

         if (textNodeA.text != textNodeB.text) {
            for (let j = 0; textNodeA.text[j] == textNodeB.text[j]; j++) {
               pos++;
            }
            return pos;
         }
      }
      if (childA.content.size || childB.content.size) {
         const inner = findDiffStart(childA.content, childB.content, pos + 1);
         if (inner !== undefined) {
            return inner;
         }
      }
      pos += childA.size;
   }
}

export function findDiffEnd(
   a: Fragment,
   b: Fragment,
   posA: number,
   posB: number
): { a: number; b: number } | undefined {
   for (let iA = a.childCount, iB = b.childCount; ; ) {
      if (iA == 0 || iB == 0) {
         return iA == iB ? undefined : { a: posA, b: posB };
      }
      const childA = a.child(--iA);
      const childB = b.child(--iB);
      const size = childA.size;

      if (childA == childB) {
         posA -= size;
         posB -= size;
         continue;
      }

      if (!childA.sameMarkup(childB)) {
         return { a: posA, b: posB };
      }

      if (childA.isText) {
         const textNodeA = childA as TextNode;
         const textNodeB = childB as TextNode;

         if (textNodeA.text != textNodeB.text) {
            let same = 0;
            const lengthA = textNodeA.text.length;
            const lengthB = textNodeB.text.length;
            const minSize = Math.min(lengthA, lengthB);

            while (
               same < minSize &&
               textNodeA.text[lengthA - same - 1] ==
                  textNodeB.text[lengthB - same - 1]
            ) {
               same++;
               posA--;
               posB--;
            }
            return { a: posA, b: posB };
         }
      }

      if (childA.content.size || childB.content.size) {
         let inner = findDiffEnd(
            childA.content,
            childB.content,
            posA - 1,
            posB - 1
         );
         if (inner) {
            return inner;
         }
      }
      posA -= size;
      posB -= size;
   }
}
