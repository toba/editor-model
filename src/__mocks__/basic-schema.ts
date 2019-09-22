import { is } from '@toba/tools';
import { Schema } from '../schema';
import { ElementSpec } from '../to-dom';
import { NodeSpec } from '../node-type';
import { MarkSpec } from '../mark-type';

const el: { [key: string]: ElementSpec } = {
   p: ['p', 0],
   blockquote: ['blockquote', 0],
   hr: ['hr'],
   pre: ['pre', ['code', 0]],
   br: ['br'],
   em: ['em', 0],
   strong: ['strong', 0],
   code: ['code', 0]
};

export const nodes: { [key: string]: NodeSpec } = {
   /** Top level document node. */
   doc: {
      content: 'block+'
   },

   /**
    * A plain paragraph textblock. Represented in the DOM as a `<p>` element.
    */
   paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => el.p
   },

   /** A blockquote (`<blockquote>`) wrapping one or more blocks. */
   blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => el.blockquote
   },

   /** A horizontal rule (`<hr>`). */
   horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => el.hr
   },

   /**
    * A heading textblock, with a `level` attribute that should hold the number
    * 1 to 6. Parsed and serialized as `<h1>` to `<h6>` elements.
    */
   heading: {
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
   code_block: {
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM: () => el.pre
   },

   /** The text node */
   text: {
      group: 'inline'
   },

   /**
    * An inline image (`<img>`) node. Supports `src`, `alt`, and `href`
    * attributes. The latter two default to the empty string.
    */
   image: {
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
   hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => el.brDOM
   }
};

export const marks: { [key: string]: MarkSpec } = {
   /**
    * A link. Has `href` and `title` attributes. `title` defaults to the empty
    * string. Rendered and parsed as an `<a>` element.
    */
   link: {
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
   em: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM: () => el.em
   },

   /**
    * A strong mark. Rendered as `<strong>`, parse rules also match `<b>` and
    * `font-weight: bold`.
    */
   strong: {
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
         return el.strong;
      }
   },

   /** Code font mark. Represented as a `<code>` element. */
   code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => el.code
   }
};

/**
 * This schema rougly corresponds to the document schema used by
 * [CommonMark](http://commonmark.org/), minus the list elements.
 *
 * To reuse elements from this schema, extend or read from its `spec.nodes` and
 * `spec.marks` [properties](#model.Schema.spec).
 */
export const basicSchema = new Schema({ nodes, marks });
