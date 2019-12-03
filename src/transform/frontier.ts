import { Position } from '../position';
import { Fragment } from '../node/fragment';
import { EditorNode, NodeType } from '../node';
import { Slice } from '../node/slice';
import { ContentMatch } from '../match';

interface Opening {
   parent: EditorNode;
   match?: ContentMatch;
   content: Fragment;
   wrapper: boolean;
   openEnd: number;
   depth: number;
}

export interface Placed {
   content: Fragment;
   openEnd: number;
   depth: number;
}

/**
 * Helper class that models the open side of the insert position, keeping track
 * of the content match and already inserted content at each depth.
 */
export class Frontier {
   placed: Placed[];
   open: Opening[];

   constructor(pos: Position) {
      this.open = [];

      for (let d = 0; d <= pos.depth; d++) {
         let parent = pos.node(d);
         let match = parent.contentMatchAt(pos.indexAfter(d));

         this.open.push({
            parent,
            match,
            content: Fragment.empty,
            wrapper: false,
            openEnd: 0,
            depth: d
         });
      }
      this.placed = [];
   }

   /**
    * Tries to place the content of the given slice, and returns a slice
    * containing unplaced content.
    *
    * pass 1: try to fit directly
    * pass 2: allow wrapper nodes to be introduced
    * pass 3: allow unwrapping of nodes that aren't open
    */
   placeSlice(
      fragment: Fragment,
      openStart: number,
      openEnd: number,
      pass: number,
      parent?: EditorNode
   ): Slice {
      if (openStart > 0) {
         const first = fragment.firstChild;

         if (first !== undefined) {
            const inner = this.placeSlice(
               first.content,
               Math.max(0, openStart - 1),
               openEnd && fragment.childCount == 1 ? openEnd - 1 : 0,
               pass,
               first
            );

            if (inner.content != first.content) {
               if (inner.content.size > 0) {
                  fragment = fragment.replaceChild(
                     0,
                     first.copy(inner.content)
                  );
                  openStart = inner.openStart + 1;
               } else {
                  if (fragment.childCount == 1) {
                     openEnd = 0;
                  }
                  fragment = fragment.cutByIndex(1);
                  openStart = 0;
               }
            }
         }
      }
      let result: Slice = this.placeContent(
         fragment,
         openStart,
         openEnd,
         pass,
         parent
      );

      if (pass > 2 && result.size && openStart == 0) {
         const child = result.content.firstChild;
         const single = result.content.childCount == 1;

         if (child !== undefined) {
            this.placeContent(
               child.content,
               0,
               openEnd && single ? openEnd - 1 : 0,
               pass,
               child
            );
         }
         result = single
            ? Slice.empty // TODO: original returned Fragment.empty
            : new Slice(result.content.cutByIndex(1), 0, openEnd);
      }
      return result;
   }

