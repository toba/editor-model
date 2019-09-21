import { Fragment } from './fragment';
import { Mark } from './mark';
import { NodeType } from './node-type';
import { EditorNode } from './node';
import { AttributeMap } from './attribute';
import { ContentMatch } from './content';
import { TextNode } from './text-node';
import { Whitespace } from './constants';

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/07ee26e64d6f0c345d8912d894edf9ff113a5446/src/from_dom.js#L280
 */
export class NodeContext {
   type: NodeType | null;
   activeMarks: Mark[];
   content: EditorNode[];
   options: number;
   match: ContentMatch | null;
   solid: boolean;

   private attrs: AttributeMap | null;
   private marks: Mark[];

   constructor(
      type: NodeType | null,
      attrs: AttributeMap | null,
      marks: Mark[],
      solid: boolean,
      match?: ContentMatch | null,
      options: number = 0
   ) {
      this.type = type;
      this.attrs = attrs;
      this.solid = solid;
      this.match =
         match ||
         (options & Whitespace.OpenLeft || type === null
            ? null
            : type.contentMatch);
      this.options = options;
      this.content = [];
      this.marks = marks;
      this.activeMarks = Mark.none;
   }

   findWrapping(node: EditorNode): NodeType[] | null {
      if (this.match === null) {
         if (!this.type || this.type.contentMatch === null) {
            return [];
         }
         let fill = this.type.contentMatch.fillBefore(Fragment.from(node));
         if (fill) {
            this.match = this.type.contentMatch.matchFragment(fill);
         } else {
            let start = this.type.contentMatch,
               wrap;
            if ((wrap = start.findWrapping(node.type))) {
               this.match = start;
               return wrap;
            } else {
               return null;
            }
         }
      }
      return this.match === null ? null : this.match.findWrapping(node.type);
   }

   finish(openEnd: boolean): EditorNode | Fragment {
      if (!(this.options !== undefined && this.options & Whitespace.Preserve)) {
         // strip trailing whitespace
         const last: EditorNode | undefined = this.content[
            this.content.length - 1
         ];

         if (last !== undefined && last.isText) {
            const textNode = last as TextNode;
            const matches = /\s+$/.exec(textNode.text);

            if (matches !== null) {
               const textLength = textNode.text.length;
               const matchLength = matches[0].length;

               if (textLength == matchLength) {
                  this.content.pop();
               } else {
                  this.content[this.content.length - 1] = textNode.withText(
                     textNode.text.slice(0, textLength - matchLength)
                  );
               }
            }
         }
      }
      let content: Fragment = Fragment.from(this.content);

      if (!openEnd && this.match !== null) {
         content = content.append(this.match.fillBefore(Fragment.empty, true));
      }

      return this.type
         ? this.type.create(this.attrs, content, this.marks)
         : content;
   }
}
