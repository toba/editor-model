import { is } from '@toba/tools';
import { Fragment, FragmentJSON } from './fragment';
import { Mark, MarkJSON, MarkType } from '../mark';
import { NodeType } from './type';
import { Attributes } from './attribute';
import { Slice } from './slice';
import { Position, replace } from '../position/';
import { compareDeep } from '../compare-deep';
import { ContentMatch } from '../match/content';
import { Schema } from '../schema/schema';
import { TextNode } from './text';

const emptyAttrs: Attributes = Object.create(null);

interface NodeMatch {
   node?: EditorNode | null;
   index: number;
   offset: number;
}

/**
 * Method that may be called by `forEachNode*` or similar.
 */
export type PerNodeCallback = (
   node: EditorNode,
   pos: number,
   parent?: EditorNode,
   index?: number
) => boolean | void;

export interface NodeJSON {
   type: string;
   text?: string;
   attrs?: Attributes;
   content?: FragmentJSON | null;
   marks?: MarkJSON[];
}

/**
 * This class represents a node in the tree that makes up a document. So a
 * document is an instance of `EditorNode`, with children that are also
 * instances of `EditorNode`.
 *
 * Nodes are persistent data structures. Instead of changing them, you create
 * new ones with the content you want. Old ones keep pointing at the old
 * document shape. This is made cheaper by sharing structure between the old and
 * new data as much as possible, which a tree shape like this (without back
 * pointers) makes easy.
 *
 * **Do not** directly mutate the properties of an `EditorNode` object. See
 * [the guide](/docs/guide/#doc) for more information.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/node.js
 */
export class EditorNode {
   readonly type: NodeType;
   /** Node's children */
   readonly content: Fragment;
   /**
    * The marks (things like whether it is emphasized or part of a link) applied
    * to this node.
    */
   readonly marks: Mark[];
   /**
    * An object mapping attribute names to values. The kind of attributes
    * allowed and required are [determined](#model.NodeSpec.attrs) by the node
    * type.
    */
   readonly attrs: Attributes;

   constructor(
      type: NodeType,
      attrs?: Attributes,
      content?: Fragment,
      marks?: Mark[]
   ) {
      this.type = type;
      this.attrs = attrs === undefined ? emptyAttrs : attrs;
      this.content = content === undefined ? Fragment.empty : content;
      this.marks = marks === undefined ? Mark.empty : marks;
   }

   /**
    * Size of this node as defined by the integer-based
    * [indexing scheme](https://prosemirror.net/docs/guide/#doc.indexing). For
    * text nodes, this is the amount of characters. For other leaf nodes, it is
    * one. For non-leaf nodes, it is the size of the content plus two (the start
    * and end token).
    */
   get size(): number {
      return this.isLeaf ? 1 : 2 + this.content.size;
   }

   /**
    * Number of children the node has.
    */
   get childCount(): number {
      return this.content.childCount;
   }

   /**
    * Get the child node at the given index. Raises an error when the index is
    * out of range.
    */
   child = (index: number): EditorNode => this.content.child(index);

   /**
    * Get the child node at the given index or `undefined` if none exists at
    * the index.
    */
   maybeChild = (index: number): EditorNode | undefined =>
      this.content.maybeChild(index);

   /**
    * Call `fn` for every child node, passing the node, its offset into this
    * parent node, and its index.
    */
   forEach(fn: (node: EditorNode, offset: number, index: number) => void) {
      this.content.forEachChild(fn);
   }

   /**
    * Invoke a callback for all descendant nodes recursively between the given
    * two positions that are relative to start of this node's content.
    *
    * The callback is invoked with the node, its parent-relative position, its
    * parent node, and its child index. When the callback returns false for a
    * given node, that node's children will not be recursed over. The last
    * parameter can be used to specify a starting position to count from.
    */
   forEachNodeBetween(
      from: number,
      to: number,
      fn: PerNodeCallback,
      startPos = 0
   ) {
      this.content.forEachNodeBetween(from, to, fn, startPos, this);
   }

