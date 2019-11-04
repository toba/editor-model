import { Step, StepResult, StepJSON } from './step';
import { Fragment } from '../node/fragment';
import { Mark } from '../mark';
import { EditorNode } from '../node';
import { Slice } from '../node/slice';
import { Schema } from '../schema';

type GetInlineChild = (
   child: EditorNode,
   parent?: EditorNode,
   index?: number
) => EditorNode;

function mapFragment(
   fragment: Fragment,
   f: GetInlineChild,
   parent?: EditorNode
): Fragment {
   const mapped: EditorNode[] = [];

   for (let i = 0; i < fragment.childCount; i++) {
      let child = fragment.child(i);

      if (child.content.size > 0) {
         child = child.copy(mapFragment(child.content, f, child));
      }
      if (child.isInline) {
         child = f(child, parent, i);
      }
      mapped.push(child);
   }
   return Fragment.fromArray(mapped);
}

/**
 * Add a mark to all inline content between two positions.
 */
export class AddMarkStep extends Step {
   constructor(from: number, to: number, mark: Mark) {
      super();
      this.from = from;
      this.to = to;
      this.mark = mark;
   }

   apply(doc: EditorNode) {
      const oldSlice = doc.slice(this.from, this.to);
      const from = doc.resolve(this.from);
      const parent = from.node(from.sharedDepth(this.to));

      let slice = new Slice(
         mapFragment(
            oldSlice.content,
            (node, parent) =>
               parent !== undefined &&
               !parent.type.allowsMarkType(this.mark.type)
                  ? node
                  : node.marks(this.mark.addTo(node.marks)),
            parent
         ),
         oldSlice.openStart,
         oldSlice.openEnd
      );
      return StepResult.fromReplace(doc, this.from, this.to, slice);
   }

   invert = () => new RemoveMarkStep(this.from, this.to, this.mark);

   map(mapping) {
      let from = mapping.mapResult(this.from, 1),
         to = mapping.mapResult(this.to, -1);
      if ((from.deleted && to.deleted) || from.pos >= to.pos) return null;
      return new AddMarkStep(from.pos, to.pos, this.mark);
   }

   merge = (other: this): this =>
      other instanceof AddMarkStep &&
      other.mark.equals(this.mark) &&
      this.from <= other.to &&
      this.to >= other.from
         ? (new AddMarkStep(
              Math.min(this.from, other.from),
              Math.max(this.to, other.to),
              this.mark
           ) as this)
         : this;

   toJSON = (): StepJSON => ({
      stepType: 'addMark',
      mark: this.mark.toJSON(),
      from: this.from,
      to: this.to
   });

   static fromJSON(schema: Schema, json: StepJSON): AddMarkStep {
      if (typeof json.from != 'number' || typeof json.to != 'number') {
         throw new RangeError('Invalid input for AddMarkStep.fromJSON');
      }
      return new AddMarkStep(
         json.from,
         json.to,
         schema.markFromJSON(json.mark)
      );
   }
}

Step.jsonID('addMark', AddMarkStep);

/**
 * Remove a mark from all inline content between two positions.
 */
export class RemoveMarkStep extends Step {
   constructor(from: number, to: number, mark: Mark) {
      super();
      this.from = from;
      this.to = to;
      this.mark = mark;
   }

   apply(doc: EditorNode) {
      const oldSlice = doc.slice(this.from, this.to);
      const slice = new Slice(
         mapFragment(oldSlice.content, node =>
            node.mark(this.mark.removeFrom(node.marks))
         ),
         oldSlice.openStart,
         oldSlice.openEnd
      );
      return StepResult.fromReplace(doc, this.from, this.to, slice);
   }

   invert = () => new AddMarkStep(this.from, this.to, this.mark);

   map(mapping) {
      let from = mapping.mapResult(this.from, 1),
         to = mapping.mapResult(this.to, -1);
      if ((from.deleted && to.deleted) || from.pos >= to.pos) return null;
      return new RemoveMarkStep(from.pos, to.pos, this.mark);
   }

   merge = (other: this): this =>
      other instanceof RemoveMarkStep &&
      other.mark.eq(this.mark) &&
      this.from <= other.to &&
      this.to >= other.from
         ? (new RemoveMarkStep(
              Math.min(this.from, other.from),
              Math.max(this.to, other.to),
              this.mark
           ) as this)
         : this;

   toJSON = (): StepJSON => ({
      stepType: 'removeMark',
      mark: this.mark.toJSON(),
      from: this.from,
      to: this.to
   });

   static fromJSON(schema: Schema, json: StepJSON): RemoveMarkStep {
      if (typeof json.from != 'number' || typeof json.to != 'number') {
         throw new RangeError('Invalid input for RemoveMarkStep.fromJSON');
      }
      return new RemoveMarkStep(
         json.from,
         json.to,
         schema.markFromJSON(json.mark)
      );
   }
}

Step.jsonID('removeMark', RemoveMarkStep);
