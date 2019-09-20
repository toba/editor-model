import { is } from '@toba/tools';
import { Node as EditorNode } from './node';
import { Mark } from './mark';
import { Fragment as EditorFragment } from './fragment';
import { Schema } from './schema';
import { MarkType } from './mark-type';
import { NodeType } from './node-type';
import { TextNode } from './text-node';

/**
 * An array describing a DOM element. The first value in the array should be a
 * string — the name of the DOM element. If the second element is plain object,
 * it is interpreted as a set of attributes for the element. Any elements after
 * that (including the 2nd if it's not an attribute object) are interpreted as
 * children of the DOM elements, and must either be valid `DOMOutputSpec`
 * values, or the number zero.
 *
 * The number zero (pronounced “hole”) is used to indicate the place where a
 * node's child nodes should be inserted. If it occurs in an output spec, it
 * should be the only child element in its parent node.
 */
type DOMArray = [string, { [key: string]: any }];

/**
 * A description of a DOM structure. Can be either a string, which is
 * interpreted as a text node, a DOM node, which is interpreted as itself, or a
 * `DOMArray`.
 */
export type DOMOutputSpec = string | Node | DOMArray;
export type NodeSerializer = (node: EditorNode) => DOMOutputSpec;
export type MarkSerializer = (mark: Mark, inline: boolean) => DOMOutputSpec;

interface SerializeNodeOptions {
   onContent?: (node: EditorNode, contentDOM: Node, options: any) => void;
}

/**
 * A DOM serializer knows how to convert ProseMirror nodes and marks of various
 * types to DOM nodes.
 */
export class DOMSerializer {
   /** Node serialization functions keyed to node type name */
   nodes: { [key: string]: NodeSerializer };
   /** Mark serialization functions keyed to mark type name */
   marks: { [key: string]: MarkSerializer | null };

   /**
    * Create a serializer. `nodes` should map node names to functions that take
    * a node and return a description of the corresponding DOM. `marks` does the
    * same for mark names, but also gets an argument that tells it whether the
    * mark's content is block or inline content (for typical use, it'll always
    * be inline). A mark serializer may be `null` to indicate that marks of that
    * type should not be serialized.
    */
   constructor(
      nodes: { [key: string]: NodeSerializer } = {},
      marks: { [key: string]: MarkSerializer | null } = {}
   ) {
      this.nodes = nodes;
      this.marks = marks;
   }

   /**
    * Serialize the content of this fragment to a DOM fragment. When not in the
    * browser, the `document` option, containing a DOM document, should be
    * passed so that the serializer can create nodes.
    */
   serializeFragment(
      fragment: EditorFragment,
      options = {},
      target
   ): DocumentFragment {
      if (!target) {
         target = doc(options).createDocumentFragment();
      }

      let top = target;
      let active: Mark[] | null = null;

      fragment.forEach(node => {
         if (active !== null || node.marks.length) {
            if (active === null) {
               active = [];
            }
            let keep = 0;
            let rendered = 0;

            while (keep < active.length && rendered < node.marks.length) {
               const next: Mark = node.marks[rendered];

               if (this.marks[next.type.name] === null) {
                  rendered++;
                  continue;
               }
               if (
                  !next.eq(active[keep]) ||
                  next.type.spec.spanning === false
               ) {
                  break;
               }
               keep += 2;
               rendered++;
            }

            while (keep < active.length) {
               top = active.pop();
               active.pop();
            }

            while (rendered < node.marks.length) {
               const add: Mark = node.marks[rendered++];
               const markDOM = this.serializeMark(add, node.isInline, options);

               if (markDOM) {
                  active.push(add, top);
                  top.appendChild(markDOM.dom);
                  top = markDOM.contentDOM || markDOM.dom;
               }
            }
         }
         top.appendChild(this.serializeNode(node, options));
      });

      return target;
   }

