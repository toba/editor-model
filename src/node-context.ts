import { Fragment } from './fragment';
import { Mark } from './mark';
import { NodeType } from './node-type';
import { EditorNode } from './node';
import { AttributeMap } from './attribute';
import { ContentMatch } from './content';

/**
 * Using a bitfield for node context options.
 */
export const enum Whitespace {
   Preserve = 1,
   Full = 2,
   OpenLeft = 4
}

export class NodeContext {
   type: NodeType;
   private attrs: AttributeMap;
   private marks: Mark[];
   activeMarks: Mark[];
   private content: EditorNode[];
   private match: ContentMatch | null;
   private options: number | undefined;
   private solid: boolean;

   constructor(
      type: NodeType,
      attrs: AttributeMap,
      marks: Mark[],
      solid: boolean,
      match?: ContentMatch,
      options?: number
   ) {
      this.type = type;
      this.attrs = attrs;
      this.solid = solid;
      this.match =
         match || (options & Whitespace.OpenLeft ? null : type.contentMatch);
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
      return this.match.findWrapping(node.type);
   }

   finish(openEnd) {
      if (!(this.options & Whitespace.Preserve)) {
         // Strip trailing whitespace
         let last = this.content[this.content.length - 1];
         let m;

         if (last && last.isText && (m = /\s+$/.exec(last.text))) {
            if (last.text.length == m[0].length) {
               this.content.pop();
            } else {
               this.content[this.content.length - 1] = last.withText(
                  last.text.slice(0, last.text.length - m[0].length)
               );
            }
         }
      }
      const content: Fragment = Fragment.from(this.content);

      if (!openEnd && this.match) {
         content = content.append(this.match.fillBefore(Fragment.empty, true));
      }

      return this.type
         ? this.type.create(this.attrs, content, this.marks)
         : content;
   }
}