   placeContent(
      fragment: Fragment,
      openStart: number,
      openEnd: number,
      pass: number,
      parent?: EditorNode
   ) {
      let i = 0;
      // Go over the fragment's children
      for (; i < fragment.childCount; i++) {
         let child = fragment.child(i);
         let placed = false;
         let last = i == fragment.childCount - 1;

         // Try each open node in turn, starting from the innermost
         for (let d = this.open.length - 1; d >= 0; d--) {
            let open: Opening = this.open[d];
            let wrap: NodeType[] | undefined;

            // If pass > 1, it is allowed to wrap the node to help find a
            // fit, so if `findWrapping` returns something, we add open
            // nodes to the frontier for that wrapping.
            if (
               pass > 1 &&
               open.match !== undefined &&
               (wrap = open.match.findWrapping(child.type)) &&
               !(
                  parent !== undefined &&
                  wrap.length > 0 &&
                  wrap[wrap.length - 1] == parent.type
               )
            ) {
               while (this.open.length - 1 > d) {
                  this.closeNode();
               }
               for (let w = 0; w < wrap.length; w++) {
                  if (open.match !== undefined) {
                     open.match = open.match.matchType(wrap[w]);
                  }
                  d++;
                  open = {
                     parent: wrap[w].create(),
                     match: wrap[w].contentMatch,
                     content: Fragment.empty,
                     wrapper: true,
                     openEnd: 0,
                     depth: d + w
                  };
                  this.open.push(open);
               }
            }

            // See if the child fits here
            let match = open.match?.matchType(child.type);

            if (match !== undefined) {
               const fill = open.match?.fillBefore(Fragment.from(child));

               if (fill !== undefined) {
                  for (let j = 0; j < fill.childCount; j++) {
                     let ch: EditorNode = fill.child(j);
                     this.addNode(open, ch, 0);
                     match = open.match?.matchFragment(ch);
                  }
               } else if (
                  parent &&
                  open.match !== undefined &&
                  open.match.matchType(parent.type)
               ) {
                  // Don't continue looking further up if the parent node
                  // would fit here.
                  break;
               } else {
                  continue;
               }
            }

            // Close open nodes above this one, since we're starting to
            // add to this.
            while (this.open.length - 1 > d) {
               this.closeNode();
            }
            // Strip marks from the child or close its start when necessary
            child = child.mark(open.parent.type.allowedMarks(child.marks));

            if (openStart) {
               child = closeNodeStart(child, openStart, last ? openEnd : 0);
               openStart = 0;
            }
            // Add the child to this open node and adjust its metadata
            this.addNode(open, child, last ? openEnd : 0);
            open.match = match;
            if (last) openEnd = 0;
            placed = true;
            break;
         }
         // As soon as we've failed to place a node we stop looking at
         // later nodes
         if (!placed) break;
      }
      // Close the current open node if it's not the the root and we
      // either placed up to the end of the node or the the current
      // slice depth's node type matches the open node's type
      if (
         this.open.length > 1 &&
         ((i > 0 && i == fragment.childCount) ||
            (parent &&
               this.open[this.open.length - 1].parent.type == parent.type))
      )
         this.closeNode();

      return new Slice(fragment.cutByIndex(i), openStart, openEnd);
   }

   addNode(open: Opening, node: EditorNode, openEnd: number) {
      open.content = closeFragmentEnd(open.content, open.openEnd).addToEnd(
         node
      );
      open.openEnd = openEnd;
   }

   closeNode() {
      let open: Opening | undefined = this.open.pop();

      if (open === undefined || open.content.size == 0) {
         // Nothing here
      } else if (open.wrapper) {
         this.addNode(
            this.open[this.open.length - 1],
            open.parent.copy(open.content),
            open.openEnd + 1
         );
      } else {
         this.placed[open.depth] = {
            depth: open.depth,
            content: open.content,
            openEnd: open.openEnd
         };
      }
   }
}

function closeNodeStart(
   node: EditorNode,
   openStart: number,
   openEnd: number
): EditorNode {
   let content: Fragment = node.content;

   if (openStart > 1 && node.firstChild !== undefined) {
      let first = closeNodeStart(
         node.firstChild,
         openStart - 1,
         node.childCount == 1 ? openEnd - 1 : 0
      );
      content = node.content.replaceChild(0, first);
   }
   let fill = node.type.contentMatch.fillBefore(content, openEnd == 0);

   return node.copy(fill.append(content));
}

function closeNodeEnd(node: EditorNode, depth: number) {
   let content: Fragment = node.content;

   if (depth > 1 && node.lastChild !== undefined) {
      let last = closeNodeEnd(node.lastChild, depth - 1);
      content = node.content.replaceChild(node.childCount - 1, last);
   }
   const fill = node
      .contentMatchAt(node.childCount)
      .fillBefore(Fragment.empty, true);

   return node.copy(content.append(fill));
}

const closeFragmentEnd = (fragment: Fragment, depth: number) =>
   depth > 0 && fragment.lastChild !== undefined
      ? fragment.replaceChild(
           fragment.childCount - 1,
           closeNodeEnd(fragment.lastChild, depth)
        )
      : fragment;
