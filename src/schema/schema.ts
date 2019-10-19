import { is, forEach } from '@toba/tools';
import { OrderedMap } from '../ordered-map';
import {
   Attributes,
   Fragment,
   EditorNode,
   NodeJSON,
   TextNode,
   NodeType,
   NodeSpec
} from '../node';
import { Mark, MarkJSON, MarkType, MarkSpec } from '../mark';
import { ContentMatch } from '../match';
import { SimpleMap } from '../types';
import { SchemaSpec } from './schema-spec';

/**
 * Each editor [document](http://prosemirror.net/docs/guide/#doc) has a schema
 * associated with it. The schema describes the kind of
 * [`EditorNode`s](http://prosemirror.net/docs/ref/#model.Node) that may occur
 * in the document, and the way they are nested. For example, it might say that
 * the top-level node can contain one or more blocks, and that paragraph nodes
 * can contain any number of inline nodes, with any
 * [marks](http://prosemirror.net/docs/ref/#model.Mark) applied to them.
 *
 * @see http://prosemirror.net/docs/guide/#schema
 *
 * A document schema. Holds `NodeType` and `MarkType` objects for the nodes and
 * marks that may occur in conforming documents, and provides functionality for
 * creating and deserializing such documents.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L462
 */
export class Schema {
   /** The `SchemaSpec` on which the schema is based */
   spec: SchemaSpec;
   /** `NodeType`s keyed to their names */
   nodes: SimpleMap<NodeType>;
   /** `MarkType`s keyed to their names */
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

      /** Cache of matches keyed to patterns */
      const matchCache: SimpleMap<ContentMatch> = Object.create(null);

      for (let typeName in this.nodes) {
         if (typeName in this.marks) {
            throw new RangeError(
               typeName + ' cannot be both a node and a mark'
            );
         }
         const type: NodeType = this.nodes[typeName];
         const pattern: string = type.spec.content || '';
         const markExpr: string | undefined = type.spec.marks;

         let match = matchCache[pattern];

         if (match === undefined) {
            match = ContentMatch.parse(pattern, this.nodes);
            matchCache[pattern] = match;
         }
         type.contentMatch = match;
         type.inlineContent = match.inlineContent;
         type.allowedMarks =
            markExpr == '_'
               ? null
               : markExpr
               ? marksWithTypeNames(this, markExpr.split(' '))
               : markExpr == '' || !type.inlineContent
               ? []
               : null;
      }

      for (let typeName in this.marks) {
         const type: MarkType = this.marks[typeName];
         const exclude = type.spec.excludes;

         type.excluded =
            exclude === undefined
               ? [type]
               : exclude == ''
               ? []
               : marksWithTypeNames(this, exclude.split(' '));
      }

      this.topNodeType = this.nodes[this.spec.topNode || 'doc'];
      this.cached = {
         wrappings: {}
      };
   }

   /**
    * Create a node in this schema. The `type` may be a string or a `NodeType`
    * instance. Attributes will be extended with defaults, `content` may be a
    * `Fragment`, `undefined`, a `Node`, or an array of nodes.
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
      return type.createAndValidate(attrs, content, marks);
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

   /**
    * `NodeType` with the given name. If not found, an exception is raised.
    */
   nodeType(name: string): NodeType {
      const found = this.nodes[name];

      if (found === undefined) {
         throw new RangeError('Unknown node type: ' + name);
      }
      return found;
   }
}

/**
 * Mark types in a schema that have one of the given `MarkType` names.
 */
function marksWithTypeNames(schema: Schema, names: string[]): MarkType[] {
   const matches: MarkType[] = [];

   forEach(names, name => {
      const mark = schema.marks[name];
      let found = mark !== undefined;

      if (found) {
         matches.push(mark);
      } else {
         for (let typeName in schema.marks) {
            const mark = schema.marks[typeName];
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
