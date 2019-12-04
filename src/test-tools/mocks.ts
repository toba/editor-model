import '@toba/test';
import { makeTestItems } from '.';
import { basicSchema, SchemaTag as tag } from '../schema';

export { basicSchema as schema } from '../schema';

/**
 * @see https://github.com/ProseMirror/prosemirror-test-builder/blob/master/src/index.js
 */
export const items = makeTestItems(basicSchema, {
   p: { type: tag.Paragraph },
   pre: { type: tag.CodeBlock },
   h1: { type: tag.Heading, attrs: { level: 1 } },
   h2: { type: tag.Heading, attrs: { level: 2 } },
   h3: { type: tag.Heading, attrs: { level: 3 } },
   // li: { type: TestTypeName.ListItem },
   // ul: { type: TestTypeName.BulletList },
   // ol: { type: TestTypeName.OrderedList },
   br: { type: tag.Break },
   img: { type: tag.Image, attrs: { src: 'img.png' } },
   hr: { type: tag.Line },
   a: { type: tag.Link, isMark: true, attrs: { href: 'foo' } }
});

/** Root node */
// confusing that some names match the Item and others do not
export const doc = items.node[tag.Document];
export const blockquote = items.node[tag.BlockQuote];
export const p = items.node['p'];
export const pre = items.node['pre'];
export const h1 = items.node['h1'];
export const h2 = items.node['h2'];
export const h3 = items.node['h3'];
export const br = items.node['br'];
export const img = items.node['img'];
export const hr = items.node['hr'];
export const li = items.node[tag.ListItem];
export const ol = items.node[tag.OrderedList];
export const ul = items.node[tag.BulletList];
export const a = items.mark['a'];
export const em = items.mark[tag.Emphasis];
export const code = items.mark['code'];
export const strong = items.mark['strong'];
