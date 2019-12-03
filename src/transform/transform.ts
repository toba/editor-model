import { Mapping } from './map';
import { EditorNode, NodeType, NodeRange } from '../node';
import { Step, StepResult } from './step';
import { Attributes } from '../node/attribute';
import { Mark, MarkType } from '../mark';
import { ReplaceAroundStep, ReplaceStep } from './replace-step';
import {
   replaceStep,
   coveredDepths,
   fitsTrivially,
   closeFragment
} from './replace';
import { canChangeType, insertPoint, Wrapping } from './structure';
import { Fragment } from '../node/fragment';
import { Slice } from '../node/slice';
import { RemoveMarkStep, AddMarkStep } from './map-step';
import { forEach } from '@toba/tools';
import { ContentMatch } from '../match';

export class TransformError extends Error {
   constructor(message: string) {
      super(message);
      this.name = 'TransformError';
   }
}

interface MarkMatch {
   style: Mark;
   from: number;
   to: number;
   step: number;
}

/**
 * Abstraction to build up and track an array of `Step`s representing a document
 * transformation. Most transforming methods return the `Transform` object
 * itself, so that they can be chained.
 */
export class Transform {
   /**
    * The current document (the result of applying the steps in the transform)
    */
   doc: EditorNode;
   /** Documents before each step */
   docs: EditorNode[];
   /** Steps in this transformation */
   steps: Step[];
   /** Maps for each of the steps in this transform */
   mapping: Mapping;

   /** Create a transform that starts with the given document. */
   constructor(doc: EditorNode) {
      this.doc = doc;
      this.steps = [];
      this.docs = [];
      this.mapping = new Mapping();
   }

   /** The starting document. */
   get before() {
      return this.docs.length ? this.docs[0] : this.doc;
   }

   /**
    * Apply a new step in this transform, saving the result. Throws an error
    * when the step fails.
    */
   step(s: Step): this {
      const result = this.maybeStep(s);
      if (result.failed) {
         throw new TransformError(result.failed);
      }
      return this;
   }

   /**
    * Try to apply a step in this transformation, ignoring it if it fails.
    * Returns the step result.
    */
   maybeStep(step: Step): StepResult {
      const result = step.apply(this.doc);
      if (!result.failed) {
         this.addStep(step, result.doc!);
      }
      return result;
   }

   /**
    * Whether document has been changed (when there are any steps).
    */
   get docChanged(): boolean {
      return this.steps.length > 0;
   }

   addStep(step: Step, doc: EditorNode) {
      this.docs.push(this.doc);
      this.steps.push(step);
      this.mapping.appendMap(step.getMap());
      this.doc = doc;
   }

   /**
    * Wrap the given [range](#model.NodeRange) in the given set of wrappers.
    * The wrappers are assumed to be valid in this position, and should
    * probably be computed with [`findWrapping`](#transform.findWrapping).
    */
   wrap(range: NodeRange, wrappers: Wrapping[]) {
      let content = Fragment.empty;

      for (let i = wrappers.length - 1; i >= 0; i--) {
         content = Fragment.from(
            wrappers[i].type.create(wrappers[i].attrs, content)
         );
      }

      const start = range.start;
      const end = range.end;

      return this.step(
         new ReplaceAroundStep(
            start,
            end,
            start,
            end,
            new Slice(content, 0, 0),
            wrappers.length,
            true
         )
      );
   }

   /**
    * Split the content in the given range off from its parent, if there is
    * sibling content before or after it, and move it up the tree to the depth
    * specified by `target`. You'll probably want to use [`liftTarget`](#transform.liftTarget)
    * to compute `target`, to make sure the lift is valid.
    */
   lift(range: NodeRange, target: number): this {
      let { from, to, depth } = range;

      let gapStart = from.before(depth + 1);
      let gapEnd = to.after(depth + 1);
      let start = gapStart;
      let end = gapEnd;

      let before = Fragment.empty;
      let openStart = 0;

      for (let d = depth, splitting = false; d > target; d--) {
         if (splitting || from.index(d) > 0) {
            splitting = true;
            before = Fragment.from(from.node(d).copy(before));
            openStart++;
         } else {
            start--;
         }
      }
      let after = Fragment.empty;
      let openEnd = 0;

      for (let d = depth, splitting = false; d > target; d--) {
         if (splitting || to.after(d + 1) < to.end(d)) {
            splitting = true;
            after = Fragment.from(to.node(d).copy(after));
            openEnd++;
         } else {
            end++;
         }
      }

      return this.step(
         new ReplaceAroundStep(
            start,
            end,
            gapStart,
            gapEnd,
            new Slice(before.append(after), openStart, openEnd),
            before.size - openStart,
            true
         )
      );
   }

