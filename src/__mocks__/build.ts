import { EditorNode } from '../node';
import { Schema } from '../schema';

const noTag: EditorNode = ((EditorNode.prototype as any).tag = Object.create(
   null
));

function flatten(schema: Schema, children: any[], f: any) {
   const result = [];
   let pos = 0;
   let tag: any = noTag;

   for (let i = 0; i < children.length; i++) {
      let child = children[i];

      if (child.tag && child.tag != (EditorNode.prototype as any).tag) {
         if (tag == noTag) {
            tag = Object.create(null);
         }
         for (let id in child.tag) {
            tag[id] =
               child.tag[id] + (child.flat || child.isText ? 0 : 1) + pos;
         }
      }

      if (typeof child == 'string') {
         const re = /<(\w+)>/g;
         let m;
         let at = 0;
         let out = '';

         while ((m = re.exec(child))) {
            out += child.slice(at, m.index);
            pos += m.index - at;
            at = m.index + m[0].length;
            if (tag == noTag) {
               tag = Object.create(null);
            }
            tag[m[1]] = pos;
         }
         out += child.slice(at);
         pos += child.length - at;
         if (out) {
            result.push(f(schema.text(out)));
         }
      } else if (child.flat) {
         for (let j = 0; j < child.flat.length; j++) {
            let node = f(child.flat[j]);
            pos += node.nodeSize;
            result.push(node);
         }
      } else {
         let node = f(child);
         pos += node.nodeSize;
         result.push(node);
      }
   }
   return { nodes: result, tag };
}

const id = <T>(x: T): T => x;

function takeAttrs(attrs: any, args: any[]) {
   let a0 = args[0];
   if (
      !args.length ||
      (a0 && (typeof a0 == 'string' || a0 instanceof Node || a0.flat))
   ) {
      return attrs;
   }
   args.shift();

   if (!attrs) {
      return a0;
   }
   if (!a0) {
      return attrs;
   }
   let result: any = {};
   for (let prop in attrs) {
      result[prop] = attrs[prop];
   }
   for (let prop in a0) {
      result[prop] = a0[prop];
   }
   return result;
}

// : (string, ?Object) → (...content: [union<string, Node>]) → Node
// Create a builder function for nodes with content.
function block(type: any, attrs: any): any {
   let result = function(...args: any[]) {
      let myAttrs = takeAttrs(attrs, args);
      let { nodes, tag } = flatten(type.schema, args, id);
      let node = type.create(myAttrs, nodes);

      if (tag != noTag) {
         node.tag = tag;
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

// Create a builder function for marks.
function mark(type: any, attrs: any) {
   return function(...args: any[]) {
      let mark = type.create(takeAttrs(attrs, args));
      let { nodes, tag } = flatten(type.schema, args, (n: any) =>
         mark.type.isInSet(n.marks) ? n : n.mark(mark.addToSet(n.marks))
      );
      return { flat: nodes, tag };
   };
}

export function builders(
   schema: Schema,
   names?: { [key: string]: any }
): { [key: string]: EditorNode } {
   let result: { [key: string]: any } = { schema };

   for (let name in schema.nodes) {
      result[name] = block(schema.nodes[name], {});
   }
   for (let name in schema.marks) {
      result[name] = mark(schema.marks[name], {});
   }

   if (names) {
      for (let name in names) {
         const value = names[name];
         const typeName = value.nodeType || value.markType || name;
         let type;

         if ((type = schema.nodes[typeName])) {
            result[name] = block(type, value);
         } else if ((type = schema.marks[typeName])) {
            result[name] = mark(type, value);
         }
      }
   }
   return result;
}