   /**
    * Call the given callback for every descendant node. Doesn't descend into a
    * node when the callback returns `false`.
    */
   forEachDescendant(fn: PerNodeCallback) {
      this.forEachNodeBetween(0, this.content.size, fn);
   }

   // Maintain old name for ProseMirror compatibility
   descendants = this.forEachDescendant;

   /**
    * Concatenates all the text nodes found in this fragment and its children.
    */
   get textContent(): string {
      return this.textBetween(0, this.content.size, '');
   }

   /**
    * Get all text between positions `from` and `to`. When `blockSeparator` is
    * given, it will be inserted whenever a new block node is started. When
    * `leafText` is given, it'll be inserted for every non-text leaf node
    * encountered.
    */
   textBetween = (
      from: number,
      to: number,
      blockSeparator?: string,
      leafText?: string
   ): string => this.content.textBetween(from, to, blockSeparator, leafText);

   /**
    * Returns this node's first child, or `null` if there are no children.
    */
   get firstChild(): EditorNode | null {
      return this.content.firstChild;
   }

   /**
    * Returns this node's last child, or `null` if there are no children.
    */
   get lastChild(): EditorNode | null {
      return this.content.lastChild;
   }

   /**
    * Test whether two nodes represent the same piece of document.
    */
   equals = (other: EditorNode): boolean =>
      this === other ||
      (this.sameMarkup(other) && this.content.equals(other.content));

   /**
    * Maintain old method name for ProseMirror compatibility.
    */
   eq = this.equals;

   /**
    * Compare the markup (type, attributes, and marks) of this node to those of
    * another. Returns `true` if both have the same markup.
    */
   sameMarkup = (other: EditorNode): boolean =>
      this.hasMarkup(other.type, other.attrs, other.marks);

   /**
    * Whether this node has the given type, attributes, and marks.
    */
   hasMarkup = (type: NodeType, attrs?: Attributes, marks?: Mark[]): boolean =>
      this.type === type &&
      compareDeep(this.attrs, attrs || type.defaultAttrs || emptyAttrs) &&
      Mark.areEqual(this.marks, marks || Mark.empty);

   /**
    * Create a new node with the same markup as this node, containing the given
    * content (or empty, if no content is given).
    */
   copy = (content?: Fragment): this =>
      content === this.content
         ? this
         : (new EditorNode(this.type, this.attrs, content, this.marks) as this);

   /**
    * Create a copy of this node with the given set of marks instead of the
    * current marks.
    */
   withMarks = (marks: Mark[]): this =>
      marks === this.marks
         ? this
         : (new EditorNode(this.type, this.attrs, this.content, marks) as this);

   /**
    * Create a copy of this node with only the content between the given
    * positions. If `to` is not given, it defaults to the end of the node.
    */
   cut = (from: number, to?: number): this =>
      from == 0 && to == this.content.size
         ? this
         : this.copy(this.content.cut(from, to));

   /**
    * Cut out the part of the document between the given positions, and return
    * it as a `Slice` object.
    */
   slice(from: number, to = this.content.size, includeParents = false): Slice {
      if (from == to) {
         return Slice.empty;
      }
      const fromPos: Position = this.resolve(from);
      const toPos: Position = this.resolve(to);
      const depth: number = includeParents ? 0 : fromPos.sharedDepth(to);
      const node: EditorNode | undefined = fromPos.node(depth);

      if (node == undefined) {
         return Slice.empty;
      }
      const start: number = fromPos.start(depth);
      const content = node.content.cut(fromPos.pos - start, toPos.pos - start);

      return new Slice(content, fromPos.depth - depth, toPos.depth - depth);
   }

