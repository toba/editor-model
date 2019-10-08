import { is } from '@toba/tools';
import { MarkType } from './mark-type';
import { Schema } from './schema';
import { NodeSerializer } from './to-dom';
import { ParseRule } from './parse-dom';
import { OrderedMap } from './ordered-map';
import { EditorNode } from './node';
import {
   AttributeMap,
   initAttrs,
   defaultAttrs,
   computeAttrs,
   Attributes,
   AttributeSpec
} from './attribute';
import { ContentMatch } from './content';
import { Fragment } from './fragment';
import { Mark } from './mark';
import { SimpleMap } from './types';

/**
 * Specifications for an `EditorNode`.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L319
 */
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
   attrs?: SimpleMap<AttributeSpec<any>>;

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
   toDebugString?: (node: EditorNode) => string;
}

/**
 * Node types are objects allocated once per `Schema` used to described
 * `EditorNode` instances.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L46
 */
export class NodeType {
   name: string;
   /** Link back to the `Schema` the node type belongs to */
   schema: Schema;
   /** Specification this type is based on */
   spec: NodeSpec;
   attrs: AttributeMap;
   groups: string[];
   defaultAttrs: Attributes | null;
   /** Starting match of the node type's content expression */
   contentMatch: ContentMatch | null;
   /** Set of marks allowed in this node. `null` means all marks are allowed. */
   markSet: MarkType[] | null;
   /** True if this node type has inline content */
   inlineContent: boolean | null;
   /** True if this is a block type */
   isBlock: boolean;
   /** True if this is the text node type */
   isText: boolean;

   constructor(name: string, schema: Schema, spec: NodeSpec) {
      this.name = name;
      this.schema = schema;
      this.spec = spec;
      this.groups = spec.group === undefined ? [] : spec.group.split(' ');
      this.attrs = initAttrs(spec.attrs);
      this.defaultAttrs = defaultAttrs(this.attrs);
      this.contentMatch = null;
      this.markSet = null;
      this.inlineContent = null;
      this.isBlock = !(spec.inline || name == 'text');
      this.isText = name == 'text';
   }

   /**
    * `true` if this is an inline type.
    */
   get isInline(): boolean {
      return !this.isBlock;
   }

   /**
    * `true` if this is a textblock type, a block that contains inline content.
    */
   get isTextblock(): boolean {
      return this.isBlock && this.inlineContent === true;
   }

   /**
    * `true` for node types that allow no content.
    */
   get isLeaf(): boolean {
      return this.contentMatch === ContentMatch.empty;
   }

   /**
    * True when this node is an atom, i.e. when it does not have directly
    * editable content.
    */
   get isAtom(): boolean {
      return this.isLeaf || this.spec.atom === true;
   }

   /**
    * Whether group name has been assigned to the type.
    */
   isInGroup = (name: string): boolean => this.groups.includes(name);

   hasRequiredAttrs(ignore: string[] = []): boolean {
      for (let n in this.attrs) {
         if (this.attrs[n].isRequired && !ignore.includes(n)) {
            return true;
         }
      }
      return false;
   }

   compatibleContent = (other: NodeType): boolean =>
      this === other ||
      (this.contentMatch !== null &&
         this.contentMatch.compatible(other.contentMatch));

   computeAttrs = (attrs?: Attributes): Attributes =>
      !is.value<Attributes>(attrs) && this.defaultAttrs !== null
         ? this.defaultAttrs
         : computeAttrs(this.attrs, attrs);

   /**
    * Create a `Node` of this type. The given attributes are checked and
    * defaulted (you can pass `null` to use the type's defaults entirely, if no
    * required attributes exist). `content` may be a `Fragment`, a node, an
    * array of nodes, or `null`. Similarly `marks` may be `null` to default to
    * the empty set of marks.
    */
   create(
      attrs?: Attributes,
      content?: Fragment | EditorNode | EditorNode[],
      marks?: Mark[]
   ): EditorNode {
      if (this.isText) {
         throw new Error("NodeType.create can't construct text nodes");
      }
      return new EditorNode(
         this,
         this.computeAttrs(attrs),
         Fragment.from(content),
         Mark.setFrom(marks)
      );
   }

