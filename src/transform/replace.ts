import { ReplaceStep, ReplaceAroundStep } from './replace-step';
import { Transform } from './transform';
import { EditorNode } from '../node';
import { Slice } from '../node/slice';
import { Step } from './step';
import { Position } from '../position';
import { Fragment } from '../node/fragment';
import { ContentMatch } from '../match';
import { Frontier, Placed } from './frontier';

/**
 * "Fit" a slice into a given position in the document, producing a `Step` that
 * inserts it. Will return null if there's no meaningful way to insert the slice
 * here, or inserting it would be a no-op (an empty slice over an empty range).
 */
export function replaceStep(
   doc: EditorNode,
   from: number,
   to = from,
   slice = Slice.empty
): Step | undefined {
   if (from == to && !slice.size) {
      return undefined;
   }

   let fromPos = doc.resolve(from);
   let toPos = doc.resolve(to);

   // Optimization -- avoid work if it's obvious that it's not needed.
   if (fitsTrivially(fromPos, toPos, slice)) {
      return new ReplaceStep(from, to, slice);
   }
   const placed: Placed[] = placeSlice(fromPos, slice);
   const fittedLeft = fitLeft(fromPos, placed);
   const fitted = fitRight(fromPos, toPos, fittedLeft);

   if (fitted === undefined) {
      return undefined;
   }

   if (
      fittedLeft.size != fitted.size &&
      canMoveText(fromPos, toPos, fittedLeft)
   ) {
      let d = toPos.depth;
      let after = toPos.after(d);
      while (d > 1 && after == toPos.end(--d)) {
         ++after;
      }
      let fittedAfter = fitRight(fromPos, doc.resolve(after), fittedLeft);

      if (fittedAfter) {
         return new ReplaceAroundStep(
            from,
            after,
            to,
            toPos.end(),
            fittedAfter,
            fittedLeft.size
         );
      }
   }
   return fitted.size || from != to
      ? new ReplaceStep(from, to, fitted)
      : undefined;
}

function fitLeftInner(
   from: Position,
   depth: number,
   placed: Placed[],
   placedBelow: boolean | Placed
) {
   let content = Fragment.empty;
   let openEnd = 0;
   let placedHere: Placed = placed[depth];

   if (from.depth > depth) {
      let inner = fitLeftInner(
         from,
         depth + 1,
         placed,
         placedBelow || placedHere
      );
      openEnd = inner.openEnd + 1;
      content = Fragment.from(from.node(depth + 1).copy(inner.content));
   }

   if (placedHere) {
      content = content.append(placedHere.content);
      openEnd = placedHere.openEnd;
   }
   if (placedBelow) {
      content = content.append(
         from
            .node(depth)
            .contentMatchAt(from.indexAfter(depth))
            .fillBefore(Fragment.empty, true)
      );
      openEnd = 0;
   }

   return { content, openEnd };
}

function fitLeft(from: Position, placed: Placed[]) {
   let { content, openEnd } = fitLeftInner(from, 0, placed, false);
   return new Slice(content, from.depth, openEnd || 0);
}