   /**
    * Join the blocks around the given position. If depth is 2, their last and
    * first siblings are also joined, and so on.
    */
   join(pos: number, depth = 1): this {
      const step = new ReplaceStep(pos - depth, pos + depth, Slice.empty, true);
      return this.step(step);
   }

   /**
    * Set the type of all textblocks (partly) between `from` and `to` to the
    * given node type with the given attributes.
    */
   setBlockType(
      from: number,
      to: number = from,
      type: NodeType,
      attrs: Attributes
   ): this {
      if (!type.isTextblock) {
         throw new RangeError(
            'Type given to setBlockType should be a textblock'
         );
      }
      const mapFrom: number = this.steps.length;

      this.doc.forEachNodeBetween(from, to, (node, pos) => {
         if (
            node.isTextblock &&
            !node.hasMarkup(type, attrs) &&
            canChangeType(this.doc, this.mapping.slice(mapFrom).map(pos), type)
         ) {
            // Ensure all markup that isn't allowed in the new node type is cleared
            this.clearIncompatible(
               this.mapping.slice(mapFrom).map(pos, 1),
               type
            );
            const mapping = this.mapping.slice(mapFrom);
            let startM = mapping.map(pos, 1);
            let endM = mapping.map(pos + node.size, 1);

            this.step(
               new ReplaceAroundStep(
                  startM,
                  endM,
                  startM + 1,
                  endM - 1,
                  new Slice(
                     Fragment.from(type.create(attrs, undefined, node.marks)),
                     0,
                     0
                  ),
                  1,
                  true
               )
            );
            return false;
         }
      });
      return this;
   }

   /**
    * Change the type, attributes, and/or marks of the node at `pos`.
    * When `type` isn't given, the existing node type is preserved,
    */
   setNodeMarkup(
      pos: number,
      type?: NodeType,
      attrs?: Attributes,
      marks?: Mark[]
   ) {
      const node = this.doc.nodeAt(pos);

      if (node === undefined) {
         throw new RangeError('No node at given position');
      }
      if (type === undefined) {
         type = node.type;
      }
      const newNode = type.create(attrs, undefined, marks || node.marks);

      if (node.isLeaf) {
         return this.replaceWith(pos, pos + node.size, newNode);
      }

      if (!type.allowsContent(node.content))
         throw new RangeError('Invalid content for node type ' + type.name);

      return this.step(
         new ReplaceAroundStep(
            pos,
            pos + node.size,
            pos + 1,
            pos + node.size - 1,
            new Slice(Fragment.from(newNode), 0, 0),
            1,
            true
         )
      );
   }

   /**
    * Delete the content between the given positions.
    */
   delete = (from: number, to: number) => this.replace(from, to, Slice.empty);

   /**
    * Insert the given content at the given position.
    */
   insert = (
      pos: number,
      content: Fragment | EditorNode | EditorNode[]
   ): this => this.replaceWith(pos, pos, content);

   /**
    * Replace the part of the document between `from` and `to` with the given
    * `slice`.
    */
   replace(from: number, to = from, slice = Slice.empty): this {
      const step = replaceStep(this.doc, from, to, slice);
      if (step) {
         this.step(step);
      }
      return this;
   }

   /**
    * Replace the given range with the given content, which may be a fragment,
    * node, or array of nodes.
    */
   replaceWith = (
      from: number,
      to: number,
      content: Fragment | EditorNode | EditorNode[]
   ): this => this.replace(from, to, new Slice(Fragment.from(content), 0, 0));

