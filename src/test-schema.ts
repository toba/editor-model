import { is } from '@toba/tools';
import { Schema } from './schema';
import { ElementSpec } from './to-dom';
import { NodeSpec } from './node-type';
import { MarkSpec } from './mark-type';
import { SimpleMap } from './types';

// https://github.com/ProseMirror/prosemirror-schema-basic/blob/master/src/schema-basic.js

/**
 * `NodeType` and `MarkType` names.
 */
export const enum TestTypeName {
   Document = 'doc',
   Paragraph = 'paragraph',
   BlockQuote = 'blockquote',
   Line = 'horizontal_rule',
   Heading = 'heading',
   CodeBlock = 'code_block',
   Text = 'text',
   Image = 'image',
   Break = 'hard_break',
   Link = 'link',
   Emphasis = 'em',
   Strong = 'strong',
   Code = 'code'
}

/**
 * Combine `NodeType` names into space-delimited string.
 */
export const typeSequence = (...types: TestTypeName[]): string =>
   types.join(' ');

export const repeatType = (times: number, type: TestTypeName): string =>
   (type + ' ').repeat(times).trimRight();

// no reason why these need the same keys as TestTypeName
const elSpec: SimpleMap<ElementSpec> = {
   [TestTypeName.Paragraph]: ['p', 0],
   [TestTypeName.BlockQuote]: ['blockquote', 0],
   line: ['hr'],
   pre: ['pre', ['code', 0]],
   break: ['br'],
   emphasis: ['em', 0],
   [TestTypeName.Strong]: ['strong', 0],
   [TestTypeName.Code]: ['code', 0]
};

export const nodes: SimpleMap<NodeSpec> = {
   /** Top level document node. */
   [TestTypeName.Document]: {
      content: 'block+'
   },

   /**
    * A plain paragraph textblock. Represented in the DOM as a `<p>` element.
    */
   [TestTypeName.Paragraph]: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => elSpec.paragraph
   },

   /** A blockquote (`<blockquote>`) wrapping one or more blocks. */
   [TestTypeName.BlockQuote]: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => elSpec.blockquote
   },

   /** A horizontal rule (`<hr>`). */
   [TestTypeName.Line]: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => elSpec.line
   },

   /**
    * A heading textblock, with a `level` attribute that should hold the number
    * 1 to 6. Parsed and serialized as `<h1>` to `<h6>` elements.
    */
   [TestTypeName.Heading]: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [
         { tag: 'h1', attrs: { level: 1 } },
         { tag: 'h2', attrs: { level: 2 } },
         { tag: 'h3', attrs: { level: 3 } },
         { tag: 'h4', attrs: { level: 4 } },
         { tag: 'h5', attrs: { level: 5 } },
         { tag: 'h6', attrs: { level: 6 } }
      ],
      toDOM: node => ['h' + node.attrs.level, 0]
   },

   /**
    * A code listing. Disallows marks or non-text inline nodes by default.
    * Represented as a `<pre>` element with a `<code>` element inside of it.
    */
   [TestTypeName.CodeBlock]: {
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM: () => elSpec.pre
   },

   /** The text node */
   [TestTypeName.Text]: {
      group: 'inline'
   },

   /**
    * An inline image (`<img>`) node. Supports `src`, `alt`, and `href`
    * attributes. The latter two default to the empty string.
    */
   [TestTypeName.Image]: {
      inline: true,
      attrs: {
         src: {},
         alt: { default: null },
         title: { default: null }
      },
      group: 'inline',
      draggable: true,
      parseDOM: [
         {
            tag: 'img[src]',
            getAttrs: el =>
               is.text(el)
                  ? undefined
                  : {
                       src: el.getAttribute('src'),
                       title: el.getAttribute('title'),
                       alt: el.getAttribute('alt')
                    }
         }
      ],
      toDOM(node) {
         let { src, alt, title } = node.attrs;
         return ['img', { src, alt, title }];
      }
   },

   /** A hard line break, represented in the DOM as `<br>`. */
   [TestTypeName.Break]: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => elSpec.break
   }
};

export const marks: SimpleMap<MarkSpec> = {
   /**
    * A link. Has `href` and `title` attributes. `title` defaults to the empty
    * string. Rendered and parsed as an `<a>` element.
    */
   [TestTypeName.Link]: {
      attrs: {
         href: {},
         title: { default: null }
      },
      inclusive: false,
      parseDOM: [
         {
            tag: 'a[href]',
            getAttrs: el =>
               is.text(el)
                  ? undefined
                  : {
                       href: el.getAttribute('href'),
                       title: el.getAttribute('title')
                    }
         }
      ],
      toDOM(node) {
         const { href, title } = node.attrs;
         return ['a', { href, title }, 0];
      }
   },

   /**
    * An emphasis mark. Rendered as an `<em>` element. Has parse rules that also
    * match `<i>` and `font-style: italic`.
    */
   [TestTypeName.Emphasis]: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM: () => elSpec.emphasis
   },

   /**
    * A strong mark. Rendered as `<strong>`, parse rules also match `<b>` and
    * `font-weight: bold`.
    */
   [TestTypeName.Strong]: {
      parseDOM: [
         { tag: 'strong' },
         // This works around a Google Docs misbehavior where
         // pasted content will be inexplicably wrapped in `<b>`
         // tags with a font-weight normal.
         {
            tag: 'b'
            // getAttrs: el =>
            //    is.text(el) ? undefined : el.style.fontWeight != 'normal' && null
         },
         {
            style: 'font-weight',
            getAttrs: value =>
               is.text(value)
                  ? /^(bold(er)?|[5-9]\d{2,})$/.test(value)
                     ? undefined
                     : false
                  : undefined
         }
      ],
      toDOM() {
         return elSpec.strong;
      }
   },

   /** Code font mark. Represented as a `<code>` element. */
   [TestTypeName.Code]: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => elSpec.code
   }
};

/**
 * This schema rougly corresponds to the document schema used by
 * [CommonMark](http://commonmark.org/), minus the list elements.
 *
 * To reuse elements from this schema, extend or read from its `spec.nodes` and
 * `spec.marks` [properties](#model.Schema.spec).
 */
export const testSchema = new Schema({ nodes, marks });