   /**
    * Serialize this node to a DOM node. This can be useful when you need to
    * serialize a part of a document, as opposed to the whole document. To
    * serialize a whole document, use
    * [`serializeFragment`](#model.DOMSerializer.serializeFragment) on its
    * [content](#model.Node.content).
    */
   serializeNode(node: EditorNode, options: SerializeNodeOptions = {}): Node {
      const { dom, contentDOM } = DOMSerializer.renderSpec(
         doc(options),
         this.nodes[node.type.name](node)
      );
      if (contentDOM !== undefined) {
         if (node.isLeaf) {
            throw new RangeError(
               'Content hole not allowed in a leaf node spec'
            );
         }
         if (is.callable(options.onContent)) {
            options.onContent(node, contentDOM, options);
         } else {
            this.serializeFragment(node.content, options, contentDOM);
         }
      }
      return dom;
   }

   serializeNodeAndMarks(node: EditorNode, options = {}): Node {
      let dom: Node = this.serializeNode(node, options);

      for (let i = node.marks.length - 1; i >= 0; i--) {
         const wrap = this.serializeMark(node.marks[i], node.isInline, options);
         if (wrap) {
            (wrap.contentDOM || wrap.dom).appendChild(dom);
            dom = wrap.dom;
         }
      }
      return dom;
   }

   serializeMark(mark: Mark, inline: boolean, options = {}) {
      const toDOM: MarkSerializer | null = this.marks[mark.type.name];

      return (
         toDOM && DOMSerializer.renderSpec(doc(options), toDOM(mark, inline))
      );
   }

   // :: (dom.Document, DOMOutputSpec) → {dom: dom.Node, contentDOM: ?dom.Node}
   // Render an [output spec](#model.DOMOutputSpec) to a DOM node. If
   // the spec has a hole (zero) in it, `contentDOM` will point at the
   // node with the hole.
   static renderSpec(
      doc: Document,
      structure: DOMOutputSpec
   ): { dom: Node; contentDOM?: Node } {
      if (typeof structure == 'string') {
         return { dom: doc.createTextNode(structure) };
      }
      if (structure.nodeType !== null) {
         return { dom: structure };
      }
      const dom = doc.createElement(structure[0]);
      const attrs = structure[1];
      let contentDOM = null;
      let start = 1;

      if (
         attrs &&
         typeof attrs == 'object' &&
         attrs.nodeType == null &&
         !Array.isArray(attrs)
      ) {
         start = 2;
         for (let name in attrs) {
            if (attrs[name] != null) dom.setAttribute(name, attrs[name]);
         }
      }
      for (let i = start; i < structure.length; i++) {
         let child = structure[i];
         if (child === 0) {
            if (i < structure.length - 1 || i > start)
               throw new RangeError(
                  'Content hole must be the only child of its parent node'
               );
            return { dom, contentDOM: dom };
         } else {
            let {
               dom: inner,
               contentDOM: innerContent
            } = DOMSerializer.renderSpec(doc, child);
            dom.appendChild(inner);
            if (innerContent) {
               if (contentDOM) throw new RangeError('Multiple content holes');
               contentDOM = innerContent;
            }
         }
      }
      return { dom, contentDOM };
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
   static nodesFromSchema(schema: Schema): { [key: string]: NodeSerializer } {
      const result = gatherToDOM(schema.nodes);

      if (!result.text) {
         result.text = node => ((node as any) as TextNode).text;
      }
      return result;
   }

   /**
    * Gather the serializers in a schema's mark specs into an object.
    */
   static marksFromSchema = (
      schema: Schema
   ): { [key: string]: MarkSerializer } => gatherToDOM(schema.marks);
}

function gatherToDOM<T extends MarkType | NodeType>(types: {
   [key: string]: T;
}) {
   type S = T extends MarkType ? MarkSerializer : NodeSerializer;
   const result: { [key: string]: S } = {};

   for (let name in types) {
      const toDOM = types[name].spec.toDOM;

      if (toDOM !== undefined) {
         result[name] = toDOM as any;
      }
   }
   return result;
}

/**
 * Return DOM document from options or global window.
 */
const doc = (options: any): Document => options.document || window.document;