function fitRightJoin(
   content: Fragment,
   parent: EditorNode,
   from: Position,
   to: Position,
   depth: number,
   openStart: number,
   openEnd: number
): Fragment | undefined {
   let match: ContentMatch | undefined;
   let count: number = content.childCount;
   let matchCount: number = count - (openEnd > 0 ? 1 : 0);
   let parentNode: EditorNode = openStart < 0 ? parent : from.node(depth);

   if (openStart < 0) {
      match = parentNode.contentMatchAt(matchCount);
   } else if (count == 1 && openEnd > 0) {
      match = parentNode.contentMatchAt(
         openStart ? from.index(depth) : from.indexAfter(depth)
      );
   } else {
      match = parentNode
         .contentMatchAt(from.indexAfter(depth))
         .matchFragment(content, count > 0 && openStart ? 1 : 0, matchCount);
   }

   if (match === undefined) {
      return undefined;
   }

   let toNode = to.node(depth);

   if (openEnd > 0 && depth < to.depth && content.lastChild !== undefined) {
      let after: Fragment = toNode.content
         .cutByIndex(to.indexAfter(depth))
         .addToStart(content.lastChild);

      let joinable: Fragment | undefined = match.fillBefore(after, true);

      // Can't insert content if there's a single node stretched across this gap
      if (
         joinable !== undefined &&
         joinable.size > 0 &&
         openStart > 0 &&
         count == 1
      )
         joinable = undefined;

      if (joinable !== undefined) {
         const inner = fitRightJoin(
            content.lastChild.content,
            content.lastChild,
            from,
            to,
            depth + 1,
            count == 1 ? openStart - 1 : -1,
            openEnd - 1
         );
         if (inner !== undefined) {
            const last: EditorNode = content.lastChild.copy(inner);

            return joinable.size > 0
               ? content
                    .cutByIndex(0, count - 1)
                    .append(joinable)
                    .addToEnd(last)
               : content.replaceChild(count - 1, last);
         }
      }
   }
   if (openEnd > 0 && match !== undefined) {
      const node =
         count == 1 && openStart > 0 ? from.node(depth + 1) : content.lastChild;

      if (node !== undefined) {
         match = match.matchType(node.type);
      }
   }

   if (match === undefined) {
      return undefined;
   }

   // If we're here, the next level can't be joined, so we see what happens if
   // we leave it open.
   const toIndex: number = to.index(depth);

   if (
      toIndex == toNode.childCount &&
      !toNode.type.compatibleContent(parent.type)
   ) {
      return undefined;
   }
   let joinable = match.fillBefore(toNode.content, true, toIndex);

   for (let i = toIndex; joinable && i < toNode.content.childCount; i++) {
      if (!parentNode.type.allowsMarks(toNode.content.child(i).marks)) {
         joinable = undefined;
      }
   }

   if (joinable === undefined) {
      return undefined;
   }

   if (openEnd > 0 && content.lastChild !== undefined) {
      const closed = fitRightClosed(
         content.lastChild,
         openEnd - 1,
         from,
         depth + 1,
         count == 1 ? openStart - 1 : -1
      );
      content = content.replaceChild(count - 1, closed);
   }
   content = content.append(joinable);

   if (to.depth > depth) {
      content = content.addToEnd(fitRightSeparate(to, depth + 1));
   }
   return content;
}

function fitRightClosed(
   node: EditorNode,
   openEnd: number,
   from: Position,
   depth: number,
   openStart: number
) {
   let match: ContentMatch | undefined;
   let content = node.content;
   let count = content.childCount;

   if (openStart >= 0) {
      match = from
         .node(depth)
         .contentMatchAt(from.indexAfter(depth))
         .matchFragment(content, openStart > 0 ? 1 : 0, count);
   } else {
      match = node.contentMatchAt(count);
   }

   if (openEnd > 0 && content.lastChild !== undefined) {
      let closed = fitRightClosed(
         content.lastChild,
         openEnd - 1,
         from,
         depth + 1,
         count == 1 ? openStart - 1 : -1
      );
      content = content.replaceChild(count - 1, closed);
   }

   return node.copy(content.append(match?.fillBefore(Fragment.empty, true)));
}

function fitRightSeparate(to: Position, depth: number) {
   const node = to.node(depth);
   let fill = node
      .contentMatchAt(0)
      .fillBefore(node.content, true, to.index(depth));

   if (to.depth > depth && fill !== undefined) {
      fill = fill.addToEnd(fitRightSeparate(to, depth + 1));
   }
   return node.copy(fill);
}

function normalizeSlice(
   content: Fragment,
   openStart: number,
   openEnd: number
): Slice {
   while (openStart > 0 && openEnd > 0 && content.childCount == 1) {
      content = content.firstChild!.content;
      openStart--;
      openEnd--;
   }
   return new Slice(content, openStart, openEnd);
}

function fitRight(
   from: Position,
   to: Position,
   slice: Slice
): Slice | undefined {
   const fitted: Fragment | undefined = fitRightJoin(
      slice.content,
      from.node(0),
      from,
      to,
      0,
      slice.openStart,
      slice.openEnd
   );

   return fitted !== undefined
      ? normalizeSlice(fitted, slice.openStart, to.depth)
      : fitted;
}

