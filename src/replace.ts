import { Fragment } from './fragment';
import { Slice } from './slice';
import { ResolvedPos } from './resolved-pos';
import { EditorNode } from './node';

/**
 * Error type raised by [`Node.replace`](#model.Node.replace) when given an
 * invalid replacement.
 */
export class ReplaceError extends Error {
   constructor(message: string) {
      super(message);
   }
}

// export function ReplaceError(message: string) {
//    let err = Error.call(this, message);
//    err.__proto__ = ReplaceError.prototype;
//    return err;
// }

// ReplaceError.prototype = Object.create(Error.prototype);
// ReplaceError.prototype.constructor = ReplaceError;
// ReplaceError.prototype.name = 'ReplaceError';

//   return inner && content.replaceChild(index, child.copy(inner));
// }

export function replace(from: ResolvedPos, to: ResolvedPos, slice: Slice) {
   if (slice.openStart > from.depth) {
      throw new ReplaceError('Inserted content deeper than insertion position');
   }
   if (from.depth - slice.openStart != to.depth - slice.openEnd) {
      throw new ReplaceError('Inconsistent open depths');
   }
   return replaceOuter(from, to, slice, 0);
}

function replaceOuter(
   from: ResolvedPos,
   to: ResolvedPos,
   slice: Slice,
   depth: number
): EditorNode {
   const index: number = from.index(depth);
   const node: EditorNode = from.node(depth);

   if (index == to.index(depth) && depth < from.depth - slice.openStart) {
      const inner: EditorNode = replaceOuter(from, to, slice, depth + 1);
      return node.copy(node.content.replaceChild(index, inner));
   } else if (!slice.content.size) {
      return close(node, replaceTwoWay(from, to, depth));
   } else if (
      !slice.openStart &&
      !slice.openEnd &&
      from.depth == depth &&
      to.depth == depth
   ) {
      // Simple, flat case
      const parent = from.parent;
      const content = parent.content;

      return close(
         parent,
         content
            .cut(0, from.parentOffset)
            .append(slice.content)
            .append(content.cut(to.parentOffset))
      );
   } else {
      const { start, end } = prepareSliceForReplace(slice, from);
      return close(node, replaceThreeWay(from, start, end, to, depth));
   }
}

function checkJoin(main: EditorNode, sub: EditorNode): void {
   if (!sub.type.compatibleContent(main.type)) {
      throw new ReplaceError(
         'Cannot join ' + sub.type.name + ' onto ' + main.type.name
      );
   }
}

function joinable(
   before: ResolvedPos,
   after: ResolvedPos,
   depth: number
): EditorNode {
   const node: EditorNode = before.node(depth);
   checkJoin(node, after.node(depth));
   return node;
   //return true;
}

function addNode(child: EditorNode | null, target) {
   if (child === null) {
      return;
   }
   const last = target.length - 1;

   if (last >= 0 && child.isText && child.sameMarkup(target[last])) {
      target[last] = child.withText(target[last].text + child.text);
   } else {
      target.push(child);
   }
}

function addRange(
   start: ResolvedPos | null,
   end: ResolvedPos | null,
   depth: number,
   target
) {
   if (start === null && end === null) {
      return;
   }
   const node: EditorNode = (end || start)!.node(depth);
   const endIndex = end ? end.index(depth) : node.childCount;
   let startIndex = 0;

   if (start !== null) {
      startIndex = start.index(depth);
      if (start.depth > depth) {
         startIndex++;
      } else if (start.textOffset) {
         addNode(start.nodeAfter, target);
         startIndex++;
      }
   }
   for (let i = startIndex; i < endIndex; i++) {
      addNode(node.child(i), target);
   }
   if (end && end.depth == depth && end.textOffset) {
      addNode(end.nodeBefore, target);
   }
}

function close(node: EditorNode, content: Fragment): EditorNode {
   if (!node.type.validContent(content)) {
      throw new ReplaceError('Invalid content for node ' + node.type.name);
   }
   return node.copy(content);
}

function replaceThreeWay(
   from: ResolvedPos,
   start: ResolvedPos,
   end: ResolvedPos,
   to: ResolvedPos,
   depth: number
) {
   const openStart: false | EditorNode =
      from.depth > depth && joinable(from, start, depth + 1);
   const openEnd: false | EditorNode =
      to.depth > depth && joinable(end, to, depth + 1);
   const content: EditorNode[] = [];

   addRange(null, from, depth, content);

   if (
      openStart !== false &&
      openEnd !== false &&
      start.index(depth) == end.index(depth)
   ) {
      checkJoin(openStart, openEnd);

      addNode(
         close(openStart, replaceThreeWay(from, start, end, to, depth + 1)),
         content
      );
   } else {
      if (openStart)
         addNode(
            close(openStart, replaceTwoWay(from, start, depth + 1)),
            content
         );
      addRange(start, end, depth, content);

      if (openEnd) {
         addNode(close(openEnd, replaceTwoWay(end, to, depth + 1)), content);
      }
   }
   addRange(to, null, depth, content);

   return new Fragment(content);
}

function replaceTwoWay(from: ResolvedPos, to: ResolvedPos, depth: number) {
   const content: EditorNode[] = [];

   addRange(null, from, depth, content);

   if (from.depth > depth) {
      const type = joinable(from, to, depth + 1);
      addNode(close(type, replaceTwoWay(from, to, depth + 1)), content);
   }
   addRange(to, null, depth, content);

   return new Fragment(content);
}

function prepareSliceForReplace(
   slice: Slice,
   along: ResolvedPos
): { start: ResolvedPos; end: ResolvedPos } {
   const extra: number = along.depth - slice.openStart;
   const parent: EditorNode = along.node(extra);
   let node: EditorNode = parent.copy(slice.content);

   for (let i = extra - 1; i >= 0; i--) {
      node = along.node(i).copy(Fragment.from(node));
   }
   return {
      start: node.resolveNoCache(slice.openStart + extra),
      end: node.resolveNoCache(node.content.size - slice.openEnd - extra)
   };
}
