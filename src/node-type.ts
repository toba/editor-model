import { MarkType } from './mark-type';
import { Schema } from './schema';

// ::- Node types are objects allocated once per `Schema` and used to
// [tag](#model.Node.type) `Node` instances. They contain information
// about the node type, such as its name and what kind of node it
// represents.
export class NodeType {
   name: string;
   /** link back to the `Schema` the node type belongs to */
   schema: Schema;

   constructor(name: string, schema: Schema, spec) {
      this.name = name;
      this.schema = schema;

      // :: NodeSpec
      // The spec that this type is based on
      this.spec = spec;

      this.groups = spec.group ? spec.group.split(' ') : [];
      this.attrs = initAttrs(spec.attrs);

      this.defaultAttrs = defaultAttrs(this.attrs);

      // :: ContentMatch
      // The starting match of the node type's content expression.
      this.contentMatch = null;

      // : ?[MarkType]
      // The set of marks allowed in this node. `null` means all marks
      // are allowed.
      this.markSet = null;

      // :: bool
      // True if this node type has inline content.
      this.inlineContent = null;

      // :: bool
      // True if this is a block type
      this.isBlock = !(spec.inline || name == 'text');

      // :: bool
      // True if this is the text node type.
      this.isText = name == 'text';
   }

   // :: bool
   // True if this is an inline type.
   get isInline() {
      return !this.isBlock;
   }

   // :: bool
   // True if this is a textblock type, a block that contains inline
   // content.
   get isTextblock() {
      return this.isBlock && this.inlineContent;
   }

   // :: bool
   // True for node types that allow no content.
   get isLeaf() {
      return this.contentMatch == ContentMatch.empty;
   }

   // :: bool
   // True when this node is an atom, i.e. when it does not have
   // directly editable content.
   get isAtom() {
      return this.isLeaf || this.spec.atom;
   }

   hasRequiredAttrs(ignore) {
      for (let n in this.attrs)
         if (this.attrs[n].isRequired && (!ignore || !(n in ignore)))
            return true;
      return false;
   }

   compatibleContent(other) {
      return this == other || this.contentMatch.compatible(other.contentMatch);
   }

   computeAttrs(attrs) {
      if (!attrs && this.defaultAttrs) return this.defaultAttrs;
      else return computeAttrs(this.attrs, attrs);
   }

   // :: (?Object, ?union<Fragment, Node, [Node]>, ?[Mark]) → Node
   // Create a `Node` of this type. The given attributes are
   // checked and defaulted (you can pass `null` to use the type's
   // defaults entirely, if no required attributes exist). `content`
   // may be a `Fragment`, a node, an array of nodes, or
   // `null`. Similarly `marks` may be `null` to default to the empty
   // set of marks.
   create(attrs, content, marks) {
      if (this.isText)
         throw new Error("NodeType.create can't construct text nodes");
      return new Node(
         this,
         this.computeAttrs(attrs),
         Fragment.from(content),
         Mark.setFrom(marks)
      );
   }

   // :: (?Object, ?union<Fragment, Node, [Node]>, ?[Mark]) → Node
   // Like [`create`](#model.NodeType.create), but check the given content
   // against the node type's content restrictions, and throw an error
   // if it doesn't match.
   createChecked(attrs, content, marks) {
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

   // :: (?Object, ?union<Fragment, Node, [Node]>, ?[Mark]) → ?Node
   // Like [`create`](#model.NodeType.create), but see if it is necessary to
   // add nodes to the start or end of the given fragment to make it
   // fit the node. If no fitting wrapping can be found, return null.
   // Note that, due to the fact that required nodes can always be
   // created, this will always succeed if you pass null or
   // `Fragment.empty` as content.
   createAndFill(attrs, content, marks) {
      attrs = this.computeAttrs(attrs);
      content = Fragment.from(content);
      if (content.size) {
         let before = this.contentMatch.fillBefore(content);
         if (!before) return null;
         content = before.append(content);
      }
      let after = this.contentMatch
         .matchFragment(content)
         .fillBefore(Fragment.empty, true);
      if (!after) return null;
      return new Node(this, attrs, content.append(after), Mark.setFrom(marks));
   }

   // :: (Fragment) → bool
   // Returns true if the given fragment is valid content for this node
   // type with the given attributes.
   validContent(content) {
      let result = this.contentMatch.matchFragment(content);
      if (!result || !result.validEnd) return false;
      for (let i = 0; i < content.childCount; i++)
         if (!this.allowsMarks(content.child(i).marks)) return false;
      return true;
   }

   // :: (MarkType) → bool
   // Check whether the given mark type is allowed in this node.
   allowsMarkType(markType) {
      return this.markSet == null || this.markSet.indexOf(markType) > -1;
   }

   // :: ([Mark]) → bool
   // Test whether the given set of marks are allowed in this node.
   allowsMarks(marks) {
      if (this.markSet == null) return true;
      for (let i = 0; i < marks.length; i++)
         if (!this.allowsMarkType(marks[i].type)) return false;
      return true;
   }

   // :: ([Mark]) → [Mark]
   // Removes the marks that are not allowed in this node from the given set.
   allowedMarks(marks) {
      if (this.markSet == null) return marks;
      let copy;
      for (let i = 0; i < marks.length; i++) {
         if (!this.allowsMarkType(marks[i].type)) {
            if (!copy) copy = marks.slice(0, i);
         } else if (copy) {
            copy.push(marks[i]);
         }
      }
      return !copy ? marks : copy.length ? copy : Mark.empty;
   }

   static compile(nodes, schema) {
      let result = Object.create(null);
      nodes.forEach(
         (name, spec) => (result[name] = new NodeType(name, schema, spec))
      );

      let topType = schema.spec.topNode || 'doc';
      if (!result[topType])
         throw new RangeError(
            "Schema is missing its top node type ('" + topType + "')"
         );
      if (!result.text)
         throw new RangeError("Every schema needs a 'text' type");
      for (let _ in result.text.attrs)
         throw new RangeError('The text node type should not have attributes');

      return result;
   }
}