   /**
    * Replace the part of the document between the given positions with the
    * given slice. The slice must 'fit', meaning its open sides must be able to
    * connect to the surrounding content, and its content nodes must be valid
    * children for the node they are placed into. If any of this is violated, an
    * error of type [`ReplaceError`](#model.ReplaceError) is thrown.
    */
   replace = (from: number, to: number, slice: Slice): EditorNode =>
      replace(this.resolve(from), this.resolve(to), slice);

   /**
    * Find the node directly after the given position.
    */
   nodeAt(pos: number): EditorNode | null {
      let node: EditorNode | undefined;

      for (node = this; ; ) {
         let { index, offset } = node.content.findIndex(pos);
         node = node.maybeChild(index);

         if (!node) {
            return null;
         }
         if (offset == pos || node.isText) {
            return node;
         }
         pos -= offset + 1;
      }
   }

   /**
    * Find the (direct) child node after the given offset, if any, and return
    * it along with its index and offset relative to this node.
    */
   childAfter(pos: number): NodeMatch {
      let { index, offset } = this.content.findIndex(pos);
      return { node: this.content.maybeChild(index), index, offset };
   }

   /**
    * Find the (direct) child node before the given offset, if any, and return
    * it along with its index and offset relative to this node.
    */
   childBefore(pos: number): NodeMatch {
      if (pos == 0) {
         return { node: null, index: 0, offset: 0 };
      }
      const { index, offset } = this.content.findIndex(pos);

      if (offset < pos) {
         return { node: this.content.child(index), index, offset };
      }
      const node = this.content.child(index - 1);

      return { node, index: index - 1, offset: offset - node.size };
   }

   /**
    * Resolve the given position in the document, returning an
    * [object](#model.ResolvedPos) with information about its context.
    */
   resolve = (pos: number): Position => Position.resolveCached(this, pos);

   resolveNoCache = (pos: number): Position => Position.resolve(this, pos);

   /**
    * Test whether a mark of the given type occurs in this document between the
    * two given positions.
    */
   rangeHasMark(from: number, to: number, type: MarkType): boolean {
      let found = false;

      if (to > from) {
         this.forEachNodeBetween(from, to, node => {
            if (type.find(node.marks)) {
               found = true;
            }
            return !found;
         });
      }
      return found;
   }

   /**
    * True when this is a block (non-inline node)
    */
   get isBlock(): boolean {
      return this.type.isBlock;
   }

   /**
    * True when this is a textblock node, a block node with inline content.
    */
   get isTextblock(): boolean {
      return this.type.isTextblock;
   }

   /**
    * True when this node allows inline content.
    */
   get inlineContent(): boolean {
      return this.type.inlineContent === true;
   }

   /**
    * Whether this is an inline node (a text node or node that can appear
    * within text).
    */
   get isInline(): boolean {
      return this.type.isInline;
   }

   /**
    * Whether `NodeType` is text.
    */
   get isText(): boolean {
      return this.type.isText;
   }

   /**
    * True when this is a leaf node.
    */
   get isLeaf(): boolean {
      return this.type.isLeaf;
   }

   /**
    * True when this is an atom, i.e. when it does not have directly editable
    * content. This is usually the same as `isLeaf`, but can be configured with
    * the [`atom` property](#model.NodeSpec.atom) on a node's spec (typically
    * used when the node is displayed as an uneditable
    * [node view](#view.NodeView)).
    */
   get isAtom(): boolean {
      return this.type.isAtom;
   }

   /**
    * Return a string representation of this node for debugging purposes.
    */
   toString(): string {
      if (this.type.spec.toDebugString !== undefined) {
         return this.type.spec.toDebugString(this);
      }
      let name = this.type.name;

      if (this.content.size > 0) {
         name += '(' + this.content.toStringInner() + ')';
      }
      return wrapMarks(this.marks, name);
   }

   /**
    * Content match in this node at the given index.
    */
   contentMatchAt(index: number): ContentMatch {
      const match =
         this.type.contentMatch === undefined
            ? undefined
            : this.type.contentMatch.matchFragment(this.content, 0, index);

      if (match === undefined) {
         throw new Error(
            'Called contentMatchAt on a node with invalid content'
         );
      }
      return match;
   }

