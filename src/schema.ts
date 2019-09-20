import { ValueType, is } from '@toba/tools';
import { OrderedMap } from './ordered-map';
import { EditorNode, NodeSpec, NodeJSON } from './node';
import { TextNode } from './text-node';
import { Mark, MarkSpec, MarkJSON } from './mark';
import { ContentMatch } from './content';
import { NodeType } from './node-type';
import { MarkType } from './mark-type';
import { AttributeMap } from './attribute';
import { Fragment } from './fragment';

/**
 * An object describing a schema, as passed to the [`Schema`](#model.Schema)
 * constructor.
 */
export interface SchemaSpec {
   /**
    * The node types in this schema. Maps names to [`NodeSpec`](#model.NodeSpec)
    * objects that describe the node type associated with that name. Their order
    * is significant — it determines which [parse rules](#model.NodeSpec.parseDOM)
    * take precedence by default, and which nodes come first in a given
    * [group](#model.NodeSpec.group).
    */
   nodes?: NodeSpec | OrderedMap<NodeSpec>;

   /**
    * The mark types that exist in this schema. The order in which they are
    * provided determines the order in which [mark sets](#model.Mark.addToSet)
    * are sorted and in which [parse rules](#model.MarkSpec.parseDOM) are tried.
    */
   marks?: MarkSpec | OrderedMap<MarkSpec>;

   /**
    * The name of the default top-level node for the schema. Defaults to
    * `"doc"`.
    */
   topNode?: string;
}

/**
 * A document schema. Holds [node](#model.NodeType) and
 * [mark type](#model.MarkType) objects for the nodes and marks that may occur
 * in conforming documents, and provides functionality for creating and
 * deserializing such documents.
 */
export class Schema {
   /**
    * The [spec](#model.SchemaSpec) on which the schema is based, with the added
    * guarantee that its `nodes` and `marks` properties are
    * [`OrderedMap`](https://github.com/marijnh/orderedmap) instances (not raw
    * objects).
    */
   spec: SchemaSpec;
   /** An object mapping the schema's node names to node type objects */
   nodes: OrderedMap<NodeType>;
   /** Mark types keyed to their names */
   marks: OrderedMap<MarkType>;
   /**
    * The type of the [default top node](#model.SchemaSpec.topNode) for this
    * schema.
    */
   topNodeType: NodeType;

   /**
    * An object for storing whatever values modules may want to compute and
    * cache per schema. (If you want to store something in it, try to use
    * property names unlikely to clash.)
    */
   cached: { [key: string]: any };

   /**
    * Construct a schema from a `SchemaSpec`.
    */
   constructor(spec: SchemaSpec) {
      this.spec = {};

      let prop: keyof SchemaSpec;

      for (prop in spec) {
         this.spec[prop] = spec[prop];
      }
      if (spec.nodes !== undefined) {
         this.spec.nodes = OrderedMap.from<NodeSpec>(spec.nodes);
      }
      if (spec.marks !== undefined) {
         this.spec.marks = OrderedMap.from<MarkSpec>(spec.marks);
      }
      this.nodes = NodeType.compile(this.spec.nodes, this);
      this.marks = MarkType.compile(this.spec.marks, this);

      let contentExprCache = Object.create(null);

      for (let prop in this.nodes) {
         if (prop in this.marks) {
            throw new RangeError(prop + ' can not be both a node and a mark');
         }
         const type: NodeType = this.nodes[prop];
         const contentExpr: string = type.spec.content || '';
         const markExpr: string | undefined = type.spec.marks;

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
         const type = this.marks[prop];
         const excl = type.spec.excludes;

         type.excluded =
            excl == null
               ? [type]
               : excl == ''
               ? []
               : gatherMarks(this, excl.split(' '));
      }

      this.nodeFromJSON = this.nodeFromJSON.bind(this);
      this.markFromJSON = this.markFromJSON.bind(this);
      this.topNodeType = this.nodes[this.spec.topNode || 'doc'];
      this.cached = Object.create(null);
      this.cached.wrappings = Object.create(null);
   }

   /**
    * Create a node in this schema. The `type` may be a string or a `NodeType`
    * instance. Attributes will be extended with defaults, `content` may be a
    * `Fragment`, `null`, a `Node`, or an array of nodes.
    */
   node(
      type: string | NodeType,
      attrs?: AttributeMap,
      content?: Fragment | EditorNode | EditorNode[] | null,
      marks?: Mark[]
   ): EditorNode {
      if (is.text(type)) {
         type = this.nodeType(type);
      } else if (!(type instanceof NodeType)) {
         throw new RangeError('Invalid node type: ' + type);
      } else if (type.schema !== this) {
         throw new RangeError(
            'Node type from different schema used (' + type.name + ')'
         );
      }
      return type.createChecked(attrs, content, marks);
   }

   /**
    * Create a text node in the schema. Empty text nodes are not allowed.
    */
   text(text: string, marks?: Mark[] | null): TextNode {
      const type: NodeType = this.nodes.text;
      return new TextNode(type, type.defaultAttrs, text, Mark.setFrom(marks));
   }

   /**
    * Create a mark with the given type and attributes.
    */
   mark(type: string | MarkType, attrs: AttributeMap): Mark {
      if (is.text(type)) {
         type = this.marks.get(type);
      }
      return type.create(attrs);
   }

   /**
    * Deserialize a node from its JSON representation. This method is bound.
    */
   nodeFromJSON = (json: NodeJSON): EditorNode =>
      EditorNode.fromJSON(this, json);

   /**
    * Deserialize a mark from its JSON representation. This method is bound.
    */
   markFromJSON = (json: MarkJSON): Mark => Mark.fromJSON(this, json);

   nodeType(name: string): NodeType {
      const found = this.nodes.get(name);

      if (found === undefined) {
         throw new RangeError('Unknown node type: ' + name);
      }
      return found;
   }
}

/**
 * Mark types in schema matching names.
 */
function gatherMarks(schema: Schema, names: string[]): MarkType[] {
   const matches: MarkType[] = [];

   names.forEach(name => {
      const mark = schema.marks.get(name);
      let found = mark !== undefined;

      if (found) {
         matches.push(mark!);
      } else {
         schema.marks.forEach((_, mark) => {
            if (name == '_' || mark.isInGroup(name)) {
               found = true;
               matches.push(mark);
            }
         });
      }
      if (!found) {
         throw new SyntaxError("Unknown mark type: '" + name + "'");
      }
   });

   return matches;
}
