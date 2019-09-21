type tagMap = { [key: string]: boolean };

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
 * The block-level tags in HTML5.
 */
export const blockTags: tagMap = {
   address: true,
   article: true,
   aside: true,
   blockquote: true,
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
   hr: true,
   li: true,
   noscript: true,
   ol: true,
   output: true,
   p: true,
   pre: true,
   section: true,
   table: true,
   tfoot: true,
   ul: true
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
export const listTags: tagMap = { ol: true, ul: true };
