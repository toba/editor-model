import { is } from '@toba/tools';
import { EditorNode, wrapMarks, NodeJSON } from './node';
import { NodeType } from './node-type';
import { Attributes } from './attribute';
import { Mark } from './mark';

export class TextNode extends EditorNode {
   text: string;

   constructor(
      type: NodeType,
      attrs: Attributes | null,
      content: string,
      marks: Mark[] | null
   ) {
      super(type, attrs, null, marks);

      if (is.empty(content)) {
         throw new RangeError('Empty text nodes are not allowed');
      }
      this.text = content;
   }

   toString = (): string =>
      this.type.spec.toDebugString
         ? this.type.spec.toDebugString(this)
         : wrapMarks(this.marks, JSON.stringify(this.text));

   get textContent(): string {
      return this.text;
   }

   textBetween = (from: number, to: number): string =>
      this.text.slice(from, to);

   get nodeSize(): number {
      return this.text.length;
   }

   mark = (marks: Mark[]): this =>
      marks === this.marks
         ? this
         : (new TextNode(this.type, this.attrs, this.text, marks) as this);

   withText = (text: string): this =>
      text == this.text
         ? this
         : (new TextNode(this.type, this.attrs, text, this.marks) as this);

   cut = (from = 0, to = this.text.length): this =>
      from == 0 && to == this.text.length
         ? this
         : this.withText(this.text.slice(from, to));

   equals = (other: TextNode): boolean =>
      this.sameMarkup(other) && this.text == other.text;

   toJSON(): NodeJSON {
      let base = super.toJSON();
      base.text = this.text;
      return base;
   }
}
