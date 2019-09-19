import OrderedMap from 'ordered-map';
import { Node } from './node';
import { TextNode } from './text-node';
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
