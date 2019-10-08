import { is } from '@toba/tools';
import { EditorNode } from '../node';
import { Schema } from '../schema';
import { MarkType } from '../mark-type';
import { Attributes } from '../attribute';
import { Mark } from '../mark';
import { NodeType } from '../node-type';
import { SimpleMap } from '../types';
import { forEach } from '../list';
import { SchemaType } from './basic-schema';

const noTags = Object.create(null);

/**
 * Specification to create a node or mark.
 */
export interface MockSpec {
   type: SchemaType;
   attrs?: Attributes;
   /** Whether spec is for a `Mark` rather than an `EditorNode` */
   isMark?: boolean;
}

export type MockTag = SimpleMap<number>;

export class MockNode extends EditorNode {
   flat?: EditorNode[];
   tag?: MockTag = noTags;
}

export interface MockMark {
   flat?: EditorNode[];
   tag?: MockTag;
}

export type MockChild = string | MockNode | MockMark;
export type MarkMaker = (...args: MockChild[]) => MockMark;
/**
 * A `NodeMaker` may pose directly as a `MockNode` with `flat` values when it
 * is for a leaf Node that cant't have children.
 */
export interface NodeMaker {
   (...args: MockChild[]): MockNode;
   flat?: EditorNode[];
}

export interface Mocker {
   schema: Schema;
   node: SimpleMap<NodeMaker>;
   mark: SimpleMap<MarkMaker>;
}

/**
 * @see https://github.com/ProseMirror/prosemirror-test-builder/blob/master/src/build.js#L5
 */
function flatten(
   schema: Schema,
   children: MockChild[],
   fn: (n: EditorNode) => EditorNode = (n: EditorNode) => n
) {
   const result: EditorNode[] = [];
   let pos = 0;
   let tags: MockTag = noTags;

   for (let i = 0; i < children.length; i++) {
      let child: MockChild = children[i];

      if (!is.text(child)) {
         const node = child as MockNode;

         if (node.tag !== undefined && node.tag !== MockNode.prototype.tag) {
            if (tags === noTags) {
               tags = Object.create(null);
            }
            for (let id in node.tag) {
               tags[id] =
                  node.tag[id] + (node.flat || node.isText ? 0 : 1) + pos;
            }
         }
         if (node.flat !== undefined) {
            // send flat nodes through transform function then add to result
            forEach(node.flat.map(fn), n => {
               pos += n.nodeSize;
               result.push(n);
            });
         } else {
            const n = fn(node);
            pos += n.nodeSize;
            result.push(n);
         }
      } else {
         const re = /<(\w+)>/g;
         let m;
         let at = 0;
         let out = '';

         while ((m = re.exec(child))) {
            out += child.slice(at, m.index);
            pos += m.index - at;
            at = m.index + m[0].length;

            if (tags == noTags) {
               tags = Object.create(null);
            }
            tags[m[1]] = pos;
         }
         out += child.slice(at);
         pos += child.length - at;

         if (out) {
            result.push(fn(schema.text(out)));
         }
      }
   }
   return { nodes: result, tags };
}

function takeAttrs(
   attrs: Attributes | undefined,
   args: (MockChild | Attributes)[]
): Attributes | undefined {
   const arg1 = args[0];

   if (
      args.length == 0 ||
      (arg1 !== undefined &&
         (is.text(arg1) || arg1 instanceof MockNode || arg1.flat !== undefined))
   ) {
      // arg1 is string, MockMark or MockNode
      return attrs;
   }
   // if still here then arg1 is Attributes
   args.shift();

   if (attrs === undefined) {
      return arg1 as Attributes;
   }
   if (arg1 === undefined) {
      return attrs;
   }
   let result: Attributes = {};

   for (let prop in attrs) {
      result[prop] = attrs[prop];
   }
   for (let prop in arg1 as Attributes) {
      result[prop] = (arg1 as Attributes)[prop];
   }
   return result;
}

/**
 * Create a builder function for nodes with content.
 *
 * @see https://github.com/ProseMirror/prosemirror-test-builder/blob/master/src/build.js#L61
 */
function nodeMaker(type: NodeType, attrs?: Attributes): NodeMaker {
   const result = function(...children: MockChild[]) {
      const allAttrs = takeAttrs(attrs, children);
      const { nodes, tags } = flatten(type.schema, children);
      const node = type.create(allAttrs, nodes) as MockNode;

      if (tags !== noTags) {
         node.tag = tags;
      }
      return node;
   };

   if (type.isLeaf) {
      // NodeMaker may be used directly as a MockNode since it can have no
      // children
      try {
         result.flat = [type.create(attrs)];
      } catch (_) {}
   }
   return result;
}

/**
 * Create a builder function for marks.
 *
 * @see https://github.com/ProseMirror/prosemirror-test-builder/blob/master/src/build.js#L73
 */
const markMaker = (type: MarkType, attrs?: Attributes): MarkMaker =>
   function(...children: MockChild[]) {
      const mark: Mark = type.create(takeAttrs(attrs, children));
      const { nodes, tags } = flatten(type.schema, children, (n: EditorNode) =>
         mark.type.isInSet(n.marks) ? n : n.mark(mark.addToSet(n.marks))
      );
      return { flat: nodes, tag: tags };
   };

/**
 * If `specs` are supplied having the same name as `schema` members, the
 * `schema` members will be replaced.
 */
export function makeMockers(
   schema: Schema,
   specs?: { [tag: string]: MockSpec }
): Mocker {
   const result: Mocker = { schema, node: {}, mark: {} };

   for (let name in schema.nodes) {
      result.node[name] = nodeMaker(schema.nodes[name], {});
   }
   for (let name in schema.marks) {
      result.mark[name] = markMaker(schema.marks[name], {});
   }

   if (specs !== undefined) {
      for (let tag in specs) {
         const spec: MockSpec = specs[tag];

         if (spec.isMark === true) {
            const type = schema.marks[spec.type];
            if (type !== undefined) {
               result.mark[tag] = markMaker(type, spec.attrs);
            }
         } else {
            const type = schema.nodes[spec.type];
            if (type !== undefined) {
               result.node[tag] = nodeMaker(type, spec.attrs);
            }
         }
      }
   }
   return result;
}
