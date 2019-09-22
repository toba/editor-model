import { basicSchema as basic } from './basic-schema';
//import { addListNodes } from 'prosemirror-schema-list';
import { Schema } from '../schema';
import { makeMockers } from './build';

const testSchema = new Schema({
   nodes: basic.spec.nodes,
   marks: basic.spec.marks
});

export const mock = makeMockers(testSchema, {
   p: { type: 'paragraph' },
   pre: { type: 'code_block' },
   h1: { type: 'heading', attrs: { level: 1 } },
   h2: { type: 'heading', attrs: { level: 2 } },
   h3: { type: 'heading', attrs: { level: 3 } },
   //li: { type: 'list_item' },
   //ul: { type: 'bullet_list' },
   //ol: { type: 'ordered_list' },
   br: { type: 'hard_break' },
   img: { type: 'image', attrs: { src: 'img.png' } },
   hr: { type: 'horizontal_rule', isMark: true },
   a: { type: 'link', attrs: { href: 'foo' } }
});

export const p = mock.node['p'];
export const pre = mock.node['pre'];
export const h1 = mock.node['h1'];
export const h2 = mock.node['h2'];
export const h3 = mock.node['h3'];
// export const li = mock.node['li'];
// export const ul = mock.node['ul'];
// export const ol = mock.node['ol'];
export const br = mock.node['br'];
export const img = mock.node['img'];
export const hr = mock.node['hr'];
export const a = mock.node['a'];
export const doc = mock.node['doc'];
export const em = mock.mark['em'];
export const blockquote = mock.node['blockquote'];
