import { StepResult, StepJSON, BaseStep, Step } from './step';
import { StepMap, Mappable } from './step-map';
import { Slice } from '../node/slice';
import { EditorNode } from '../node';
import { Schema } from '../schema';

/**
 * Replace a part of the document with a slice of new content.
 */
export class ReplaceStep extends BaseStep {
   slice: Slice;
   structure: boolean;

   /**
    * @param slice The `slice` should fit the 'gap' between `from` and `to`
    * the depths must line up, and the surrounding nodes must be able to be
    * joined with the open sides of the slice.
    * @param structure When `true`, the step will fail if the content between
    * from and to is not just a sequence of closing and then opening tokens
    * (this is to guard against rebased replace steps overwriting something they
    * weren't supposed to)
    */
   constructor(from: number, to: number, slice: Slice, structure?: boolean) {
      super();

      this.from = from;
      this.to = to;
      this.slice = slice;
      this.structure = !!structure;
   }

   apply(doc: EditorNode) {
      if (this.structure && contentBetween(doc, this.from, this.to)) {
         return StepResult.fail('Structure replace would overwrite content');
      }
      return StepResult.fromReplace(doc, this.from, this.to, this.slice);
   }

   getMap = () =>
      new StepMap([this.from, this.to - this.from, this.slice.size]);

   invert = (doc: EditorNode) =>
      new ReplaceStep(
         this.from,
         this.from + this.slice.size,
         doc.slice(this.from, this.to)
      );

   map(mapping: Mappable) {
      const from = mapping.mapResult(this.from, 1);
      const to = mapping.mapResult(this.to, -1);

      return from.deleted && to.deleted
         ? null
         : (new ReplaceStep(
              from.pos,
              Math.max(from.pos, to.pos),
              this.slice
           ) as this);
   }

   merge(other: this) {
      if (
         !(other instanceof ReplaceStep) ||
         other.structure != this.structure
      ) {
         return null;
      }

      if (
         this.from + this.slice.size == other.from &&
         !this.slice.openEnd &&
         !other.slice.openStart
      ) {
         let slice =
            this.slice.size + other.slice.size == 0
               ? Slice.empty
               : new Slice(
                    this.slice.content.append(other.slice.content),
                    this.slice.openStart,
                    other.slice.openEnd
                 );
         return new ReplaceStep(
            this.from,
            this.to + (other.to - other.from),
            slice,
            this.structure
         ) as this;
      } else if (
         other.to == this.from &&
         !this.slice.openStart &&
         !other.slice.openEnd
      ) {
         let slice =
            this.slice.size + other.slice.size == 0
               ? Slice.empty
               : new Slice(
                    other.slice.content.append(this.slice.content),
                    other.slice.openStart,
                    this.slice.openEnd
                 );
         return new ReplaceStep(
            other.from,
            this.to,
            slice,
            this.structure
         ) as this;
      } else {
         return null;
      }
   }

   toJSON(): StepJSON {
      let json: StepJSON = {
         stepType: 'replace',
         from: this.from,
         to: this.to
      };
      if (this.slice.size) {
         json.slice = this.slice.toJSON();
      }
      if (this.structure) {
         json.structure = true;
      }
      return json;
   }

   static fromJSON(schema: Schema, json: StepJSON) {
      if (typeof json.from != 'number' || typeof json.to != 'number') {
         throw new RangeError('Invalid input for ReplaceStep.fromJSON');
      }
      return new ReplaceStep(
         json.from,
         json.to,
         Slice.fromJSON(schema, json.slice),
         !!json.structure
      );
   }
}

BaseStep.register('replace', ReplaceStep as any);

/**
 * Replace a part of the document with a slice of content, but preserve a range
 * of the replaced content by moving it into the slice.
 */
export class ReplaceAroundStep extends BaseStep {
   gapFrom: number;
   gapTo: number;
   slice: Slice;
   insert: number;
   structure: boolean;

