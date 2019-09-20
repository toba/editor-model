import { EditorNode, wrapMarks } from './node';
import { NodeType } from './node-type';
import { AttributeMap } from './attribute';
import { Mark } from './mark';

export class TextNode extends EditorNode {
   text: string;

   constructor(
      type: NodeType,
      attrs: AttributeMap,
      content: string,
      marks: Mark[] | null
   ) {
      super(type, attrs, null, marks);

      if (!content) throw new RangeError('Empty text nodes are not allowed');

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

   mark = (marks: Mark[]): TextNode =>
      marks === this.marks
         ? this
         : new TextNode(this.type, this.attrs, this.text, marks);

   withText = (text: string): TextNode =>
      text == this.text
         ? this
         : new TextNode(this.type, this.attrs, text, this.marks);

   cut = (from = 0, to = this.text.length): TextNode =>
      from == 0 && to == this.text.length
         ? this
         : this.withText(this.text.slice(from, to));

   eq = (other: TextNode): boolean =>
      this.sameMarkup(other) && this.text == other.text;

   toJSON(): string {
      let base = super.toJSON();
      base.text = this.text;
      return base;
   }
}
