import { is } from '@toba/tools';
import { Schema } from './schema';
import { NodeSpec } from './node-type';
import { MarkSpec } from './mark-type';
import { SimpleMap } from './types';

// https://github.com/ProseMirror/prosemirror-schema-basic/blob/master/src/schema-basic.js

/**
 * `NodeType` and `MarkType` names.
 */
export const enum Item {
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
   Code = 'code',
   OrderedList = 'ordered_list',
   ListItem = 'list_item',
   BulletList = 'bullet_list'
}

export const enum Group {
   Block = 'block',
   Inline = 'inline'
}

/**
 * Combine `NodeType` names into space-delimited string.
 */
export const typeSequence = (...types: Item[]): string => types.join(' ');

export const repeatType = (times: number, type: Item): string =>
   (type + ' ').repeat(times).trimRight();

export const nodes: SimpleMap<NodeSpec> = {
   /** Top level document node. */
   [Item.Document]: {
      content: `${Group.Block}+`
   },

   /**
    * A plain paragraph textblock. Represented in the DOM as a `<p>` element.
    */
   [Item.Paragraph]: {
      content: `${Group.Inline}*`,
      group: Group.Block,
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0]
   },

   /** A blockquote (`<blockquote>`) wrapping one or more blocks. */
   [Item.BlockQuote]: {
      content: `${Group.Block}+`,
      group: Group.Block,
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0]
   },

   /** A horizontal rule (`<hr>`). */
   [Item.Line]: {
      group: Group.Block,
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr']
   },

   /**
    * A heading textblock, with a `level` attribute that should hold the number
    * 1 to 6. Parsed and serialized as `<h1>` to `<h6>` elements.
    */
   [Item.Heading]: {
      attrs: { level: { default: 1 } },
      content: `${Group.Inline}*`,
      group: Group.Block,
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
   [Item.CodeBlock]: {
      content: `${Item.Text}*`,
      marks: '',
      group: Group.Block,
      code: true,
      defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM: () => ['pre', ['code', 0]]
   },

   /** The text node */
   [Item.Text]: {
      group: Group.Inline
   },

   /**
    * An inline image (`<img>`) node. Supports `src`, `alt`, and `href`
    * attributes. The latter two default to the empty string.
    */
   [Item.Image]: {
      inline: true,
      attrs: {
         src: {},
         alt: { default: null },
         title: { default: null }
      },
      group: Group.Inline,
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
         const { src, alt, title } = node.attrs;
         return ['img', { src, alt, title }];
      }
   },

   /** A hard line break, represented in the DOM as `<br>`. */
   [Item.Break]: {
      inline: true,
      group: Group.Inline,
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br']
   },

   /**
    * An ordered list `NodeSpec`. Has a single attribute, `order`, which
    * determines the number at which the list starts counting, and defaults to
    * 1. Represented as an `<ol>` element.
    */
   [Item.OrderedList]: {
      attrs: { order: { default: 1 } },
      content: `${Item.ListItem}+`,
      group: Group.Block,
      parseDOM: [
         {
            tag: 'ol',
            getAttrs: el =>
               is.text(el)
                  ? undefined
                  : {
                       order: el.hasAttribute('start')
                          ? +el.getAttribute('start')!
                          : 1
                    }
         }
      ],
      toDOM(node) {
         return node.attrs.order == 1
            ? ['ol', 0]
            : ['ol', { start: node.attrs.order }, 0];
      }
   },

   [Item.BulletList]: {
      content: 'list_item+',
      group: Group.Block,
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0]
   },

   [Item.ListItem]: {
      content: `${Item.Paragraph} (${Item.OrderedList} | ${Item.BulletList})*`,
      parseDOM: [{ tag: 'li' }],
      toDOM: () => ['li', 0],
      defining: true
   }
};

export const marks: SimpleMap<MarkSpec> = {
   /**
    * A link. Has `href` and `title` attributes. `title` defaults to the empty
    * string. Rendered and parsed as an `<a>` element.
    */
   [Item.Link]: {
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
   [Item.Emphasis]: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0]
   },

   /**
    * A strong mark. Rendered as `<strong>`, parse rules also match `<b>` and
    * `font-weight: bold`.
    */
   [Item.Strong]: {
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
      toDOM: () => ['strong', 0]
   },

   /** Code font mark. Represented as a `<code>` element. */
   [Item.Code]: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0]
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