   /**
    * Create a replace-around step with the given range and gap.
    * @param insert Point in the slice into which the content of the gap should
    * be moved
    * @param structure Has the same meaning as it has in the `ReplaceStep` class
    */
   constructor(
      from: number,
      to: number,
      gapFrom: number,
      gapTo: number,
      slice: Slice,
      insert: number,
      structure?: boolean
   ) {
      super();
      this.from = from;
      this.to = to;
      this.gapFrom = gapFrom;
      this.gapTo = gapTo;
      this.slice = slice;
      this.insert = insert;
      this.structure = !!structure;
   }

   apply(doc: EditorNode) {
      if (
         this.structure &&
         (contentBetween(doc, this.from, this.gapFrom) ||
            contentBetween(doc, this.gapTo, this.to))
      )
         return StepResult.fail(
            'Structure gap-replace would overwrite content'
         );

      let gap = doc.slice(this.gapFrom, this.gapTo);

      if (gap.openStart || gap.openEnd) {
         return StepResult.fail('Gap is not a flat range');
      }
      let inserted = this.slice.insertAt(this.insert, gap.content);

      if (inserted === null) {
         return StepResult.fail('Content does not fit in gap');
      }
      return StepResult.fromReplace(doc, this.from, this.to, inserted);
   }

   getMap = () =>
      new StepMap([
         this.from,
         this.gapFrom - this.from,
         this.insert,
         this.gapTo,
         this.to - this.gapTo,
         this.slice.size - this.insert
      ]);

   invert(doc: EditorNode) {
      let gap = this.gapTo - this.gapFrom;

      return new ReplaceAroundStep(
         this.from,
         this.from + this.slice.size + gap,
         this.from + this.insert,
         this.from + this.insert + gap,
         doc
            .slice(this.from, this.to)
            .removeBetween(this.gapFrom - this.from, this.gapTo - this.from),
         this.gapFrom - this.from,
         this.structure
      );
   }

   map(mapping: Mappable): this | null {
      const from = mapping.mapResult(this.from, 1),
         to = mapping.mapResult(this.to, -1);
      const gapFrom = mapping.map(this.gapFrom, -1),
         gapTo = mapping.map(this.gapTo, 1);

      return (from.deleted && to.deleted) ||
         gapFrom < from.pos ||
         gapTo > to.pos
         ? null
         : (new ReplaceAroundStep(
              from.pos,
              to.pos,
              gapFrom,
              gapTo,
              this.slice,
              this.insert,
              this.structure
           ) as this);
   }

   merge(other: this): never {
      throw new Error('Not implemented');
   }

   toJSON(): StepJSON {
      const json: StepJSON = {
         stepType: 'replaceAround',
         from: this.from,
         to: this.to,
         gapFrom: this.gapFrom,
         gapTo: this.gapTo,
         insert: this.insert
      };
      if (this.slice.size > 0) {
         json.slice = this.slice.toJSON();
      }
      if (this.structure) {
         json.structure = true;
      }
      return json;
   }

   static fromJSON(schema: Schema, json: StepJSON): ReplaceAroundStep {
      if (
         typeof json.from != 'number' ||
         typeof json.to != 'number' ||
         typeof json.gapFrom != 'number' ||
         typeof json.gapTo != 'number' ||
         typeof json.insert != 'number'
      ) {
         throw new RangeError('Invalid input for ReplaceAroundStep.fromJSON');
      }
      return new ReplaceAroundStep(
         json.from,
         json.to,
         json.gapFrom,
         json.gapTo,
         Slice.fromJSON(schema, json.slice),
         json.insert,
         !!json.structure
      );
   }
}

BaseStep.register('replaceAround', ReplaceAroundStep as any);

function contentBetween(doc: EditorNode, from: number, to: number) {
   const pos = doc.resolve(from);
   let dist = to - from;
   let depth = pos.depth;

   while (
      dist > 0 &&
      depth > 0 &&
      pos.indexAfter(depth) == pos.node(depth).childCount
   ) {
      depth--;
      dist--;
   }
   if (dist > 0) {
      let next: EditorNode | undefined | null = pos
         .node(depth)
         .maybeChild(pos.indexAfter(depth));

      while (dist > 0) {
         if (next === null || next === undefined || next.isLeaf) {
            return true;
         }
         next = next.firstChild;
         dist--;
      }
   }
   return false;
}
