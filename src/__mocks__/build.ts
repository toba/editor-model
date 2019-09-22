import { is } from '@toba/tools';
import { EditorNode } from '../node';
import { Schema } from '../schema';
import { MarkType } from '../mark-type';
import { Attributes } from '../attribute';
import { Mark } from '../mark';
import { NodeType } from '../node-type';

export interface MockSpec {
   type: string;
   attrs?: Attributes;
   isMark?: boolean;
}

export type NodeMaker = (...args: any[]) => EditorNode;
export type MarkMaker = (
   ...args: any[]
) => { flat: EditorNode[]; tags: MockTag };

export interface Mocker {
   schema: Schema;
   node: { [key: string]: NodeMaker };
   mark: { [key: string]: MarkMaker };
}

type MockTag = { [key: string]: number };

const noTags = Object.create(null);

class MockNode extends EditorNode {
   tag?: MockTag = noTags;
   flat?: EditorNode[];
}

/**
 * @see https://github.com/ProseMirror/prosemirror-test-builder/blob/master/src/build.js#L5
 */
function flatten(
   schema: Schema,
   children: (EditorNode | string)[],
   fn: (n: EditorNode) => EditorNode = (n: EditorNode) => n
) {
   const result: EditorNode[] = [];
   let pos = 0;
   let tags: MockTag = noTags;

   for (let i = 0; i < children.length; i++) {
      let child: EditorNode | string = children[i];

      if (!is.text(child)) {
         const node = child as MockNode;

         if (node.tag !== undefined && node.tag !== MockNode.prototype.tag) {
            if (tags === noTags) {
               tags = Object.create(null);
            }
            for (let id in node.tag) {
               tags[id] =
                  node.tag[id] + (node.flat || child.isText ? 0 : 1) + pos;
            }
         }
         if (node.flat !== undefined) {
            // send flat nodes through transform function then add to result
            node.flat.map(fn).forEach(n => {
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

const noop = <T>(x: T): T => x;

// function takeAttrs(
//    attrs: Attributes | undefined,
//    ...args: (EditorNode | string)[]
// ) {
//    let a0 = args[0];
//    if (
//       !args.length ||
//       (a0 && (typeof a0 == 'string' || a0 instanceof EditorNode || a0.flat))
//    ) {
//       return attrs;
//    }
//    args.shift();

//    if (!attrs) {
//       return a0;
//    }
//    if (!a0) {
//       return attrs;
//    }
//    let result: any = {};

//    for (let prop in attrs) {
//       result[prop] = attrs[prop];
//    }
//    for (let prop in a0) {
//       result[prop] = a0[prop];
//    }
//    return result;
// }

// : (string, ?Object) → (...content: [union<string, Node>]) → Node
/**
 * Create a builder function for nodes with content.
 *
 * @see
 */
function nodeMaker(type: NodeType, attrs?: Attributes): NodeMaker {
   const result = function(...args: (string | EditorNode)[]) {
      //const myAttrs = takeAttrs(attrs, args);
      const { nodes, tags } = flatten(type.schema, args);
      const node = type.create(attrs, nodes) as MockNode;

      if (tags !== noTags) {
         node.tag = tags;
      }
      return node;
   };
   if (type.isLeaf) {
      try {
         (result as any).flat = [type.create(attrs)];
      } catch (_) {}
   }
   return result;
}

/**
 * Create a builder function for marks.
 */
const markMaker = (type: MarkType, attrs?: Attributes): MarkMaker =>
   function(...args: (string | EditorNode)[]) {
      const mark: Mark = type.create(attrs); //takeAttrs(attrs, args));
      const { nodes, tags } = flatten(type.schema, args, (n: EditorNode) =>
         mark.type.isInSet(n.marks) ? n : n.mark(mark.addToSet(n.marks))
      );
      return { flat: nodes, tags };
   };

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