export const fitsTrivially = (from: Position, to: Position, slice: Slice) =>
   !slice.openStart &&
   !slice.openEnd &&
   from.start() == to.start() &&
   from.parent.canReplace(from.index(), to.index(), slice.content);

function canMoveText(from: Position, to: Position, slice: Slice): boolean {
   if (!to.parent.isTextblock) {
      return false;
   }

   const parent: EditorNode | undefined = slice.openEnd
      ? nodeRight(slice.content, slice.openEnd)
      : from.node(from.depth - (slice.openStart - slice.openEnd));

   if (parent === undefined || !parent.isTextblock) {
      return false;
   }

   for (let i = to.index(); i < to.parent.childCount; i++) {
      if (!parent.type.allowsMarks(to.parent.child(i).marks)) {
         return false;
      }
   }
   let match: ContentMatch | undefined;

   if (slice.openEnd) {
      match = parent.contentMatchAt(parent.childCount);
   } else {
      match = parent.contentMatchAt(parent.childCount);
      if (slice.size) {
         match = match.matchFragment(slice.content, slice.openStart ? 1 : 0);
      }
   }
   match = match?.matchFragment(to.parent.content, to.index());

   return match !== undefined && match.validEnd;
}

function nodeRight(content: Fragment, depth: number): EditorNode | undefined {
   let child: Fragment | undefined = content;
   for (let i = 1; i < depth; i++) {
      child = child?.lastChild?.content;
   }
   return child?.lastChild;
}

/**
 * Algorithm for 'placing' the elements of a slice into a gap:
 *
 * We consider the content of each node that is open to the left to be
 * independently placeable. I.e. in <p("foo"), p("bar")>, when the paragraph on
 * the left is open, "foo" can be placed (somewhere on the left side of the
 * replacement gap) independently from p("bar").
 *
 * So `placeSlice` splits up a slice into a number of sub-slices, along with
 * information on where they can be placed on the given left-side edge. It works
 * by walking the open side of the slice, from the inside out, and trying to
 * find a landing spot for each element, by simultaneously scanning over the gap
 * side. When no place is found for an open node's content, it is left in that
 * node.
 */
function placeSlice(from: Position, slice: Slice): Placed[] {
   let frontier = new Frontier(from);

   for (let pass = 1; slice.size && pass <= 3; pass++) {
      let value = frontier.placeSlice(
         slice.content,
         slice.openStart,
         slice.openEnd,
         pass
      );
      if (pass == 3 && value != slice && value.size) {
         // Restart if the 3rd pass made progress but left content
         pass = 0;
      }
      slice = value;
   }
   while (frontier.open.length) {
      frontier.closeNode();
   }

   return frontier.placed;
}

export function closeFragment(
   fragment: Fragment,
   depth: number,
   oldOpen: number,
   newOpen: number,
   parent?: EditorNode
): Fragment | undefined {
   let closed: Fragment | undefined = fragment;

   if (depth < oldOpen && fragment.firstChild !== undefined) {
      const first = fragment.firstChild;

      closed = fragment.replaceChild(
         0,
         first.copy(
            closeFragment(first.content, depth + 1, oldOpen, newOpen, first)
         )
      );
   }
   if (depth > newOpen && parent !== undefined) {
      closed = parent
         .contentMatchAt(0)
         ?.fillBefore(fragment, true)
         ?.append(fragment);
   }

   return closed;
}

/**
 * Returns an array of all depths for which `from` - `to` spans the whole
 * content of the nodes at that depth.
 */
export function coveredDepths(from: Position, to: Position): number[] {
   const result: number[] = [];
   const minDepth = Math.min(from.depth, to.depth);

   for (let d = minDepth; d >= 0; d--) {
      const start = from.start(d);
      if (
         start < from.pos - (from.depth - d) ||
         to.end(d) > to.pos + (to.depth - d) ||
         from.node(d).type.spec.isolating ||
         to.node(d).type.spec.isolating
      ) {
         break;
      }
      if (start == to.start(d)) {
         result.push(d);
      }
   }
   return result;
}
