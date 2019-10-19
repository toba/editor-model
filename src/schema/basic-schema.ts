import { is } from '@toba/tools';
import { Schema } from './schema';
import { NodeSpec } from '../node';
import { MarkSpec } from '../mark';
import { SimpleMap } from '../types';
import { OrderedMap } from '../ordered-map';

// https://github.com/ProseMirror/prosemirror-schema-basic/blob/master/src/schema-basic.js

/**
 * `NodeType` and `MarkType` names.
 */
export const enum SchemaTag {
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

export const enum DOMTag {
   BlockQuote = 'blockquote',
   Break = 'br',
   Bold = 'b',
   BulletList = 'ul',
   Code = 'code',
   CodeBlock = 'pre',
   Emphasis = 'em',
   Image = 'img',
   Italic = 'i',
   Line = 'hr',
   Link = 'a',
   ListItem = 'li',
   OrderedList = 'ol',
   Paragraph = 'p',
   Strong = 'strong'
}

export const enum Group {
   Block = 'block',
   Inline = 'inline'
}

export const nodes: SimpleMap<NodeSpec> = {
   /** Top level document node. */
   [SchemaTag.Document]: {
      content: `${Group.Block}+`
   },

   /**
    * A plain paragraph textblock. Represented in the DOM as a `<p>` element.
    */
   [SchemaTag.Paragraph]: {
      content: `${Group.Inline}*`,
      group: Group.Block,
      parseDOM: [{ tag: DOMTag.Paragraph }],
      toDOM: () => [DOMTag.Paragraph, 0]
   },

   /** A blockquote (`<blockquote>`) wrapping one or more blocks. */
   [SchemaTag.BlockQuote]: {
      content: `${Group.Block}+`,
      group: Group.Block,
      defining: true,
      parseDOM: [{ tag: DOMTag.BlockQuote }],
      toDOM: () => [DOMTag.BlockQuote, 0]
   },

   /** A horizontal rule (`<hr>`). */
   [SchemaTag.Line]: {
      group: Group.Block,
      parseDOM: [{ tag: DOMTag.Line }],
      toDOM: () => [DOMTag.Line]
   },

   /**
    * A heading textblock, with a `level` attribute that should hold the number
    * 1 to 6. Parsed and serialized as `<h1>` to `<h6>` elements.
    */
   [SchemaTag.Heading]: {
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
   [SchemaTag.CodeBlock]: {
      content: `${SchemaTag.Text}*`,
      marks: '',
      group: Group.Block,
      code: true,
      defining: true,
      parseDOM: [{ tag: DOMTag.CodeBlock, preserveSpace: 'full' }],
      toDOM: () => [DOMTag.CodeBlock, [DOMTag.Code, 0]]
   },

   /** The text node */
   [SchemaTag.Text]: {
      group: Group.Inline
   },

   /**
    * An inline image (`<img>`) node. Supports `src`, `alt`, and `href`
    * attributes. The latter two default to the empty string.
    */
   [SchemaTag.Image]: {
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
            tag: `${DOMTag.Image}[src]`,
            getAttrs: (el: HTMLElement | string) =>
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
         return [DOMTag.Image, { src, alt, title }];
      }
   },

   /** A hard line break, represented in the DOM as `<br>`. */
   [SchemaTag.Break]: {
      inline: true,
      group: Group.Inline,
      selectable: false,
      parseDOM: [{ tag: DOMTag.Break }],
      toDOM: () => [DOMTag.Break]
   },

   /**
    * An ordered list `NodeSpec`. Has a single attribute, `order`, which
    * determines the number at which the list starts counting, and defaults to
    * 1. Represented as an `<ol>` element.
    */
   [SchemaTag.OrderedList]: {
      attrs: { order: { default: 1 } },
      content: `${SchemaTag.ListItem}+`,
      group: Group.Block,
      parseDOM: [
         {
            tag: DOMTag.OrderedList,
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
            ? [DOMTag.OrderedList, 0]
            : [DOMTag.OrderedList, { start: node.attrs.order }, 0];
      }
   },

   [SchemaTag.BulletList]: {
      content: `${SchemaTag.ListItem}+`,
      group: Group.Block,
      parseDOM: [{ tag: DOMTag.BulletList }],
      toDOM: () => [DOMTag.BulletList, 0]
   },

   [SchemaTag.ListItem]: {
      content: `${SchemaTag.Paragraph} (${SchemaTag.OrderedList} | ${SchemaTag.BulletList})*`,
      parseDOM: [{ tag: DOMTag.ListItem }],
      toDOM: () => [DOMTag.ListItem, 0],
      defining: true
   }
};

export const marks: SimpleMap<MarkSpec> = {
   /**
    * A link. Has `href` and `title` attributes. `title` defaults to the empty
    * string. Rendered and parsed as an `<a>` element.
    */
   [SchemaTag.Link]: {
      attrs: {
         href: {},
         title: { default: null }
      },
      inclusive: false,
      parseDOM: [
         {
            tag: `${DOMTag.Link}[href]`,
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
         return [DOMTag.Link, { href, title }, 0];
      }
   },

   /**
    * An emphasis mark. Rendered as an `<em>` element. Has parse rules that also
    * match `<i>` and `font-style: italic`.
    */
   [SchemaTag.Emphasis]: {
      parseDOM: [
         { tag: DOMTag.Italic },
         { tag: DOMTag.Emphasis },
         { style: 'font-style=italic' }
      ],
      toDOM: () => [DOMTag.Emphasis, 0]
   },

   /**
    * A strong mark. Rendered as `<strong>`, parse rules also match `<b>` and
    * `font-weight: bold`.
    */
   [SchemaTag.Strong]: {
      parseDOM: [
         { tag: DOMTag.Strong },
         { tag: DOMTag.Bold },
         {
            // This works around a Google Docs misbehavior where
            // pasted content will be inexplicably wrapped in `<b>`
            // tags with a font-weight normal.
            style: 'font-weight',
            getAttrs: value =>
               is.text(value)
                  ? /^(bold(er)?|[5-9]\d{2,})$/.test(value)
                     ? undefined
                     : false
                  : undefined
         }
      ],
      toDOM: () => [DOMTag.Strong, 0]
   },

   /** Code font mark. Represented as a `<code>` element. */
   [SchemaTag.Code]: {
      parseDOM: [{ tag: DOMTag.Code }],
      toDOM: () => [DOMTag.Code, 0]
   }
};

/**
 * This schema rougly corresponds to the document schema used by
 * [CommonMark](http://commonmark.org/).
 *
 * To reuse elements from this schema, extend or read from its `spec.nodes` and
 * `spec.marks`.
 */
export const basicSchema = new Schema({
   nodes: OrderedMap.from(nodes),
   marks: OrderedMap.from(marks)
});
