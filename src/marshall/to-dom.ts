import { is, DuoList, makeDuoList } from '@toba/tools';
import { Schema } from '../schema/';
import { Mark, MarkType } from '../mark/';
import {
   Attributes,
   EditorNode,
   NodeType,
   TextNode,
   Fragment as EditorFragment
} from '../node/';
import { SimpleMap } from '../types';

/**
 * Array describing a DOM element. The first value in the array should be a
 * string — the name of the DOM element. If the second element is plain object,
 * it is interpreted as a set of attributes for the element. Any elements after
 * that (including the 2nd if it's not an attribute object) are interpreted as
 * children of the DOM elements, and must either be valid `DOMOutputSpec`
 * values, or the number zero.
 *
 * The number zero (pronounced “hole”) is used to indicate the place where a
 * node's child nodes should be inserted. If it occurs in an output spec, it
 * should be the only child element in its parent node.
 *
 * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html#optional-elements-in-tuple-types
 */
type TreeSpec<T> = [
   string,
   (Attributes | T | 0)?,
   (T | 0)?, // ugly until recursive types are supported (see comment below)
   (T | 0)?,
   (T | 0)?,
   (T | 0)?
];

// trick to support recursive types until 3.7
// https://stackoverflow.com/questions/47842266/recursive-types-in-typescript
export interface ElementSpec extends TreeSpec<ElementSpec> {}

/**
 * Represent `DOMOutputSpec` rendered to DOM.
 */
interface Rendered {
   /**
    * Rendered Document node.
    */
   node: Node;
   /**
    * If `DOMOutputSpec` has a hole (zero) in it then this will reference its
    * content.
    */
   contentNode?: Node;
}

/**
 * A description of a DOM structure. Can be either a string, which is
 * interpreted as a text node, a DOM node, which is interpreted as itself, or an
 * `ElementSpec`.
 */
export type DOMOutputSpec = string | Node | ElementSpec;

/**
 * Convert an `EditorNode` to a description of its DOM implementation.
 */
export type NodeSerializer = (node: EditorNode) => DOMOutputSpec;

/**
 * Convert a `Mark` to a description of its DOM implementation
 * @param inline Whether the mark's content is block or inline content (for
 * typical use, it will always be inline)
 */
export type MarkSerializer = (mark: Mark, inline: boolean) => DOMOutputSpec;

interface SerializeOptions {
   /**
    * Optional method to call when `RenderedSpec.contentNode` exists.
    */
   onContent?: (
      node: EditorNode,
      contentNode: Node,
      options: SerializeOptions
   ) => void;
   /**
    * When not in the browser, `document` should be passed so the serializer
    * can create nodes.
    */
   document?: Document;
}

/**
 * A DOM serializer converts editor nodes and marks to DOM nodes.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/to_dom.js#L21
 */
export class DOMSerializer {
   /** Node serialization functions keyed to node type name */
   nodes: SimpleMap<NodeSerializer>;
   /**
    * Mark serialization functions keyed to mark type name. If the serializer
    * for a key is `null` then those mark types should not be serizlied.
    */
   marks: SimpleMap<MarkSerializer | null>;

   /**
    * @param nodes Node serializers keyed to node names
    * @param marks Mark serializers keyed to mark names (value may be `null` to
    * indicate that marks of that type should not be serialized)
    */
   constructor(
      nodes: SimpleMap<NodeSerializer> = Object.create(null),
      marks: SimpleMap<MarkSerializer | null> = Object.create(null)
   ) {
      this.nodes = nodes;
      this.marks = marks;
   }

   /**
    * Serialize content of an editor fragment to the DOM.
    */
   serializeFragment(
      fragment: EditorFragment,
      options: SerializeOptions = Object.create(null),
      target?: Node
   ): Node {
      if (target === undefined) {
         target = doc(options).createDocumentFragment();
      }
      let top: Node = target;
      /** Active marks and their DOM rendering */
      let active: DuoList<Mark, Node> | null = null;

      fragment.forEachChild(child => {
         if (active !== null || child.marks.length > 0) {
            if (active === null) {
               active = makeDuoList<Mark, Node>();
            }
            let keep = 0;
            /** Count of already rendered marks */
            let rendered = 0;

            while (keep < active.size() && rendered < child.marks.length) {
               const next: Mark = child.marks[rendered];

               if (this.marks[next.type.name] === null) {
                  rendered++;
                  continue;
               }
               if (
                  !next.equals(active.item(keep)![0]) ||
                  next.type.spec.spanning === false
               ) {
                  break;
               }
               keep++;
               rendered++;
            }

            while (keep < active.size()) {
               const [_, n] = active.pop()!;
               top = n;
            }

            while (rendered < child.marks.length) {
               /** Mark to be rendered */
               const add: Mark = child.marks[rendered++];
               /** Rendered mark */
               const markDOM = this.serializeMark(add, child.isInline, options);

               if (markDOM !== null) {
                  active.push(add, top);
                  top.appendChild(markDOM.node);
                  top = markDOM.contentNode || markDOM.node;
               }
            }
         }
         top.appendChild(this.serializeNode(child, options));
      });

      return target;
   }