   /**
    * Replace a range of the document with a given slice, using `from`, `to`,
    * and the slice's `openStart` property as hints, rather than fixed start and
    * end points. This method may grow the replaced area or close open nodes in
    * the slice in order to get a fit that is more in line with WYSIWYG
    * expectations, by dropping fully covered parent nodes of the replaced
    * region when they are marked non-`NodeSpec.defining`, or including an open
    * parent node from the slice that _is_ marked as defining.
    *
    * This is the method, for example, to handle paste. The similar `replace`
    * method is a more primitive tool which will _not_ move the start and end of
    * its given range, and is useful in situations where you need more precise
    * control over what happens.
    */
   replaceRange(fromIndex: number, toIndex: number, slice: Slice): this {
      if (slice.size == 0) {
         return this.deleteRange(fromIndex, toIndex);
      }

      const from = this.doc.resolve(fromIndex);
      const to = this.doc.resolve(toIndex);

      if (fitsTrivially(from, to, slice)) {
         return this.step(new ReplaceStep(fromIndex, toIndex, slice));
      }

      let targetDepths = coveredDepths(from, this.doc.resolve(toIndex));

      if (targetDepths[targetDepths.length - 1] == 0) {
         // Can't replace the whole document, so remove 0 if it's present
         targetDepths.pop();
      }

      // Negative numbers represent not expansion over the whole node at
      // that depth, but replacing from $from.before(-D) to $to.pos.
      let preferredTarget = -(from.depth + 1);
      targetDepths.unshift(preferredTarget);

      // This loop picks a preferred target depth, if one of the covering
      // depths is not outside of a defining node, and adds negative
      // depths for any depth that has $from at its start and does not
      // cross a defining node.
      for (let d = from.depth, pos = from.pos - 1; d > 0; d--, pos--) {
         const spec = from.node(d).type.spec;
         if (spec.defining || spec.isolating) {
            break;
         }
         if (targetDepths.indexOf(d) > -1) {
            preferredTarget = d;
         } else if (from.before(d) == pos) {
            targetDepths.splice(1, 0, -d);
         }
      }
      // Try to fit each possible depth of the slice into each possible
      // target depth, starting with the preferred depths.
      const preferredTargetIndex = targetDepths.indexOf(preferredTarget);
      const leftNodes: EditorNode[] = [];

      let preferredDepth = slice.openStart;

      for (let content = slice.content, i = 0; ; i++) {
         let node = content.firstChild;
         if (node !== undefined) {
            leftNodes.push(node);
            content = node.content;
         }
         if (i == slice.openStart) {
            break;
         }
      }
      // Back up if the node directly above openStart, or the node above
      // that separated only by a non-defining textblock node, is defining.
      if (
         preferredDepth > 0 &&
         leftNodes[preferredDepth - 1].type.spec.defining &&
         from.node(preferredTargetIndex).type !=
            leftNodes[preferredDepth - 1].type
      ) {
         preferredDepth -= 1;
      } else if (
         preferredDepth >= 2 &&
         leftNodes[preferredDepth - 1].isTextblock &&
         leftNodes[preferredDepth - 2].type.spec.defining &&
         from.node(preferredTargetIndex).type !=
            leftNodes[preferredDepth - 2].type
      ) {
         preferredDepth -= 2;
      }

      for (let j = slice.openStart; j >= 0; j--) {
         const openDepth = (j + preferredDepth + 1) % (slice.openStart + 1);
         const insert: EditorNode | undefined = leftNodes[openDepth];

         if (insert == undefined) {
            continue;
         }
         for (let i = 0; i < targetDepths.length; i++) {
            // Loop over possible expansion levels, starting with the
            // preferred one
            let targetDepth: number =
               targetDepths[(i + preferredTargetIndex) % targetDepths.length];
            let expand = true;

            if (targetDepth < 0) {
               expand = false;
               targetDepth = -targetDepth;
            }
            const parent: EditorNode = from.node(targetDepth - 1);
            const index: number = from.index(targetDepth - 1);

            if (
               parent.canReplaceWith(index, index, insert.type, insert.marks)
            ) {
               const closed = closeFragment(
                  slice.content,
                  0,
                  slice.openStart,
                  openDepth
               );
               if (closed !== undefined) {
                  return this.replace(
                     from.before(targetDepth),
                     expand ? to.after(targetDepth) : toIndex,
                     new Slice(closed, openDepth, slice.openEnd)
                  );
               }
            }
         }
      }

      const startSteps = this.steps.length;

      for (let i = targetDepths.length - 1; i >= 0; i--) {
         this.replace(fromIndex, toIndex, slice);
         if (this.steps.length > startSteps) {
            break;
         }
         let depth = targetDepths[i];
         if (i < 0) {
            continue;
         }
         fromIndex = from.before(depth);
         toIndex = to.after(depth);
      }
      return this;
   }