   /**
    * Like [`create`](#model.NodeType.create), but check the given content
    * against the node type's content restrictions, and throw an error if it
    * doesn't match.
    */
   createChecked(
      attrs?: Attributes,
      content?: Fragment | EditorNode | EditorNode[],
      marks?: Mark[]
   ): EditorNode {
      content = Fragment.from(content);

      if (!this.validContent(content)) {
         throw new RangeError('Invalid content for node ' + this.name);
      }
      return new EditorNode(
         this,
         this.computeAttrs(attrs),
         content,
         Mark.setFrom(marks)
      );
   }

   /**
    * Like [`create`](#model.NodeType.create), but see if it is necessary to add
    * nodes to the start or end of the given fragment to make it fit the node.
    * If no fitting wrapping can be found, return `null`. Note that, due to the
    * fact that required nodes can always be created, this will always succeed
    * if you pass `null` or `Fragment.empty` as content.
    */
   createAndFill(
      attrs?: Attributes,
      content?: Fragment | EditorNode | EditorNode[],
      marks?: Mark[]
   ): EditorNode | null {
      attrs = this.computeAttrs(attrs);
      content = Fragment.from(content);

      if (content.size) {
         const before =
            this.contentMatch !== null && this.contentMatch.fillBefore(content);
         if (!before) {
            return null;
         }
         content = before.append(content);
      }
      let after: Fragment | undefined;

      if (this.contentMatch !== null) {
         const match: ContentMatch | null = this.contentMatch.matchFragment(
            content
         );
         if (match !== null) {
            after = match.fillBefore(Fragment.empty, true);
         }
      }

      return after === undefined
         ? null
         : new EditorNode(
              this,
              attrs,
              content.append(after),
              Mark.setFrom(marks)
           );
   }

   /**
    * Returns `true` if the given fragment is valid content for this node type
    * with the given attributes.
    */
   validContent(content: Fragment): boolean {
      const result =
         this.contentMatch !== null && this.contentMatch.matchFragment(content);

      if (!result || !result.validEnd) {
         return false;
      }
      for (let i = 0; i < content.childCount; i++) {
         if (!this.allowsMarks(content.child(i).marks)) {
            return false;
         }
      }
      return true;
   }

   /**
    * Check whether the given mark type is allowed in this node.
    */
   allowsMarkType = (markType: MarkType): boolean =>
      this.markSet == null || this.markSet.indexOf(markType) > -1;

   /**
    * Test whether the given set of marks are allowed in this node.
    */
   allowsMarks(marks: Mark[]): boolean {
      if (this.markSet == null) {
         return true;
      }
      for (let i = 0; i < marks.length; i++) {
         if (!this.allowsMarkType(marks[i].type)) {
            return false;
         }
      }
      return true;
   }

   /**
    * Removes the marks that are not allowed in this node from the given set.
    */
   allowedMarks(marks: Mark[]): Mark[] {
      if (this.markSet == null) {
         return marks;
      }
      let copy;

      for (let i = 0; i < marks.length; i++) {
         if (!this.allowsMarkType(marks[i].type)) {
            if (!copy) {
               copy = marks.slice(0, i);
            }
         } else if (copy) {
            copy.push(marks[i]);
         }
      }
      return !copy ? marks : copy.length ? copy : Mark.empty;
   }

   static compile(
      specs: OrderedMap<NodeSpec>,
      schema: Schema
   ): SimpleMap<NodeType> {
      const result = specs.map(
         (name, spec) => new NodeType(name, schema, spec)
      );
      const topType: string = schema.spec.topNode || 'doc';

      if (!result[topType]) {
         throw new RangeError(
            "Schema is missing its top node type ('" + topType + "')"
         );
      }
      if (!result.text) {
         throw new RangeError("Every schema needs a 'text' type");
      }
      for (let _ in result.text.attrs) {
         throw new RangeError('The text node type should not have attributes');
      }
      return result;
   }
}
