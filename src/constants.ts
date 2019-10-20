import { SimpleMap } from './types';

type tagMap = SimpleMap<boolean>;

/**
 * @see https://www.w3schools.com/jsref/prop_node_nodetype.asp
 */
export const enum HtmlNodeType {
   Element = 1,
   Attribute = 2,
   /** Text content of an element or attribute */
   Text = 3,
   CDATA = 4,
   EntityReference = 5,
   Entity = 6,
   ProcessingInstruction = 7,
   Comment = 8,
   /** Root of the DOM tree */
   Document = 9,
   DocumentType = 10,
   DocumentFragment = 11,
   /** Notation declared in the DTD */
   Notation = 12
}

/**
 * Bitfield for node context options.
 */
export const enum Whitespace {
   Preserve = 1,
   Full = 2,
   OpenLeft = 4
}

/**
 * Tags used to render editor content to DOM.
 */
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

/**
 * The block-level tags in HTML5.
 */
export const blockTags: tagMap = {
   address: true,
   article: true,
   aside: true,
   [DOMTag.BlockQuote]: true,
   canvas: true,
   dd: true,
   div: true,
   dl: true,
   fieldset: true,
   figcaption: true,
   figure: true,
   footer: true,
   form: true,
   h1: true,
   h2: true,
   h3: true,
   h4: true,
   h5: true,
   h6: true,
   header: true,
   hgroup: true,
   [DOMTag.Line]: true,
   [DOMTag.ListItem]: true,
   noscript: true,
   [DOMTag.OrderedList]: true,
   output: true,
   [DOMTag.Paragraph]: true,
   [DOMTag.CodeBlock]: true,
   section: true,
   table: true,
   tfoot: true,
   [DOMTag.BulletList]: true
};

/**
 * The tags that we normally ignore.
 */
export const ignoreTags: tagMap = {
   head: true,
   noscript: true,
   object: true,
   script: true,
   style: true,
   title: true
};

/**
 * List tags.
 */
export const listTags: tagMap = {
   [DOMTag.OrderedList]: true,
   [DOMTag.BulletList]: true
};