   /**
    * Split the node at the given position, and optionally, if `depth` is
    * greater than one, any number of nodes above that. By default, the parts
    * split off will inherit the node type of the original node. This can be
    * changed by passing an array of types and attributes to use after the
    * split.
    */
   split(index: number, depth = 1, typesAfter: Wrapping[]): this {
      let pos = this.doc.resolve(index);
      let before = Fragment.empty;
      let after = Fragment.empty;

      for (
         let d = pos.depth, e = pos.depth - depth, i = depth - 1;
         d > e;
         d--, i--
      ) {
         before = Fragment.from(pos.node(d).copy(before));
         let typeAfter = typesAfter && typesAfter[i];
         after = Fragment.from(
            typeAfter
               ? typeAfter.type.create(typeAfter.attrs, after)
               : pos.node(d).copy(after)
         );
      }
      return this.step(
         new ReplaceStep(
            index,
            index,
            new Slice(before.append(after), depth, depth),
            true
         )
      );
   }

   /**
    * Delete the given range, expanding it to cover fully covered parent nodes
    * until a valid replace is found.
    */
   deleteRange(fromIndex: number, toIndex: number): this {
      const from = this.doc.resolve(fromIndex);
      const to = this.doc.resolve(toIndex);
      const covered = coveredDepths(from, to);

      for (let i = 0; i < covered.length; i++) {
         const depth = covered[i];
         const last = i == covered.length - 1;

         if (
            (last && depth == 0) ||
            from.node(depth).type.contentMatch?.validEnd === true
         ) {
            return this.delete(from.start(depth), to.end(depth));
         }

         if (
            depth > 0 &&
            (last ||
               from
                  .node(depth - 1)
                  .canReplace(from.index(depth - 1), to.indexAfter(depth - 1)))
         ) {
            return this.delete(from.before(depth), to.after(depth));
         }
      }
      for (let d = 1; d <= from.depth; d++) {
         if (
            fromIndex - from.start(d) == from.depth - d &&
            toIndex > from.end(d)
         ) {
            return this.delete(from.before(d), toIndex);
         }
      }

      return this.delete(fromIndex, toIndex);
   }

   /**
    * Replace the given range with a node, but use `from` and `to` as hints,
    * rather than precise positions. When from and to are the same and are at
    * the start or end of a parent node in which the given node doesn't fit,
    * this method may _move_ them out towards a parent that does allow the given
    * node to be placed. When the given range completely covers a parent node,
    * this method may completely replace that parent node.
    */
   replaceRangeWith(from: number, to: number, node: EditorNode): this {
      if (
         !node.isInline &&
         from == to &&
         this.doc.resolve(from).parent.content.size > 0
      ) {
         const point = insertPoint(this.doc, from, node.type);
         if (point !== undefined) {
            from = to = point;
         }
      }
      return this.replaceRange(from, to, new Slice(Fragment.from(node), 0, 0));
   }

