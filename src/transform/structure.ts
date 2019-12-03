import { EditorNode, NodeRange, NodeType } from '../node';
import { Attributes } from '../node/attribute';
import { Slice } from '../node/slice';
import { Fragment } from '../node/fragment';

export interface Wrapping {
   type: NodeType;
   attrs?: Attributes;
}

function canCut(node: EditorNode, start: number, end: number) {
   return (
      (start == 0 || node.canReplace(start, node.childCount)) &&
      (end == node.childCount || node.canReplace(0, end))
   );
}

/**
 * Try to find a target depth to which the content in the given range can be
 * lifted. Will not go across [isolating](#model.NodeSpec.isolating) parent
 * nodes.
 */
export function liftTarget(range: NodeRange): number | undefined {
   const parent = range.parent;
   const content = parent.content.cutByIndex(range.startIndex, range.endIndex);

   for (let depth = range.depth; ; --depth) {
      const node = range.from.node(depth);
      const index = range.from.index(depth);
      const endIndex = range.to.indexAfter(depth);

      if (depth < range.depth && node.canReplace(index, endIndex, content)) {
         return depth;
      }

      if (
         depth == 0 ||
         node.type.spec.isolating ||
         !canCut(node, index, endIndex)
      ) {
         break;
      }
   }
}

/**
 * Try to find a valid way to wrap the content in the given range in a node of
 * the given type. May introduce extra nodes around and inside the wrapper node,
 * if necessary. Returns null if no valid wrapping could be found. When
 * `innerRange` is given, that range's content is used as the content to fit
 * into the wrapping, instead of the content of `range`.
 */
export function findWrapping(
   range: NodeRange,
   nodeType: NodeType,
   attrs: Attributes,
   innerRange: NodeRange = range
): Wrapping[] | null {
   const around = findWrappingOutside(range, nodeType);
   const inner =
      around !== null ? findWrappingInside(innerRange, nodeType) : null;

   if (inner === null || around === null) {
      return null;
   }

   return around
      .map(withAttrs)
      .concat({ type: nodeType, attrs })
      .concat(inner.map(withAttrs));
}

const withAttrs = (type: NodeType): Wrapping => ({ type, attrs: undefined });

function findWrappingOutside(
   range: NodeRange,
   type: NodeType
): NodeType[] | null {
   let { parent, startIndex, endIndex } = range;
   let around = parent.contentMatchAt(startIndex).findWrapping(type);
   if (!around) {
      return null;
   }
   let outer = around.length ? around[0] : type;
   return parent.canReplaceWith(startIndex, endIndex, outer) ? around : null;
}

function findWrappingInside(
   range: NodeRange,
   type: NodeType
): NodeType[] | null {
   let { parent, startIndex, endIndex } = range;
   let inner = parent.child(startIndex);
   if (type.contentMatch === undefined) {
      return null;
   }
   let inside = type.contentMatch.findWrapping(inner.type);

   if (!inside) {
      return null;
   }
   let lastType = inside.length ? inside[inside.length - 1] : type;
   let innerMatch = lastType.contentMatch;

   for (let i = startIndex; innerMatch && i < endIndex; i++) {
      innerMatch = innerMatch.matchType(parent.child(i).type);
   }
   if (!innerMatch || !innerMatch.validEnd) {
      return null;
   }
   return inside;
}

/**
 * Whether splitting at the given position is allowed.
 */
export function canSplit(
   doc: EditorNode,
   idx: number,
   depth = 1,
   typesAfter?: Wrapping[]
): boolean {
   let pos = doc.resolve(idx);
   const base = pos.depth - depth;
   const innerType =
      (typesAfter && typesAfter[typesAfter.length - 1]) || pos.parent;

   if (
      base < 0 ||
      pos.parent.type.spec.isolating ||
      !pos.parent.canReplace(pos.index(), pos.parent.childCount) ||
      !innerType.type.allowsContent(
         pos.parent.content.cutByIndex(pos.index(), pos.parent.childCount)
      )
   ) {
      return false;
   }

   for (let d = pos.depth - 1, i = depth - 2; d > base; d--, i--) {
      const node = pos.node(d);
      const index = pos.index(d);

      if (node.type.spec.isolating) {
         return false;
      }
      let rest = node.content.cutByIndex(index, node.childCount);
      const after = (typesAfter && typesAfter[i]) || node;

      if (after != node) {
         rest = rest.replaceChild(0, after.type.create(after.attrs));
      }
      if (
         !node.canReplace(index + 1, node.childCount) ||
         !after.type.allowsContent(rest)
      ) {
         return false;
      }
   }
   const index = pos.indexAfter(base);
   const baseType = typesAfter && typesAfter[0];

   return pos
      .node(base)
      .canReplaceWith(
         index,
         index,
         baseType ? baseType.type : pos.node(base + 1).type
      );
}