   /**
    * Serialize editor node to a DOM node. This can be useful when you need to
    * serialize a part of a document, as opposed to the whole document. To
    * serialize a whole document, use
    * [`serializeFragment`](#model.DOMSerializer.serializeFragment) on its
    * [content](#model.Node.content).
    */
   serializeNode(
      node: EditorNode,
      options: SerializeOptions = Object.create(null)
   ): Node {
      const serializer: NodeSerializer = this.nodes[node.type.name];
      const spec: DOMOutputSpec = serializer(node);
      const rendered = DOMSerializer.renderSpec(doc(options), spec);

      if (rendered.contentNode !== undefined) {
         if (node.isLeaf) {
            throw new RangeError(
               'Content hole not allowed in a leaf node spec'
            );
         }
         if (is.callable(options.onContent)) {
            options.onContent(node, rendered.contentNode, options);
         } else {
            this.serializeFragment(node.content, options, rendered.contentNode);
         }
      }
      return rendered.node;
   }

   serializeNodeAndMarks(
      node: EditorNode,
      options: SerializeOptions = Object.create(null)
   ): Node {
      let dom: Node = this.serializeNode(node, options);

      for (let i = node.marks.length - 1; i >= 0; i--) {
         const wrap = this.serializeMark(node.marks[i], node.isInline, options);

         if (wrap !== null) {
            (wrap.contentNode || wrap.node).appendChild(dom);
            dom = wrap.node;
         }
      }
      return dom;
   }

   serializeMark(
      mark: Mark,
      inline: boolean,
      options: SerializeOptions = Object.create(null)
   ) {
      const toDOM: MarkSerializer | null = this.marks[mark.type.name];

      return toDOM === null
         ? null
         : DOMSerializer.renderSpec(doc(options), toDOM(mark, inline));
   }

   /**
    * Render `DOMOutputSpec` to the DOM.
    */
   static renderSpec(doc: Document, spec: DOMOutputSpec): Rendered {
      if (is.text(spec)) {
         return { node: doc.createTextNode(spec) };
      }

      if (spec instanceof Node) {
         return { node: spec };
      }
      const el: HTMLElement = doc.createElement(spec[0]);
      const attrs = spec[1];

      /** Inner content within a "0" hole */
      let contentDOM: Node | undefined = undefined;
      /** Whether to start iterating child definitions in the spec */
      let start = 1;

      if (
         attrs !== undefined &&
         is.object(attrs) &&
         //attrs.nodeType === undefined &&
         !Array.isArray(attrs)
      ) {
         start = 2;

         for (let name in attrs) {
            const value = attrs[name];
            if (value !== null) {
               el.setAttribute(name, value.toString());
            }
         }
      }

      for (let i = start; i < spec.length; i++) {
         const child = spec[i]!;

         if (child === 0) {
            // a content placeholder, a "hole"
            if (i < spec.length - 1 || i > start) {
               throw new RangeError(
                  'Content hole must be the only child of its parent node'
               );
            }
            return { node: el, contentNode: el };
         } else {
            const {
               node: inner,
               contentNode: maybeContent
            } = DOMSerializer.renderSpec(doc, child as ElementSpec);

            el.appendChild(inner);

            if (maybeContent !== undefined) {
               if (contentDOM !== undefined) {
                  throw new RangeError('Multiple content holes');
               }
               contentDOM = maybeContent;
            }
         }
      }
      return { node: el, contentNode: contentDOM };
   }

   /**
    * Build a serializer using the [`toDOM`](#model.NodeSpec.toDOM) properties
    * in a schema's node and mark specs.
    */
   static fromSchema(schema: Schema): DOMSerializer {
      return (
         schema.cached.domSerializer ||
         (schema.cached.domSerializer = new DOMSerializer(
            this.nodesFromSchema(schema),
            this.marksFromSchema(schema)
         ))
      );
   }

   /**
    * Gather the serializers in a schema's node specs into an object. This can
    * be useful as a base to build a custom serializer from.
    */
   static nodesFromSchema(schema: Schema): SimpleMap<NodeSerializer> {
      const result = gatherToDOM(schema.nodes);

      if (!result.text) {
         result.text = node => (node as TextNode).text;
      }
      return result;
   }

   /**
    * Gather the serializers in a schema's mark specs into an object.
    */
   static marksFromSchema = (schema: Schema): SimpleMap<MarkSerializer> =>
      gatherToDOM(schema.marks);
}

function gatherToDOM<T extends MarkType | NodeType>(types: SimpleMap<T>) {
   type S = T extends MarkType ? MarkSerializer : NodeSerializer;
   const result: SimpleMap<S> = Object.create(null);

   for (let key in types) {
      const type: T = types[key];
      if (type.spec.toDOM !== undefined) {
         result[key] = type.spec.toDOM as S;
      }
   }
   return result;
}

/**
 * DOM document from options or the global window.
 */
const doc = (options: SerializeOptions): Document =>
   options.document || window.document;
