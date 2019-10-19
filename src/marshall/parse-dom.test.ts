import '@toba/test';
import { Schema, basicSchema } from '../schema/';
import { makeTestItems, TestNode } from '../test-tools';
import {
   a,
   doc,
   h1,
   h2,
   p,
   br,
   img,
   strong,
   em,
   blockquote,
   pre,
   code,
   ul,
   li,
   ol
} from '../test-tools/mocks';
import { DOMParser } from './parse-dom';
import { ParseOptions } from './parse-options';
import { DOMSerializer } from './to-dom';
import { Mark } from '../mark/';

// const serializer = DOMSerializer.fromSchema(testSchema);

describe('parses HTML to Schema items', () => {
   function stringToDOM(html: string): HTMLDivElement {
      const dom = document.createElement('div');
      dom.innerHTML = html;
      return dom;
   }

   const expectHTML = (doc: TestNode | undefined, html: string) => () => {
      expect(doc).toBeDefined();

      const declaredDOM = stringToDOM(html);
      const derivedDOM = document.createElement('div');
      const schema = doc!.type.schema;

      derivedDOM.appendChild(
         DOMSerializer.fromSchema(schema).serializeFragment(doc!.content, {
            document
         })
      );

      expect(derivedDOM.innerHTML).toBe(declaredDOM.innerHTML);
      expect(
         DOMParser.fromSchema(schema)
            .parse(derivedDOM)
            .toJSON()
      ).toEqual(doc!.toJSON());
   };

   it('can represent simple node', expectHTML(doc(p('hello')), '<p>hello</p>'));

   it(
      'can represent a line break',
      expectHTML(doc(p('hi', br, 'there')), '<p>hi<br/>there</p>')
   );

   it(
      'can represent an image',
      expectHTML(
         doc(p('hi', img({ alt: 'x' }), 'there')),
         '<p>hi<img src="img.png" alt="x"/>there</p>'
      )
   );

   it(
      'joins styles',
      expectHTML(
         doc(p('one', strong('two', em('three')), em('four'), 'five')),
         '<p>one<strong>two</strong><em><strong>three</strong>four</em>five</p>'
      )
   );

   it(
      'can represent links',
      expectHTML(
         doc(
            p(
               'a ',
               a({ href: 'foo' }, 'big ', a({ href: 'bar' }, 'nested'), ' link')
            )
         ),
         '<p>a <a href="foo">big </a><a href="bar">nested</a><a href="foo"> link</a></p>'
      )
   );

   it(
      'can represent an unordered list',
      expectHTML(
         doc(
            ul(li(p('one')), li(p('two')), li(p('three', strong('!')))),
            p('after')
         ),
         '<ul><li><p>one</p></li><li><p>two</p></li><li><p>three<strong>!</strong></p></li></ul><p>after</p>'
      )
   );

   it(
      'can represent an ordered list',
      expectHTML(
         doc(
            ol(li(p('one')), li(p('two')), li(p('three', strong('!')))),
            p('after')
         ),
         '<ol><li><p>one</p></li><li><p>two</p></li><li><p>three<strong>!</strong></p></li></ol><p>after</p>'
      )
   );

   it(
      'can represent a blockquote',
      expectHTML(
         doc(blockquote(p('hello'), p('bye'))),
         '<blockquote><p>hello</p><p>bye</p></blockquote>'
      )
   );

   it(
      'can represent a nested blockquote',
      expectHTML(
         doc(blockquote(blockquote(blockquote(p('he said'))), p('i said'))),
         '<blockquote><blockquote><blockquote><p>he said</p></blockquote></blockquote><p>i said</p></blockquote>'
      )
   );

   it(
      'can represent headings',
      expectHTML(
         doc(h1('one'), h2('two'), p('text')),
         '<h1>one</h1><h2>two</h2><p>text</p>'
      )
   );

   it(
      'can represent inline code',
      expectHTML(
         doc(p('text and ', code('code that is ', em('emphasized'), '...'))),
         '<p>text and <code>code that is </code><em><code>emphasized</code></em><code>...</code></p>'
      )
   );

   it(
      'can represent a code block',
      expectHTML(
         doc(blockquote(pre('some code')), p('and')),
         '<blockquote><pre><code>some code</code></pre></blockquote><p>and</p>'
      )
   );

   it(
      'supports leaf nodes in marks',
      expectHTML(doc(p(em('hi', br, 'x'))), '<p><em>hi<br>x</em></p>')
   );

   it('can parse marks on block nodes', () => {
      const nodes = basicSchema.spec.nodes!;
      const marks = basicSchema.spec.marks!;
      const commentSchema = new Schema({
         nodes: nodes!.update(
            'doc',
            Object.assign({ marks: 'comment' }, nodes.get('doc'))
         ),
         marks: marks.update('comment', {
            parseDOM: [{ tag: 'div.comment' }],
            toDOM: () => ['div', { class: 'comment' }, 0]
         })
      });
      const b = makeTestItems(commentSchema);

      expectHTML(
         b.node.doc(
            b.node.paragraph('one'),
            b.mark.comment(
               b.node.paragraph('two'),
               b.node.paragraph(b.mark.strong('three'))
            ),
            b.node.paragraph('four')
         ),
         '<p>one</p><div class="comment"><p>two</p><p><strong>three</strong></p></div><p>four</p>'
      )();
   });

   it('parses unique, non-exclusive, same-typed marks', () => {
      const nodes = basicSchema.spec.nodes!;
      const marks = basicSchema.spec.marks!;
      const commentSchema = new Schema({
         nodes: nodes,
         marks: marks.update('comment', {
            attrs: { id: { default: undefined } },
            parseDOM: [
               {
                  tag: 'span.comment',
                  getAttrs: (el: HTMLElement) => ({
                     id: parseInt(el.getAttribute('data-id')!, 10)
                  })
               }
            ],
            excludes: '',
            toDOM: (mark: Mark) => [
               'span',
               { class: 'comment', 'data-id': mark.attrs.id },
               0
            ]
         })
      });
      const b = makeTestItems(commentSchema);

      expectHTML(
         b.schema.nodes.doc.createAndFill(
            undefined,
            b.schema.nodes.paragraph.createAndFill(
               undefined,
               b.schema.text('double comment', [
                  b.schema.marks.comment.create({ id: 1 }),
                  b.schema.marks.comment.create({ id: 2 })
               ])
            )
         ),
         '<p><span class="comment" data-id="1"><span class="comment" data-id="2">double comment</span></span></p>'
      )();
   });

   it('serializes non-spanning marks correctly', () => {
      const nodes = basicSchema.spec.nodes!;
      const marks = basicSchema.spec.marks!;
      const markSchema = new Schema({
         nodes: nodes,
         marks: marks.update('test', {
            parseDOM: [{ tag: 'test' }],
            toDOM: () => ['test', 0],
            spanning: false
         })
      });
      const b = makeTestItems(markSchema);

      expectHTML(
         b.node.doc(
            b.node.paragraph(b.mark.test('a', b.node.image({ src: 'x' }), 'b'))
         ),
         '<p><test>a</test><test><img src="x"></test><test>b</test></p>'
      )();
   });
});

describe.skip('handles malformed HTML', () => {
   const parser = DOMParser.fromSchema(basicSchema);
   const expectDoc = (
      html: string,
      doc: TestNode,
      options?: ParseOptions
   ) => () => {
      const div = document.createElement('div');
      div.innerHTML = html;
      expect(parser.parse(div, options).toJSON()).toEqual(doc.toJSON());
   };

   it(
      'can recover a list item',
      expectDoc('<ol><p>Oh no</p></ol>', doc(ol(li(p('Oh no')))))
   );

   it(
      'wraps a list item in a list',
      expectDoc('<li>hey</li>', doc(ol(li(p('hey')))))
   );
});
