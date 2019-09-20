import { Fragment, FragmentJSON } from './fragment';
import { Mark, MarkJSON } from './mark';
import { NodeType } from './node-type';
import { AttributeMap } from './attribute';
import { Slice } from './slice';
import { replace } from './replace';
import { ResolvedPos } from './resolved-pos';
import { compareDeep } from './compare-deep';
import { MarkType } from './mark-type';
import { DOMOutputSpec, NodeSerializer } from './to-dom';
import { ParseRule } from './from-dom';
import { ContentMatch } from './content';
import { Schema } from './schema';

const emptyAttrs = Object.create(null);

interface NodeMatch {
   node?: Node | null;
   index: number;
   offset: number;
}

export interface NodeJSON {
   type: string;
   text?: string;
   attrs?: AttributeMap;
   content?: FragmentJSON | null;
   marks?: MarkJSON[];
}

export interface NodeSpec {
   /**
    * The content expression for this node, as described in the
    * [schema guide](/docs/guide/#schema.content_expressions). When not given,
    * the node does not allow any content.
    */
   content?: string;

   /**
    * The marks that are allowed inside of this node. May be a space-separated
    * string referring to mark names or groups, `"_"` to explicitly allow all
    * marks, or `""` to disallow marks. When not given, nodes with inline
    * content default to allowing all marks, other nodes default to not allowing
    * marks.
    */
   marks?: string;

   /**
    * The group or space-separated groups to which this node belongs, which can
    * be referred to in the content expressions for the schema.
    */
   group?: string;

   /**
    * Should be set to true for inline nodes. (Implied for text nodes.)
    */
   inline?: boolean;

   /**
    * Can be set to true to indicate that, though this isn't a
    * [leaf node](#model.NodeType.isLeaf), it doesn't have directly editable
    * content and should be treated as a single unit in the view.
    */
   atom?: boolean;

   /**
    * The attributes that nodes of this type get.
    */
   attrs?: AttributeMap;

   /**
    * Controls whether nodes of this type can be selected as a
    * [node selection](#state.NodeSelection). Defaults to true for non-text
    * nodes.
    */
   selectable?: boolean;

   /**
    * Determines whether nodes of this type can be dragged without being
    * selected. Defaults to `false`.
    */
   draggable?: boolean;

   /**
    * Can be used to indicate that this node contains code, which causes some
    * commands to behave differently.
    */
   code?: boolean;

   /**
    * Determines whether this node is considered an important parent node during
    * replace operations (such as paste). Non-defining (the default) nodes get
    * dropped when their entire content is replaced, whereas defining nodes
    * persist and wrap the inserted content. Likewise, in _inserted_ content the
    * defining parents of the content are preserved when possible. Typically,
    * non-default-paragraph textblock types, and possibly list items, are marked
    * as defining.
    */
   defining?: boolean;

   /**
    * When enabled (default is `false`), the sides of nodes of this type count
    * as boundaries that regular editing operations, like backspacing or
    * lifting, won't cross. An example of a node that should probably have this
    * enabled is a table cell.
    */
   isolating?: boolean;

   /**
    * Defines the default way a node of this type should be serialized to
    * DOM/HTML (as used by [`DOMSerializer.fromSchema`](#model.DOMSerializer^fromSchema)).
    * Should return a DOM node or an [array structure](#model.DOMOutputSpec)
    * that describes one, with an optional number zero (“hole”) in it to
    * indicate where the node's content should be inserted.
    *
    * For text nodes, the default is to create a text DOM node. Though it is
    * possible to create a serializer where text is rendered differently, this
    * is not supported inside the editor, so you shouldn't override that in your
    * text node spec.
    */
   toDOM?: NodeSerializer;

   /**
    * Associates DOM parser information with this node, which can be used
    * by [`DOMParser.fromSchema`](#model.DOMParser^fromSchema) to automatically
    * derive a parser. The `node` field in the rules is implied (the name of
    * this node will be filled in automatically). If you supply your own parser,
    * you do not need to also specify parsing rules in your schema.
    */
   parseDOM?: ParseRule[];

   /**
    * Defines the default way a node of this type should be serialized to a
    * string representation for debugging (e.g. in error messages).
    */
   toDebugString?: (node: Node) => string;
}

/**
 * Node, ofsfset and index
 */
type Iteration = [Node, number, number];

/**
 * This class represents a node in the tree that makes up a document. So a
 * document is an instance of `Node`, with children that are also instances of
 * `Node`.
 *
 * Nodes are persistent data structures. Instead of changing them, you create
 * new ones with the content you want. Old ones keep pointing at the old
 * document shape. This is made cheaper by sharing structure between the old and
 * new data as much as possible, which a tree shape like this (without back
 * pointers) makes easy.
 *
 * **Do not** directly mutate the properties of a `Node` object. See
 * [the guide](/docs/guide/#doc) for more information.
 */
