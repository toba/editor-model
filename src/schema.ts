import OrderedMap from 'ordered-map';

import { Node, TextNode } from './node';
import { Fragment } from './fragment';
import { Mark } from './mark';
import { ContentMatch } from './content';

// Marks

// SchemaSpec:: interface
// An object describing a schema, as passed to the [`Schema`](#model.Schema)
// constructor.
//
//   nodes:: union<Object<NodeSpec>, OrderedMap<NodeSpec>>
//   The node types in this schema. Maps names to
//   [`NodeSpec`](#model.NodeSpec) objects that describe the node type
//   associated with that name. Their order is significant—it
//   determines which [parse rules](#model.NodeSpec.parseDOM) take
//   precedence by default, and which nodes come first in a given
//   [group](#model.NodeSpec.group).
//
//   marks:: ?union<Object<MarkSpec>, OrderedMap<MarkSpec>>
//   The mark types that exist in this schema. The order in which they
//   are provided determines the order in which [mark
//   sets](#model.Mark.addToSet) are sorted and in which [parse
//   rules](#model.MarkSpec.parseDOM) are tried.
//
//   topNode:: ?string
//   The name of the default top-level node for the schema. Defaults
//   to `"doc"`.

// NodeSpec:: interface
//
//   content:: ?string
//   The content expression for this node, as described in the [schema
//   guide](/docs/guide/#schema.content_expressions). When not given,
//   the node does not allow any content.
//
//   marks:: ?string
//   The marks that are allowed inside of this node. May be a
//   space-separated string referring to mark names or groups, `"_"`
//   to explicitly allow all marks, or `""` to disallow marks. When
//   not given, nodes with inline content default to allowing all
//   marks, other nodes default to not allowing marks.
//
//   group:: ?string
//   The group or space-separated groups to which this node belongs,
//   which can be referred to in the content expressions for the
//   schema.
//
//   inline:: ?bool
//   Should be set to true for inline nodes. (Implied for text nodes.)
//
//   atom:: ?bool
//   Can be set to true to indicate that, though this isn't a [leaf
//   node](#model.NodeType.isLeaf), it doesn't have directly editable
//   content and should be treated as a single unit in the view.
//
//   attrs:: ?Object<AttributeSpec>
//   The attributes that nodes of this type get.
//
//   selectable:: ?bool
//   Controls whether nodes of this type can be selected as a [node
//   selection](#state.NodeSelection). Defaults to true for non-text
//   nodes.
//
//   draggable:: ?bool
//   Determines whether nodes of this type can be dragged without
//   being selected. Defaults to false.
//
//   code:: ?bool
//   Can be used to indicate that this node contains code, which
//   causes some commands to behave differently.
//
//   defining:: ?bool
//   Determines whether this node is considered an important parent
//   node during replace operations (such as paste). Non-defining (the
//   default) nodes get dropped when their entire content is replaced,
//   whereas defining nodes persist and wrap the inserted content.
//   Likewise, in _inserted_ content the defining parents of the
//   content are preserved when possible. Typically,
//   non-default-paragraph textblock types, and possibly list items,
//   are marked as defining.
//
//   isolating:: ?bool
//   When enabled (default is false), the sides of nodes of this type
//   count as boundaries that regular editing operations, like
//   backspacing or lifting, won't cross. An example of a node that
//   should probably have this enabled is a table cell.
//
//   toDOM:: ?(node: Node) → DOMOutputSpec
//   Defines the default way a node of this type should be serialized
//   to DOM/HTML (as used by
//   [`DOMSerializer.fromSchema`](#model.DOMSerializer^fromSchema)).
//   Should return a DOM node or an [array
//   structure](#model.DOMOutputSpec) that describes one, with an
//   optional number zero (“hole”) in it to indicate where the node's
//   content should be inserted.
//
//   For text nodes, the default is to create a text DOM node. Though
//   it is possible to create a serializer where text is rendered
//   differently, this is not supported inside the editor, so you
//   shouldn't override that in your text node spec.
//
//   parseDOM:: ?[ParseRule]
//   Associates DOM parser information with this node, which can be
//   used by [`DOMParser.fromSchema`](#model.DOMParser^fromSchema) to
//   automatically derive a parser. The `node` field in the rules is
//   implied (the name of this node will be filled in automatically).
//   If you supply your own parser, you do not need to also specify
//   parsing rules in your schema.
//
//   toDebugString:: ?(node: Node) -> string
//   Defines the default way a node of this type should be serialized
//   to a string representation for debugging (e.g. in error messages).

