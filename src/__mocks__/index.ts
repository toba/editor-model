import { basicSchema as basic } from './basic-schema';
import { addListNodes } from 'prosemirror-schema-list';
import { Schema } from '../schema';
import { EditorNode } from '../node';
import { builders } from './build';

const testSchema = new Schema({
   nodes: addListNodes(basic.spec.nodes as any, 'paragraph block*', 'block'),
   marks: basic.spec.marks
});

export const nodes = builders(testSchema, {
   p: { nodeType: 'paragraph' },
   pre: { nodeType: 'code_block' },
   h1: { nodeType: 'heading', level: 1 },
   h2: { nodeType: 'heading', level: 2 },
   h3: { nodeType: 'heading', level: 3 },
   li: { nodeType: 'list_item' },
   ul: { nodeType: 'bullet_list' },
   ol: { nodeType: 'ordered_list' },
   br: { nodeType: 'hard_break' },
   img: { nodeType: 'image', src: 'img.png' },
   hr: { nodeType: 'horizontal_rule' },
   a: { markType: 'link', href: 'foo' }
});

export const eq = (a: any, b: any) => a.eq(b);
export const p: Node = nodes['p'];
export const pre: Node = nodes['pre'];
export const h1: Node = nodes['h1'];
export const h2: Node = nodes['h2'];
export const h3: Node = nodes['h3'];
export const li: Node = nodes['li'];
export const ul: Node = nodes['ul'];
export const ol: Node = nodes['ol'];
export const br: Node = nodes['br'];
export const img: Node = nodes['img'];
export const hr: Node = nodes['hr'];
export const a: Node = nodes['a'];
export const doc: Node = nodes['doc'];
export const em: Node = nodes['em'];
export const blockquote: Node = nodes['blockquote'];
