import '@toba/test';
import { doc, p, h1, h2, strong, em, blockquote } from './__mocks__';
import { TestNode } from './test-maker';

describe('findDiffStart', () => {
   function expectStart(a: TestNode, b: TestNode) {
      expect(a.tag).toBeDefined();
      expect(a.content.findDiffStart(b.content)).toBe(a.tag!['a']);
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

   it('notices when one node is shorter', () =>
      expectStart(
         doc(
            p('a', em('b')),
            p('hello'),
            blockquote(h1('bye')),
            '<a>',
            p('oops')
         ),
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')))
      ));

   it('notices differing marks', () =>
      expectStart(doc(p('a<a>', em('b'))), doc(p('a', strong('b')))));

   it('stops at longer text', () =>
      expectStart(doc(p('foo<a>bar', em('b'))), doc(p('foo', em('b')))));

   it('stops at a different character', () =>
      expectStart(doc(p('foo<a>bar')), doc(p('foocar'))));

   it('stops at a different node type', () =>
      expectStart(doc(p('a'), '<a>', p('b')), doc(p('a'), h1('b'))));

   it('works when the difference is at the start', () =>
      expectStart(doc('<a>', p('b')), doc(h1('b'))));

   it('notices a different attribute', () =>
      expectStart(doc(p('a'), '<a>', h1('foo')), doc(p('a'), h2('foo'))));
});