// MarkSpec:: interface
//
//   attrs:: ?Object<AttributeSpec>
//   The attributes that marks of this type get.
//
//   inclusive:: ?bool
//   Whether this mark should be active when the cursor is positioned
//   at its end (or at its start when that is also the start of the
//   parent node). Defaults to true.
//
//   excludes:: ?string
//   Determines which other marks this mark can coexist with. Should
//   be a space-separated strings naming other marks or groups of marks.
//   When a mark is [added](#model.Mark.addToSet) to a set, all marks
//   that it excludes are removed in the process. If the set contains
//   any mark that excludes the new mark but is not, itself, excluded
//   by the new mark, the mark can not be added an the set. You can
//   use the value `"_"` to indicate that the mark excludes all
//   marks in the schema.
//
//   Defaults to only being exclusive with marks of the same type. You
//   can set it to an empty string (or any string not containing the
//   mark's own name) to allow multiple marks of a given type to
//   coexist (as long as they have different attributes).
//
//   group:: ?string
//   The group or space-separated groups to which this mark belongs.
//
//   spanning:: ?bool
//   Determines whether marks of this type can span multiple adjacent
//   nodes when serialized to DOM/HTML. Defaults to true.
//
//   toDOM:: ?(mark: Mark, inline: bool) → DOMOutputSpec
//   Defines the default way marks of this type should be serialized
//   to DOM/HTML. When the resulting spec contains a hole, that is
//   where the marked content is placed. Otherwise, it is appended to
//   the top node.
//
//   parseDOM:: ?[ParseRule]
//   Associates DOM parser information with this mark (see the
//   corresponding [node spec field](#model.NodeSpec.parseDOM)). The
//   `mark` field in the rules is implied.

// AttributeSpec:: interface
//
// Used to [define](#model.NodeSpec.attrs) attributes on nodes or
// marks.
//
//   default:: ?any
//   The default value for this attribute, to use when no explicit
//   value is provided. Attributes that have no default must be
//   provided whenever a node or mark of a type that has them is
//   created.