export class Node {
   type: NodeType;
   /** Container holding the node's children */
   content: Fragment;
   /**
    * The marks (things like whether it is emphasized or part of a link) applied
    * to this node.
    */
   marks: Mark[];
   /**
    * An object mapping attribute names to values. The kind of attributes
    * allowed and required are [determined](#model.NodeSpec.attrs) by the node
    * type.
    */
   attrs: AttributeMap;

   constructor(
      type: NodeType,
      attrs: AttributeMap,
      content: Fragment | null,
      marks: Mark[] | null
   ) {
      this.type = type;
      this.attrs = attrs;
      this.content = content || Fragment.empty;
      this.marks = marks || Mark.none;
   }

   /**
    * The size of this node, as defined by the integer-based
    * [indexing scheme](/docs/guide/#doc.indexing). For text nodes, this is the
    * amount of characters. For other leaf nodes, it is one. For non-leaf nodes,
    * it is the size of the content plus two (the start and end token).
    */
   get nodeSize(): number {
      return this.isLeaf ? 1 : 2 + this.content.size;
   }

   /**
    * The number of children that the node has.
    */
   get childCount(): number {
      return this.content.childCount;
   }

   /**
    * Get the child node at the given index. Raises an error when the index is
    * out of range.
    */
   child = (index: number): Node => this.content.child(index);

   /**
    * Get the child node at the given index, if it exists.
    */
   maybeChild = (index: number): Node | undefined =>
      this.content.maybeChild(index);

   /**
    * Call `f` for every child node, passing the node, its offset into this
    * parent node, and its index.
    */
   forEach(fn: (node: Node, offset: number, index: number) => void) {
      this.content.forEach(fn);
   }

   /**
    * Invoke a callback for all descendant nodes recursively between the given
    * two positions that are relative to start of this node's content. The
    * callback is invoked with the node, its parent-relative position, its
    * parent node, and its child index. When the callback returns false for a
    * given node, that node's children will not be recursed over. The last
    * parameter can be used to specify a starting position to count from.
    */
   nodesBetween(
      from: number,
      to: number,
      fn: (node: Node, pos: number, parent: Node, index: number) => boolean,
      startPos = 0
   ) {
      this.content.nodesBetween(from, to, fn, startPos, this);
   }

   /**
    * Call the given callback for every descendant node. Doesn't descend into a
    * node when the callback returns `false`.
    */
   descendants(fn: (node: Node, pos: number, parent: Node) => boolean) {
      this.nodesBetween(0, this.content.size, fn);
   }

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
   get firstChild(): Node | null {
      return this.content.firstChild;
   }

   /**
    * Returns this node's last child, or `null` if there are no children.
    */
   get lastChild(): Node | null {
      return this.content.lastChild;
   }

   /**
    * Test whether two nodes represent the same piece of document.
    */
   eq = (other: Node): boolean =>
      this === other ||
      (this.sameMarkup(other) && this.content.eq(other.content));

   /**
    * Compare the markup (type, attributes, and marks) of this node to those of
    * another. Returns `true` if both have the same markup.
    */
   sameMarkup = (other: Node): boolean =>
      this.hasMarkup(other.type, other.attrs, other.marks);

   /**
    * Check whether this node's markup correspond to the given type, attributes,
    * and marks.
    */
   hasMarkup = (type: NodeType, attrs: AttributeMap, marks?: Mark[]): boolean =>
      this.type === type &&
      compareDeep(this.attrs, attrs || type.defaultAttrs || emptyAttrs) &&
      Mark.sameSet(this.marks, marks || Mark.none);

   /**
    * Create a new node with the same markup as this node, containing the given
    * content (or empty, if no content is given).
    */
   copy = (content: Fragment | null = null): Node =>
      content === this.content
         ? this
         : new Node(this.type, this.attrs, content, this.marks);

   /**
    * Create a copy of this node, with the given set of marks instead of the
    * node's own marks.
    */
   mark = (marks: Mark[]): Node =>
      marks === this.marks
         ? this
         : new Node(this.type, this.attrs, this.content, marks);

   /**
    * Create a copy of this node with only the content between the given
    * positions. If `to` is not given, it defaults to the end of the node.
    */
   cut = (from: number, to?: number): Node =>
      from == 0 && to == this.content.size
         ? this
         : this.copy(this.content.cut(from, to));