   /**
    * Add mark to inline content between `from` and `to`.
    */
   addMark(from: number, to: number, mark: Mark): this {
      const removed: RemoveMarkStep[] = [];
      const added: AddMarkStep[] = [];

      let removing: RemoveMarkStep | null = null;
      let adding: AddMarkStep | null = null;

      this.doc.forEachNodeBetween(from, to, (node, pos, parent) => {
         if (!node.isInline) {
            return;
         }
         const marks: Mark[] = node.marks;

         if (
            !mark.isIn(marks) &&
            parent !== undefined &&
            parent.type.allowsMarkType(mark.type)
         ) {
            let start = Math.max(pos, from);
            let end = Math.min(pos + node.size, to);
            let newSet = mark.addTo(marks);

            forEach(marks, m => {
               //for (let i = 0; i < marks.length; i++) {
               if (!m.isIn(newSet)) {
                  if (
                     removing &&
                     removing.to == start &&
                     removing.mark.equals(m)
                  ) {
                     removing.to = end;
                  } else {
                     removing = new RemoveMarkStep(start, end, m);
                     removed.push(removing);
                  }
               }
            });

            if (adding !== null && adding.to == start) {
               adding.to = end;
            } else {
               adding = new AddMarkStep(start, end, mark);
               added.push(adding);
            }
         }
      });

      removed.forEach(s => this.step(s));
      added.forEach(s => this.step(s));

      return this;
   }

   /**
    * Remove marks from inline nodes between `from` and `to`. When `mark` is a
    * single mark, remove precisely that mark. When it is a mark type, remove
    * all marks of that type. When it is null, remove all marks of any type.
    */
   removeMark(from: number, to: number, mark: Mark | MarkType): this {
      const matched: MarkMatch[] = [];
      let step = 0;

      this.doc.forEachNodeBetween(from, to, (node, pos) => {
         if (!node.isInline) {
            return;
         }
         step++;

         let toRemove: Mark[] | null = null;

         if (mark instanceof MarkType) {
            const found = mark.find(node.marks);

            if (found !== undefined) {
               toRemove = [found];
            }
         } else if (mark !== undefined) {
            if (mark.isIn(node.marks)) {
               toRemove = [mark];
            }
         } else {
            toRemove = node.marks;
         }

         if (toRemove !== null && toRemove.length > 0) {
            const end = Math.min(pos + node.size, to);

            forEach(toRemove, r => {
               let found: MarkMatch | null = null;

               forEach(matched, m => {
                  if (m.step == step - 1 && r.equals(m.style)) {
                     found = m;
                  }
               });

               if (found !== null) {
                  found!.to = end;
                  found!.step = step;
               } else {
                  matched.push({
                     style: r,
                     from: Math.max(pos, from),
                     to: end,
                     step
                  });
               }
            });
         }
      });

      matched.forEach(m =>
         this.step(new RemoveMarkStep(m.from, m.to, m.style))
      );
      return this;
   }

   /**
    * Removes all marks and nodes from the content of the node at `pos` that
    * don't match the given new parent node type. Accepts an optional starting
    * [content match](#model.ContentMatch) as third argument.
    */
   clearIncompatible(
      pos: number,
      parentType: NodeType,
      match = parentType.contentMatch
   ): this {
      let node = this.doc.nodeAt(pos);
      let delSteps = [];
      let cur = pos + 1;

      if (node === undefined || match === undefined) {
         return this;
      }

      for (let i = 0; i < node.childCount; i++) {
         const child: EditorNode = node.child(i);
         const end = cur + child.size;
         const allowed: ContentMatch | undefined = match?.matchType(
            child.type
            //child.attrs
         );

         if (allowed === undefined) {
            delSteps.push(new ReplaceStep(cur, end, Slice.empty));
         } else {
            match = allowed;
            for (let j = 0; j < child.marks.length; j++) {
               if (!parentType.allowsMarkType(child.marks[j].type)) {
                  this.step(new RemoveMarkStep(cur, end, child.marks[j]));
               }
            }
         }
         cur = end;
      }

      if (!match.validEnd) {
         const fill = match.fillBefore(Fragment.empty, true);
         if (fill !== undefined) {
            this.replace(cur, cur, new Slice(fill, 0, 0));
         }
      }

      for (let i = delSteps.length - 1; i >= 0; i--) {
         this.step(delSteps[i]);
      }

      return this;
   }
}