   /**
    * Test whether replacing the range between `from` and `to` (by child index)
    * with the given replacement fragment (which defaults to the empty fragment)
    * would leave the node's content valid. You can optionally pass `start` and
    * `end` indices into the replacement fragment.
    */
   canReplace(
      from: number,
      to: number,
      replacement = Fragment.empty,
      start = 0,
      end = replacement.childCount
   ): boolean {
      const one = this.contentMatchAt(from).matchFragment(
         replacement,
         start,
         end
      );
      const two =
         one === undefined ? undefined : one.matchFragment(this.content, to);

      if (two === undefined || !two.validEnd) {
         return false;
      }
      for (let i = start; i < end; i++) {
         if (!this.type.allowsMarks(replacement.child(i).marks)) {
            return false;
         }
      }
      return true;
   }

   /**
    * Test whether replacing the range `from` to `to` (by index) with a node of
    * the given type would leave the node's content valid.
    */
   canReplaceWith(
      from: number,
      to: number,
      type: NodeType,
      marks?: Mark[]
   ): boolean {
      if (marks !== undefined && !this.type.allowsMarks(marks)) {
         return false;
      }
      const start = this.contentMatchAt(from).matchType(type);
      const end =
         start === undefined
            ? undefined
            : start.matchFragment(this.content, to);

      return end !== undefined ? end.validEnd : false;
   }

   /**
    * Test whether the given node's content could be appended to this node. If
    * that node is empty, this will only return true if there is at least one
    * node type that can appear in both nodes (to avoid merging completely
    * incompatible nodes).
    */
   canAppend = (other: EditorNode): boolean =>
      other.content.size > 0
         ? this.canReplace(this.childCount, this.childCount, other.content)
         : this.type.compatibleContent(other.type);

   // Unused. Left for backwards compatibility.
   defaultContentType = (at: number) => this.contentMatchAt(at).defaultType;

   /**
    * Check whether this node and its descendants conform to the schema, and
    * raise error when they do not.
    */
   check() {
      if (!this.type.allowsContent(this.content)) {
         throw new RangeError(
            `Invalid content for node ${
               this.type.name
            }: ${this.content.toString().slice(0, 50)}`
         );
      }
      this.content.forEachChild((node: EditorNode) => node.check());
   }

   /**
    * Return a JSON-serializeable representation of this node.
    */
   toJSON(): NodeJSON {
      const out: NodeJSON = { type: this.type.name };

      for (let _ in this.attrs) {
         out.attrs = this.attrs;
         break;
      }
      if (this.content.size > 0) {
         out.content = this.content.toJSON();
      }
      if (this.marks.length > 0) {
         out.marks = this.marks.map(n => n.toJSON());
      }
      return out;
   }

   /**
    * Deserialize a node from its JSON representation.
    */
   static fromJSON(schema: Schema, json: NodeJSON): EditorNode | TextNode {
      if (!json) {
         throw new RangeError('Invalid input for Node.fromJSON');
      }
      let marks: Mark[] | undefined = undefined;

      if (json.marks !== undefined) {
         if (!is.array<MarkJSON>(json.marks)) {
            throw new RangeError('Invalid mark data for Node.fromJSON');
         }
         marks = json.marks.map(schema.markFromJSON);
      }
      if (json.type == 'text') {
         if (!is.text(json.text)) {
            throw new RangeError('Invalid text node in JSON');
         }
         return schema.text(json.text, marks);
      }
      const content = Fragment.fromJSON(schema, json.content);

      return schema.nodeType(json.type).create(json.attrs, content, marks);
   }
}

export function wrapMarks(marks: Mark[], str: string): string {
   for (let i = marks.length - 1; i >= 0; i--) {
      str = marks[i].type.name + '(' + str + ')';
   }
   return str;
}