   /**
    * Cut out the part of the document between the given positions, and return
    * it as a `Slice` object.
    */
   slice(from: number, to = this.content.size, includeParents = false): Slice {
      if (from == to) return Slice.empty;

      let $from = this.resolve(from),
         $to = this.resolve(to);
      let depth = includeParents ? 0 : $from.sharedDepth(to);
      let start = $from.start(depth),
         node = $from.node(depth);
      let content = node.content.cut($from.pos - start, $to.pos - start);
      return new Slice(content, $from.depth - depth, $to.depth - depth);
   }

   /**
    * Replace the part of the document between the given positions with the
    * given slice. The slice must 'fit', meaning its open sides must be able to
    * connect to the surrounding content, and its content nodes must be valid
    * children for the node they are placed into. If any of this is violated, an
    * error of type [`ReplaceError`](#model.ReplaceError) is thrown.
    */
   replace = (from: number, to: number, slice: Slice): Node =>
      replace(this.resolve(from), this.resolve(to), slice);

   /**
    * Find the node directly after the given position.
    */
   nodeAt(pos: number): Node | null {
      let node: Node | undefined;

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

   // :: (number) → {node: ?Node, index: number, offset: number}
   // Find the (direct) child node before the given offset, if any,
   // and return it along with its index and offset relative to this
   // node.
   childBefore(pos: number): NodeMatch {
      if (pos == 0) return { node: null, index: 0, offset: 0 };
      let { index, offset } = this.content.findIndex(pos);
      if (offset < pos)
         return { node: this.content.child(index), index, offset };
      let node = this.content.child(index - 1);
      return { node, index: index - 1, offset: offset - node.nodeSize };
   }

   // :: (number) → ResolvedPos
   // Resolve the given position in the document, returning an
   // [object](#model.ResolvedPos) with information about its context.
   resolve(pos: number) {
      return ResolvedPos.resolveCached(this, pos);
   }

   resolveNoCache(pos: number) {
      return ResolvedPos.resolve(this, pos);
   }

   /**
    * Test whether a mark of the given type occurs in this document between the
    * two given positions.
    */
   rangeHasMark(from: number, to: number, type: MarkType): boolean {
      let found = false;
      if (to > from) {
         this.nodesBetween(from, to, node => {
            if (type.isInSet(node.marks)) {
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
    * True when this is an inline node (a text node or a node that can appear
    * among text).
    */
   get isInline(): boolean {
      return this.type.isInline;
   }

   /**
    * True when this is a text node.
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
      if (this.type.spec.toDebugString) {
         return this.type.spec.toDebugString(this);
      }
      let name = this.type.name;
      if (this.content.size) {
         name += '(' + this.content.toStringInner() + ')';
      }
      return wrapMarks(this.marks, name);
   }

   /**
    * Get the content match in this node at the given index.
    */
   contentMatchAt(index: number): ContentMatch {
      const match =
         this.type.contentMatch === null
            ? null
            : this.type.contentMatch.matchFragment(this.content, 0, index);

      if (!match) {
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
      const two = one && one.matchFragment(this.content, to);

      if (!two || !two.validEnd) {
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
      if (marks && !this.type.allowsMarks(marks)) {
         return false;
      }
      const start = this.contentMatchAt(from).matchType(type);
      const end = start && start.matchFragment(this.content, to);

      return end ? end.validEnd : false;
   }

   /**
    * Test whether the given node's content could be appended to this node. If
    * that node is empty, this will only return true if there is at least one
    * node type that can appear in both nodes (to avoid merging completely
    * incompatible nodes).
    */
   canAppend = (other: Node): boolean =>
      other.content.size
         ? this.canReplace(this.childCount, this.childCount, other.content)
         : this.type.compatibleContent(other.type);

   // Unused. Left for backwards compatibility.
   defaultContentType = (at: number) => this.contentMatchAt(at).defaultType;

   /**
    * Check whether this node and its descendants conform to the schema, and
    * raise error when they do not.
    */
   check() {
      if (!this.type.validContent(this.content)) {
         throw new RangeError(
            `Invalid content for node ${
               this.type.name
            }: ${this.content.toString().slice(0, 50)}`
         );
      }
      this.content.forEach((node: Node) => node.check());
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
      if (this.content.size) {
         out.content = this.content.toJSON();
      }
      if (this.marks.length) {
         out.marks = this.marks.map(n => n.toJSON());
      }
      return out;
   }

   /**
    * Deserialize a node from its JSON representation.
    */
   static fromJSON(schema: Schema, json: NodeJSON): Node {
      if (!json) {
         throw new RangeError('Invalid input for Node.fromJSON');
      }
      let marks: Mark[] | null = null;

      if (json.marks) {
         if (!Array.isArray(json.marks)) {
            throw new RangeError('Invalid mark data for Node.fromJSON');
         }
         marks = json.marks.map(schema.markFromJSON);
      }
      if (json.type == 'text') {
         if (typeof json.text != 'string') {
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
