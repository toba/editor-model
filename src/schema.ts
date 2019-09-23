import { is } from '@toba/tools';
import { OrderedMap } from './ordered-map';
import { EditorNode, NodeJSON } from './node';
import { TextNode } from './text-node';
import { Mark, MarkJSON } from './mark';
import { ContentMatch } from './content';
import { NodeType, NodeSpec } from './node-type';
import { MarkType, MarkSpec } from './mark-type';
import { Attributes } from './attribute';
import { Fragment } from './fragment';
import { SimpleMap } from './types';

/**
 * An object describing a schema.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L297
 */
export interface SchemaSpec {
   /**
    * The node types in this schema. Maps names to `NodeSpec` objects that
    * describe the node type associated with that name. Their order is
    * significant — it determines which [parse rules](#model.NodeSpec.parseDOM)
    * take precedence by default, and which nodes come first in a given
    * [group](#model.NodeSpec.group).
    */
   nodes?: SimpleMap<NodeSpec> | OrderedMap<NodeSpec>;

   /**
    * The mark types that exist in this schema. The order in which they are
    * provided determines the order in which [mark sets](#model.Mark.addToSet)
    * are sorted and in which [parse rules](#model.MarkSpec.parseDOM) are tried.
    */
   marks?: SimpleMap<MarkSpec> | OrderedMap<MarkSpec>;

   /**
    * The name of the default top-level node for the schema. Defaults to
    * `"doc"`.
    */
   topNode?: string;
}

/**
 * A document schema. Holds `NodeType` and `MarkType` objects for the nodes and
 * marks that may occur in conforming documents, and provides functionality for
 * creating and deserializing such documents.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L462
 */
export class Schema {
   /**
    * The `SchemaSpec` on which the schema is based, with the added guarantee
    * that its `nodes` and `marks` properties are `OrderedMap` instances (not
    * raw objects).
    */
   spec: SchemaSpec;
   /** An object mapping the schema's node names to node type objects */
   nodes: SimpleMap<NodeType>;
   /** Mark types keyed to their names */
   marks: SimpleMap<MarkType>;
   /** Type of the default top node (usually a "doc") for this schema */
   topNodeType: NodeType | undefined;

   /**
    * An object for storing whatever values modules may want to compute and
    * cache per schema.
    */
   cached: SimpleMap<any>;

   /**
    * Construct a schema from a `SchemaSpec`.
    */
   constructor(spec: SchemaSpec) {
      this.spec = {
         topNode: spec.topNode
      };

      if (spec.nodes !== undefined) {
         this.spec.nodes = OrderedMap.from<NodeSpec>(spec.nodes);
         this.nodes = NodeType.compile(this.spec.nodes, this);
      } else {
         this.nodes = new Object(null) as SimpleMap<NodeType>;
      }

      if (spec.marks !== undefined) {
         this.spec.marks = OrderedMap.from<MarkSpec>(spec.marks);
         this.marks = MarkType.compile(this.spec.marks, this);
      } else {
         this.marks = new Object(null) as SimpleMap<MarkType>;
      }

      /** Cache of matches keyed to expression */
      const contentExprCache: SimpleMap<ContentMatch> = Object.create(null);

      for (let key in this.nodes) {
         if (key in this.marks) {
            throw new RangeError(key + ' can not be both a node and a mark');
         }
         const type: NodeType = this.nodes[key];
         const contentExpr: string = type.spec.content || '';
         const markExpr: string | undefined = type.spec.marks;

         let match = contentExprCache[contentExpr];

         if (match === undefined) {
            match = ContentMatch.parse(contentExpr, this.nodes);
            contentExprCache[contentExpr] = match;
         }
         type.contentMatch = match;
         type.inlineContent = match.inlineContent;
         type.markSet =
            markExpr == '_'
               ? null
               : markExpr
               ? gatherMarks(this, markExpr.split(' '))
               : markExpr == '' || !type.inlineContent
               ? []
               : null;
      }

      for (let key in this.marks) {
         const type: MarkType = this.marks[key];
         const excl = type.spec.excludes;

         type.excluded =
            excl == null
               ? [type]
               : excl == ''
               ? []
               : gatherMarks(this, excl.split(' '));
      }

      this.topNodeType = this.nodes[this.spec.topNode || 'doc'];
      this.cached = {
         wrappings: {}
      };
   }

   /**
    * Create a node in this schema. The `type` may be a string or a `NodeType`
    * instance. Attributes will be extended with defaults, `content` may be a
    * `Fragment`, `null`, a `Node`, or an array of nodes.
    */
   node(
      type: string | NodeType,
      attrs?: Attributes,
      content?: Fragment | EditorNode | EditorNode[],
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
      const type: NodeType | undefined = this.nodes['text'];
      if (type === undefined) {
         throw new Error(`MarkType ${type} not found`);
      }
      return new TextNode(type, type.defaultAttrs, text, Mark.setFrom(marks));
   }

   /**
    * Create a mark with the given type and attributes.
    */
   mark(type: string | MarkType, attrs: Attributes): Mark {
      if (is.text(type)) {
         const maybeType: MarkType | undefined = this.marks[type];
         if (maybeType === undefined) {
            // TODO: why not handled in ProseMirror?
            throw new Error(`MarkType ${type} not found`);
         }
         type = maybeType;
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
      const found = this.nodes[name];

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
      const mark = schema.marks[name];
      let found = mark !== undefined;

      if (found) {
         matches.push(mark);
      } else {
         for (let key in schema.marks) {
            const mark = schema.marks[key];
            if (name == '_' || mark.isInGroup(name)) {
               found = true;
               matches.push(mark);
            }
         }
      }
      if (!found) {
         throw new SyntaxError("Unknown mark type: '" + name + "'");
      }
   });

   return matches;
}
