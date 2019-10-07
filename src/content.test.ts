import '@toba/test';
import { Schema } from './schema';
import { ContentMatch } from './content';
import { basicSchema } from './__mocks__/basic-schema';
import { NodeType } from './node-type';
import { EditorNode } from './node';
import { Fragment } from './fragment';

// https://github.com/ProseMirror/prosemirror-model/blob/master/test/test-content.js

const schema = new Schema({
   nodes: basicSchema.spec.nodes,
   marks: basicSchema.spec.marks
});

const get = (expr: string): ContentMatch =>
   ContentMatch.parse(expr, schema.nodes);

function match(expr: string, types?: string): boolean {
   const ts: NodeType[] =
      types !== undefined ? types.split(' ').map(t => schema.nodes[t]) : [];

   let m: ContentMatch | null = get(expr);

   for (let i = 0; m !== null && i < ts.length; i++) {
      m = m.matchType(ts[i]);
   }
   return m !== null && m.validEnd;
}

function valid(expr: string, types: string) {
   expect(match(expr, types)).toBe(true);
}
function invalid(expr: string, types: string) {
   expect(match(expr, types)).toBe(false);
}

function fill(
   expr: string,
   before: EditorNode,
   after: EditorNode,
   result?: EditorNode
) {
   const m: ContentMatch | null = get(expr).matchFragment(before.content);
   let filled: Fragment | undefined = undefined;

   if (m !== null) {
      filled = m.fillBefore(after.content, true);
   }

   if (result !== undefined) {
      expect(filled).toEqual(result.content);
   } else {
      expect(filled).not.toBeDefined();
   }
}

function fill3(
   expr: string,
   before: EditorNode,
   mid: EditorNode,
   after: EditorNode,
   left?: EditorNode,
   right?: EditorNode
) {
   const m = get(expr);
   const aMatch = m.matchFragment(before.content);

   let a: Fragment | undefined;
   let b: Fragment | undefined;

   if (aMatch !== null) {
      a = aMatch.fillBefore(mid.content);
   }

   if (a !== undefined) {
      const bMatch = m.matchFragment(
         before.content.append(a).append(mid.content)
      );
      if (bMatch !== null) {
         b = bMatch.fillBefore(after.content, true);
      }
   }

   if (left !== undefined && right !== undefined) {
      expect(a).toEqual(left.content);
      expect(b).toEqual(right.content);
   } else {
      expect(b).not.toBeDefined();
   }
}

it('accepts empty content for the empty expr', () => valid('', ''));
