import { MarkType } from './mark-type';
import { Schema } from './schema';
import { NodeSpec, Node } from './node';
import {
   AttributeMap,
   initAttrs,
   defaultAttrs,
   computeAttrs
} from './attribute';
import { ContentMatch } from './content';
import { Fragment } from './fragment';
import { Mark } from './mark';

/**
 * Node types are objects allocated once per `Schema` and used to
 * [tag](#model.Node.type) `Node` instances. They contain information about the
 * node type, such as its name and what kind of node it represents.
 */
export class NodeType {
   name: string;
   /** Link back to the `Schema` the node type belongs to */
   schema: Schema;
   /** Spec that this type is based on */
   spec: NodeSpec;
   attrs: AttributeMap;
   groups: string[];
   defaultAttrs: AttributeMap;
   /** Starting match of the node type's content expression */
   contentMatch: ContentMatch | null;
   /**
    * Set of marks allowed in this node. `null` means all marks are allowed.
    */
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
      this.groups = spec.group ? spec.group.split(' ') : [];
      this.attrs = initAttrs(spec.attrs);
      this.defaultAttrs = defaultAttrs(this.attrsNode);
      this.contentMatch = null;
      this.markSet = null;
      this.inlineContent = null;
      this.isBlock = !(spec.inline || name == 'text');
      this.isText = name == 'text';
   }

   /**
    * True if this is an inline type.
    */
   get isInline(): boolean {
      return !this.isBlock;
   }

   /**
    * True if this is a textblock type, a block that contains inline content.
    */
   get isTextblock(): boolean {
      return this.isBlock && this.inlineContent === true;
   }

   /**
    * True for node types that allow no content.
    */
   get isLeaf(): boolean {
      return this.contentMatch == ContentMatch.empty;
   }

   /**
    * True when this node is an atom, i.e. when it does not have directly
    * editable content.
    */
   get isAtom(): boolean {
      return this.isLeaf || this.spec.atom === true;
   }

   hasRequiredAttrs(ignore?: string[]): boolean {
      for (let n in this.attrs) {
         if (this.attrs[n].isRequired && (!ignore || !(n in ignore))) {
            return true;
         }
      }
      return false;
   }

   compatibleContent = (other: NodeType): boolean =>
      this === other ||
      (this.contentMatch !== null &&
         this.contentMatch.compatible(other.contentMatch));

   computeAttrs = (attrs?: AttributeMap): AttributeMap =>
      !attrs && this.defaultAttrs
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
      attrs?: AttributeMap,
      content?: Fragment | Node | Node[],
      marks?: Mark[] | null
   ): Node {
      if (this.isText) {
         throw new Error("NodeType.create can't construct text nodes");
      }
      return new Node(
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
      attrs: AttributeMap,
      content?: Fragment | Node | Node[],
      marks?: Mark[]
   ): Node {
      content = Fragment.from(content);
      if (!this.validContent(content))
         throw new RangeError('Invalid content for node ' + this.name);
      return new Node(
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
      attrs?: AttributeMap,
      content?: Fragment | Node | Node[],
      marks?: Mark[]
   ): Node | null {
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
         : new Node(this, attrs, content.append(after), Mark.setFrom(marks));
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
      return !copy ? marks : copy.length ? copy : Mark.none;
   }

   static compile(nodes, schema: Schema) {
      const result = Object.create(null);

      nodes.forEach(
         (name, spec) => (result[name] = new NodeType(name, schema, spec))
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