// ::- A document schema. Holds [node](#model.NodeType) and [mark
// type](#model.MarkType) objects for the nodes and marks that may
// occur in conforming documents, and provides functionality for
// creating and deserializing such documents.
export class Schema {
   // :: (SchemaSpec)
   // Construct a schema from a schema [specification](#model.SchemaSpec).
   constructor(spec) {
      // :: SchemaSpec
      // The [spec](#model.SchemaSpec) on which the schema is based,
      // with the added guarantee that its `nodes` and `marks`
      // properties are
      // [`OrderedMap`](https://github.com/marijnh/orderedmap) instances
      // (not raw objects).
      this.spec = {};
      for (let prop in spec) this.spec[prop] = spec[prop];
      this.spec.nodes = OrderedMap.from(spec.nodes);
      this.spec.marks = OrderedMap.from(spec.marks);

      // :: Object<NodeType>
      // An object mapping the schema's node names to node type objects.
      this.nodes = NodeType.compile(this.spec.nodes, this);

      // :: Object<MarkType>
      // A map from mark names to mark type objects.
      this.marks = MarkType.compile(this.spec.marks, this);

      let contentExprCache = Object.create(null);
      for (let prop in this.nodes) {
         if (prop in this.marks)
            throw new RangeError(prop + ' can not be both a node and a mark');
         let type = this.nodes[prop],
            contentExpr = type.spec.content || '',
            markExpr = type.spec.marks;
         type.contentMatch =
            contentExprCache[contentExpr] ||
            (contentExprCache[contentExpr] = ContentMatch.parse(
               contentExpr,
               this.nodes
            ));
         type.inlineContent = type.contentMatch.inlineContent;
         type.markSet =
            markExpr == '_'
               ? null
               : markExpr
               ? gatherMarks(this, markExpr.split(' '))
               : markExpr == '' || !type.inlineContent
               ? []
               : null;
      }
      for (let prop in this.marks) {
         let type = this.marks[prop],
            excl = type.spec.excludes;
         type.excluded =
            excl == null
               ? [type]
               : excl == ''
               ? []
               : gatherMarks(this, excl.split(' '));
      }

      this.nodeFromJSON = this.nodeFromJSON.bind(this);
      this.markFromJSON = this.markFromJSON.bind(this);

      // :: NodeType
      // The type of the [default top node](#model.SchemaSpec.topNode)
      // for this schema.
      this.topNodeType = this.nodes[this.spec.topNode || 'doc'];

      // :: Object
      // An object for storing whatever values modules may want to
      // compute and cache per schema. (If you want to store something
      // in it, try to use property names unlikely to clash.)
      this.cached = Object.create(null);
      this.cached.wrappings = Object.create(null);
   }

   // :: (union<string, NodeType>, ?Object, ?union<Fragment, Node, [Node]>, ?[Mark]) → Node
   // Create a node in this schema. The `type` may be a string or a
   // `NodeType` instance. Attributes will be extended
   // with defaults, `content` may be a `Fragment`,
   // `null`, a `Node`, or an array of nodes.
   node(type, attrs, content, marks) {
      if (typeof type == 'string') type = this.nodeType(type);
      else if (!(type instanceof NodeType))
         throw new RangeError('Invalid node type: ' + type);
      else if (type.schema != this)
         throw new RangeError(
            'Node type from different schema used (' + type.name + ')'
         );

      return type.createChecked(attrs, content, marks);
   }

   // :: (string, ?[Mark]) → Node
   // Create a text node in the schema. Empty text nodes are not
   // allowed.
   text(text, marks) {
      let type = this.nodes.text;
      return new TextNode(type, type.defaultAttrs, text, Mark.setFrom(marks));
   }

   // :: (union<string, MarkType>, ?Object) → Mark
   // Create a mark with the given type and attributes.
   mark(type, attrs) {
      if (typeof type == 'string') type = this.marks[type];
      return type.create(attrs);
   }

   // :: (Object) → Node
   // Deserialize a node from its JSON representation. This method is
   // bound.
   nodeFromJSON(json) {
      return Node.fromJSON(this, json);
   }

   // :: (Object) → Mark
   // Deserialize a mark from its JSON representation. This method is
   // bound.
   markFromJSON(json) {
      return Mark.fromJSON(this, json);
   }

   nodeType(name) {
      let found = this.nodes[name];
      if (!found) throw new RangeError('Unknown node type: ' + name);
      return found;
   }
}

function gatherMarks(schema, marks) {
   let found = [];
   for (let i = 0; i < marks.length; i++) {
      let name = marks[i],
         mark = schema.marks[name],
         ok = mark;
      if (mark) {
         found.push(mark);
      } else {
         for (let prop in schema.marks) {
            let mark = schema.marks[prop];
            if (
               name == '_' ||
               (mark.spec.group &&
                  mark.spec.group.split(' ').indexOf(name) > -1)
            )
               found.push((ok = mark));
         }
      }
      if (!ok) throw new SyntaxError("Unknown mark type: '" + marks[i] + "'");
   }
   return found;
}
