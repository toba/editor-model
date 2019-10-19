import '@toba/test';
import { doc, p, em, blockquote } from '../test-tools/mocks';

const testDoc = doc(p('ab'), blockquote(p(em('cd'), 'ef')));

const _doc = { node: testDoc, start: 0, end: 12 };
const _p1 = { node: testDoc.child(0), start: 1, end: 3 };
const _blk = { node: testDoc.child(1), start: 5, end: 11 };
const _p2 = { node: _blk.node.child(0), start: 6, end: 10 };

describe('resolve position', () => {
   it('should reflect the document structure', () => {
      const expected: { [key: number]: any[] } = {
         0: [_doc, 0, null, _p1.node],
         1: [_doc, _p1, 0, null, 'ab'],
         2: [_doc, _p1, 1, 'a', 'b'],
         3: [_doc, _p1, 2, 'ab', null],
         4: [_doc, 4, _p1.node, _blk.node],
         5: [_doc, _blk, 0, null, _p2.node],
         6: [_doc, _blk, _p2, 0, null, 'cd'],
         7: [_doc, _blk, _p2, 1, 'c', 'd'],
         8: [_doc, _blk, _p2, 2, 'cd', 'ef'],
         9: [_doc, _blk, _p2, 3, 'e', 'f'],
         10: [_doc, _blk, _p2, 4, 'ef', null],
         11: [_doc, _blk, 6, _p2.node, null],
         12: [_doc, 12, _blk.node, null]
      };

      for (let pos = 0; pos <= testDoc.content.size; pos++) {
         const $pos = testDoc.resolve(pos);
         const exp: any = expected[pos];

         expect($pos.depth).toBe(exp.length - 4);

         for (let i = 0; i < exp.length - 3; i++) {
            expect($pos.node(i).equals(exp[i].node)).toBe(true);
            expect($pos.start(i)).toBe(exp[i].start);
            expect($pos.end(i)).toBe(exp[i].end);

            if (i) {
               expect($pos.before(i)).toBe(exp[i].start - 1);
               expect($pos.after(i)).toBe(exp[i].end + 1);
            }
         }
         expect($pos.parentOffset).toBe(exp[exp.length - 3]);

         const before = $pos.nodeBefore;
         const eBefore = exp[exp.length - 2];

         expect(before).not.toBeNull();
         expect(typeof eBefore == 'string' ? before!.textContent : before).toBe(
            eBefore
         );

         const after = $pos.nodeAfter;
         const eAfter = exp[exp.length - 1];

         expect(after).not.toBeNull();
         expect(typeof eAfter == 'string' ? after!.textContent : after).toBe(
            eAfter
         );
      }
   });
});
