import { is } from '@toba/tools';
import { MarkType } from './mark-type';
import { Schema } from './schema';
import { OrderedMap } from './ordered-map';
import { EditorNode } from './node';
import {
   AttributeMap,
   initAttrs,
   defaultAttrs,
   computeAttrs,
   Attributes
} from './attribute';
import { ContentMatch } from './match';
import { Fragment } from './fragment';
import { Mark } from './mark';
import { SimpleMap, ItemSpec } from './types';

/**
 * Specifications for an `EditorNode`.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L319
 */
export interface NodeSpec extends ItemSpec<EditorNode> {
   /**
    * Pattern indicating allowed content based on `NodeType` or group name. If
    * not given then no content will be allowed.
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
    * Should be set to true for inline nodes. (Implied for text nodes.)
    */
   inline?: boolean;

   /**
    * Set `true` to indicate nodes do not have directly editable content, and
    * should be treated as a single unit in the view, even though they may not
    * be leaf nodes (`isLeaf`).
    */
   atom?: boolean;

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
   /** `Schema` the node type is part of */
   schema: Schema;
   /** Specification the type is based on */
   spec: NodeSpec;
   attrs: AttributeMap;
   /**
    * List of group names the type belongs to. Groups are used to create
    * expression patterns to control allowed child content.
    */
   groups: string[];
   /** Attribute key/values added to every created `EditorNode` */
   defaultAttrs: Attributes | null;
   /** Starting match of the node type's content expression */
   contentMatch?: ContentMatch;
   /** Marks allowed on this `NodeType` or `null` if all are allowed */
   allowedMarks: MarkType[] | null;
   /** Whether node has inline content */
   inlineContent: boolean | null;
   /** Whether a block type */
   isBlock: boolean;
   /** Whether a text node type */
   isText: boolean;

   constructor(name: string, schema: Schema, spec: NodeSpec) {
      this.name = name;
      this.schema = schema;
      this.spec = spec;
      this.groups = spec.group === undefined ? [] : spec.group.split(' ');
      this.attrs = initAttrs(spec.attrs);
      this.defaultAttrs = defaultAttrs(this.attrs);
      this.contentMatch = undefined;
      this.allowedMarks = null;
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
      (this.contentMatch !== undefined &&
         this.contentMatch.compatible(other.contentMatch));

   /**
    * Compute attribute key/values from an `AttributeMap` and merge with optional
    * given attributes.
    */
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
    * Create `EditorNode` and throw an error if its content violates the
    * `content` pattern.
    */
   createAndValidate(
      attrs?: Attributes,
      content?: Fragment | EditorNode | EditorNode[],
      marks?: Mark[]
   ): EditorNode {
      const fragment = Fragment.from(content);

      if (!this.allowsContent(fragment)) {
         throw new RangeError('Invalid content for node ' + this.name);
      }
      return new EditorNode(
         this,
         this.computeAttrs(attrs),
         fragment,
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
   ): EditorNode | undefined {
      attrs = this.computeAttrs(attrs);
      content = Fragment.from(content);

      if (content.size) {
         const before =
            this.contentMatch !== undefined &&
            this.contentMatch.fillBefore(content);
         if (!before) {
            return undefined;
         }
         content = before.append(content);
      }
      let after: Fragment | undefined;

      if (this.contentMatch !== undefined) {
         const match:
            | ContentMatch
            | undefined = this.contentMatch.matchFragment(content);
         if (match !== undefined) {
            after = match.fillBefore(Fragment.empty, true);
         }
      }

      return after === undefined
         ? undefined
         : new EditorNode(
              this,
              attrs,
              content.append(after),
              Mark.setFrom(marks)
           );
   }

   /**
    * Whether a fragment is valid content for this node type.
    */
   allowsContent(content: Fragment): boolean {
      const result =
         this.contentMatch !== undefined &&
         this.contentMatch.matchFragment(content);

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
    * Whether the given mark type is allowed in this node type.
    */
   allowsMarkType = (markType: MarkType): boolean =>
      this.allowedMarks === null || this.allowedMarks.includes(markType);

   /**
    * Whether all given marks are allowed in this node type.
    */
   allowsMarks(marks: Mark[]): boolean {
      if (this.allowedMarks === null) {
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
    * Remove the marks that are not allowed in this node from the given list.
    */
   removeDisallowedMarks(marks: Mark[]): Mark[] {
      if (this.allowedMarks == null) {
         return marks;
      }
      let filtered: Mark[] | undefined;

      for (let i = 0; i < marks.length; i++) {
         if (!this.allowedMarks.includes(marks[i].type)) {
            if (filtered === undefined) {
               filtered = marks.slice(0, i);
            }
         } else if (filtered !== undefined) {
            filtered.push(marks[i]);
         }
      }
      return filtered === undefined
         ? marks
         : filtered.length
         ? filtered
         : Mark.empty;
   }

   /**
    * Compile node specifications into node types.
    */
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