/**
 * Test whether the blocks before and after a given position can be joined.
 */
export function canJoin(doc: EditorNode, idx: number) {
   const pos = doc.resolve(idx);
   const index = pos.index();

   return (
      joinable(pos.nodeBefore, pos.nodeAfter) &&
      pos.parent.canReplace(index, index + 1)
   );
}

export function canChangeType(doc: EditorNode, pos: number, type: NodeType) {
   let $pos = doc.resolve(pos);
   let index = $pos.index();
   return $pos.parent.canReplaceWith(index, index + 1, type);
}

const joinable = (a?: EditorNode, b?: EditorNode) =>
   a !== undefined && b !== undefined && !a.isLeaf && a.canAppend(b);

/**
 * Find an ancestor of the given position that can be joined to the block before
 * (or after if `dir` is positive). Returns the joinable point, if any.
 */
export function joinPoint(
   doc: EditorNode,
   idx: number,
   dir = -1
): number | undefined {
   let pos = doc.resolve(idx);

   for (let d = pos.depth; ; d--) {
      let before;
      let after;

      if (d == pos.depth) {
         before = pos.nodeBefore;
         after = pos.nodeAfter;
      } else if (dir > 0) {
         before = pos.node(d + 1);
         after = pos.node(d).maybeChild(pos.index(d) + 1);
      } else {
         before = pos.node(d).maybeChild(pos.index(d) - 1);
         after = pos.node(d + 1);
      }
      if (before && !before.isTextblock && joinable(before, after)) {
         return idx;
      }
      if (d == 0) {
         break;
      }
      idx = dir < 0 ? pos.before(d) : pos.after(d);
   }
}

/**
 * Try to find a point where a node of the given type can be inserted near
 * `pos`, by searching up the node hierarchy when `pos` itself isn't a valid
 * place but is at the start or end of a node. Return null if no position was
 * found.
 */
export function insertPoint(
   doc: EditorNode,
   idx: number,
   nodeType: NodeType
): number | undefined {
   const pos = doc.resolve(idx);

   if (pos.parent.canReplaceWith(pos.index(), pos.index(), nodeType))
      return idx;

   if (pos.parentOffset == 0) {
      for (let d = pos.depth - 1; d >= 0; d--) {
         let index = pos.index(d);

         if (pos.node(d).canReplaceWith(index, index, nodeType)) {
            return pos.before(d + 1);
         }
         if (index > 0) {
            return undefined;
         }
      }
   }
   if (pos.parentOffset == pos.parent.content.size)
      for (let d = pos.depth - 1; d >= 0; d--) {
         const index = pos.indexAfter(d);

         if (pos.node(d).canReplaceWith(index, index, nodeType)) {
            return pos.after(d + 1);
         }
         if (index < pos.node(d).childCount) {
            return undefined;
         }
      }
}

/**
 * Finds a position at or around the given position where the given slice can be
 * inserted. Will look at parent nodes' nearest boundary and try there, even if
 * the original position wasn't directly at the start or end of that node.
 * Returns `null` when no position was found.
 */
export function dropPoint(
   doc: EditorNode,
   idx: number,
   slice: Slice
): number | null {
   const pos = doc.resolve(idx);

   if (!slice.content.size) {
      return idx;
   }
   let content: Fragment = slice.content;

   for (let i = 0; i < slice.openStart; i++) {
      if (content.firstChild !== undefined) {
         content = content.firstChild.content;
      }
   }

   for (
      let pass = 1;
      pass <= (slice.openStart == 0 && slice.size ? 2 : 1);
      pass++
   ) {
      for (let d = pos.depth; d >= 0; d--) {
         const bias =
            d == pos.depth
               ? 0
               : pos.pos <= (pos.start(d + 1) + pos.end(d + 1)) / 2
               ? -1
               : 1;
         const insertPos = pos.index(d) + (bias > 0 ? 1 : 0);

         if (
            pass == 1
               ? pos.node(d).canReplace(insertPos, insertPos, content)
               : pos
                    .node(d)
                    .contentMatchAt(insertPos)
                    .findWrapping(content.firstChild?.type)
         )
            return bias == 0
               ? pos.pos
               : bias < 0
               ? pos.before(d + 1)
               : pos.after(d + 1);
      }
   }
   return null;
}
