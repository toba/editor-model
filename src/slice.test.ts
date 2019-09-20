import '@toba/test';
import { Slice } from './slice';
import { EditorNode } from './node';
import { doc, p, li, ul, em, a, blockquote } from '@toba/editor-test';

function expectSlice(
   doc1: EditorNode,
   doc2: EditorNode,
   openStart: number,
   openEnd: number
) {
   const slice: Slice = doc1.slice(doc1.tag.a || 0, doc1.tag.b);

   expect(slice.content).toBe(doc2.content);
   expect(slice.openStart).toBe(openStart);
   expect(slice.openEnd).toBe(openEnd);
}

it('can cut half a paragraph', () =>
   expectSlice(doc(p('hello<b> world')), doc(p('hello')), 0, 1));

it('can cut to the end of a pragraph', () =>
   expectSlice(doc(p('hello<b>')), doc(p('hello')), 0, 1));

it('leaves off extra content', () =>
   expectSlice(doc(p('hello<b> world'), p('rest')), doc(p('hello')), 0, 1));

it('preserves styles', () =>
   expectSlice(
      doc(p('hello ', em('WOR<b>LD'))),
      doc(p('hello ', em('WOR'))),
      0,
      1
   ));

it('can cut multiple blocks', () =>
   expectSlice(doc(p('a'), p('b<b>')), doc(p('a'), p('b')), 0, 1));

it('can cut to a top-level position', () =>
   expectSlice(doc(p('a'), '<b>', p('b')), doc(p('a')), 0, 0));

it('can cut to a deep position', () =>
   expectSlice(
      doc(blockquote(ul(li(p('a')), li(p('b<b>'))))),
      doc(blockquote(ul(li(p('a')), li(p('b'))))),
      0,
      4
   ));

it('can cut everything after a position', () =>
   expectSlice(doc(p('hello<a> world')), doc(p(' world')), 1, 0));

it('can cut from the start of a textblock', () =>
   expectSlice(doc(p('<a>hello')), doc(p('hello')), 1, 0));

it('leaves off extra content before', () =>
   expectSlice(doc(p('foo'), p('bar<a>baz')), doc(p('baz')), 1, 0));

it('preserves styles after cut', () =>
   expectSlice(
      doc(p('a sentence with an ', em('emphasized ', a('li<a>nk')), ' in it')),
      doc(p(em(a('nk')), ' in it')),
      1,
      0
   ));

it('preserves styles started after cut', () =>
   expectSlice(
      doc(p('a ', em('sentence'), ' wi<a>th ', em('text'), ' in it')),
      doc(p('th ', em('text'), ' in it')),
      1,
      0
   ));

it('can cut from a top-level position', () =>
   expectSlice(doc(p('a'), '<a>', p('b')), doc(p('b')), 0, 0));

it('can cut from a deep position', () =>
   expectSlice(
      doc(blockquote(ul(li(p('a')), li(p('<a>b'))))),
      doc(blockquote(ul(li(p('b'))))),
      4,
      0
   ));

it('can cut part of a text node', () =>
   expectSlice(doc(p('hell<a>o wo<b>rld')), p('o wo'), 0, 0));

it('can cut across paragraphs', () =>
   expectSlice(doc(p('on<a>e'), p('t<b>wo')), doc(p('e'), p('t')), 1, 1));

it('can cut part of marked text', () =>
   expectSlice(
      doc(p("here's noth<a>ing and ", em("here's e<b>m"))),
      p('ing and ', em("here's e")),
      0,
      0
   ));

it('can cut across different depths', () =>
   expectSlice(
      doc(ul(li(p('hello')), li(p('wo<a>rld')), li(p('x'))), p(em('bo<b>o'))),
      doc(ul(li(p('rld')), li(p('x'))), p(em('bo'))),
      3,
      1
   ));

it('can cut between deeply nested nodes', () =>
   expectSlice(
      doc(
         blockquote(
            p('foo<a>bar'),
            ul(li(p('a')), li(p('b'), '<b>', p('c'))),
            p('d')
         )
      ),
      blockquote(p('bar'), ul(li(p('a')), li(p('b')))),
      1,
      2
   ));

it('can include parents', () => {
   const d = doc(blockquote(p('fo<a>o'), p('bar<b>')));
   const slice = d.slice(d.tag.a, d.tag.b, true);

   expect(slice.toString()).toBe(
      '<blockquote(paragraph("o"), paragraph("bar"))>(2,2)'
   );
});
