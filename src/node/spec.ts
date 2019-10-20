import { EditorNode } from './node';
import { ItemSpec } from '../types';

/**
 * Specifications for an `EditorNode`.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L319
 */
export interface NodeSpec extends ItemSpec<EditorNode> {
   /**
    * Pattern indicating allowed content based on `NodeType` or group name. If
    * not given then no content will be allowed.
    */
   content?: string;

   /**
    * The marks that are allowed inside of this node. May be a space-separated
    * string referring to mark names or groups, `"_"` to explicitly allow all
    * marks, or `""` to disallow marks. When not given, nodes with inline
    * content default to allowing all marks, other nodes default to not allowing
    * marks.
    */
   marks?: string;

   /**
    * Should be set to true for inline nodes. (Implied for text nodes.)
    */
   inline?: boolean;

   /**
    * Set `true` to indicate nodes do not have directly editable content, and
    * should be treated as a single unit in the view, even though they may not
    * be leaf nodes (`isLeaf`).
    */
   atom?: boolean;

   /**
    * Controls whether nodes of this type can be selected as a
    * [node selection](#state.NodeSelection). Defaults to true for non-text
    * nodes.
    */
   selectable?: boolean;

   /**
    * Determines whether nodes of this type can be dragged without being
    * selected. Defaults to `false`.
    */
   draggable?: boolean;

   /**
    * Can be used to indicate that this node contains code, which causes some
    * commands to behave differently.
    */
   code?: boolean;

   /**
    * Determines whether this node is considered an important parent node during
    * replace operations (such as paste). Non-defining (the default) nodes get
    * dropped when their entire content is replaced, whereas defining nodes
    * persist and wrap the inserted content. Likewise, in _inserted_ content the
    * defining parents of the content are preserved when possible. Typically,
    * non-default-paragraph textblock types, and possibly list items, are marked
    * as defining.
    */
   defining?: boolean;

   /**
    * When enabled (default is `false`), the sides of nodes of this type count
    * as boundaries that regular editing operations, like backspacing or
    * lifting, won't cross. An example of a node that should probably have this
    * enabled is a table cell.
    */
   isolating?: boolean;

   /**
    * Defines the default way a node of this type should be serialized to a
    * string representation for debugging (e.g. in error messages).
    */
   toDebugString?: (node: EditorNode) => string;
}
