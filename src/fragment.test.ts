import '@toba/test';
import { doc, p, hr, br, img, h1, em, blockquote } from './__mocks__';
import { TestNode } from './test-maker';

describe('findDiffStart', () => {
   function expectStart(a: TestNode, b: TestNode) {
      expect(a.content.findDiffStart(b.content)).toBe(a.tag![a]);
   }

   it('returns null for identical nodes', () =>
      expectStart(
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye'))),
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')))
      ));

   it('notices when one node is longer', () =>
      expectStart(
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')), '<a>'),
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')), p('oops'))
      ));
});
