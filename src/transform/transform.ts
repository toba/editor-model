import { Mapping } from './map';
import { EditorNode, NodeType, NodeRange } from '../node';
import { Step, StepResult } from './step';
import { Attributes } from '../node/attribute';
import { Mark } from '../mark';
import { ReplaceAroundStep, ReplaceStep } from './replace-step';
import { Fragment } from '../node/fragment';
import { Slice } from '../node/slice';

export class TransformError extends Error {
   constructor(message: string) {
      super(message);
      this.name = 'TransformError';
   }
}

// ::- Abstraction to build up and track an array of
// [steps](#transform.Step) representing a document transformation.
//
// Most transforming methods return the `Transform` object itself, so
// that they can be chained.
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
   mapping: any;

   /**Create a transform that starts with the given document. */
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
   step(object: Step): this {
      let result = this.maybeStep(object);
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

   // :: (NodeRange, [{type: NodeType, attrs: ?Object}]) → this
   // Wrap the given [range](#model.NodeRange) in the given set of wrappers.
   // The wrappers are assumed to be valid in this position, and should
   // probably be computed with [`findWrapping`](#transform.findWrapping).
   wrap(range: NodeRange, wrappers) {
      let content = Fragment.empty;
      for (let i = wrappers.length - 1; i >= 0; i--)
         content = Fragment.from(
            wrappers[i].type.create(wrappers[i].attrs, content)
         );

      let start = range.start;
      let end = range.end;

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

      let gapStart = from.before(depth + 1),
         gapEnd = to.after(depth + 1);
      let start = gapStart,
         end = gapEnd;

      let before = Fragment.empty,
         openStart = 0;
      for (let d = depth, splitting = false; d > target; d--)
         if (splitting || from.index(d) > 0) {
            splitting = true;
            before = Fragment.from(from.node(d).copy(before));
            openStart++;
         } else {
            start--;
         }
      let after = Fragment.empty,
         openEnd = 0;
      for (let d = depth, splitting = false; d > target; d--)
         if (splitting || to.after(d + 1) < to.end(d)) {
            splitting = true;
            after = Fragment.from(to.node(d).copy(after));
            openEnd++;
         } else {
            end++;
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
      let step = new ReplaceStep(pos - depth, pos + depth, Slice.empty, true);
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
      let mapFrom = this.steps.length;

      this.doc.nodesBetween(from, to, (node, pos) => {
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
            let mapping = this.mapping.slice(mapFrom);
            let startM = mapping.map(pos, 1),
               endM = mapping.map(pos + node.nodeSize, 1);
            this.step(
               new ReplaceAroundStep(
                  startM,
                  endM,
                  startM + 1,
                  endM - 1,
                  new Slice(
                     Fragment.from(type.create(attrs, null, node.marks)),
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
      let node = this.doc.nodeAt(pos);

      if (!node) {
         throw new RangeError('No node at given position');
      }
      if (!type) {
         type = node.type;
      }
      let newNode = type.create(attrs, undefined, marks || node.marks);

      if (node.isLeaf) {
         return this.replaceWith(pos, pos + node.size, newNode);
      }

      if (!type.validContent(node.content))
         throw new RangeError('Invalid content for node type ' + type.name);

      return this.step(
         new ReplaceAroundStep(
            pos,
            pos + node.nodeSize,
            pos + 1,
            pos + node.nodeSize - 1,
            new Slice(Fragment.from(newNode), 0, 0),
            1,
            true
         )
      );
   }

   // :: (number, ?number, ?[?{type: NodeType, attrs: ?Object}]) → this
   // Split the node at the given position, and optionally, if `depth` is
   // greater than one, any number of nodes above that. By default, the
   // parts split off will inherit the node type of the original node.
   // This can be changed by passing an array of types and attributes to
   // use after the split.
   split(pos: number, depth = 1, typesAfter) {
      let $pos = this.doc.resolve(pos);
      let before = Fragment.empty;
      let after = Fragment.empty;

      for (
         let d = $pos.depth, e = $pos.depth - depth, i = depth - 1;
         d > e;
         d--, i--
      ) {
         before = Fragment.from($pos.node(d).copy(before));
         let typeAfter = typesAfter && typesAfter[i];
         after = Fragment.from(
            typeAfter
               ? typeAfter.type.create(typeAfter.attrs, after)
               : $pos.node(d).copy(after)
         );
      }
      return this.step(
         new ReplaceStep(
            pos,
            pos,
            new Slice(before.append(after), depth, depth),
            true
         )
      );
   }
}
