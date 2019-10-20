import { OrderedMap } from '../ordered-map';
import { MarkSpec } from '../mark';
import { NodeSpec } from '../node';

/**
 * An object describing a schema.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L297
 */
export interface SchemaSpec {
   /**
    * The node types in this schema. Maps names to `NodeSpec` objects that
    * describe the node type associated with that name. Their order is
    * significant — it determines which
    * [parse rules](http://prosemirror.net/docs/ref/#model.NodeSpec.parseDOM)
    * take precedence by default, and which nodes come first in a given
    * [group](http://prosemirror.net/docs/ref/#model.NodeSpec.group).
    */
   nodes?: OrderedMap<NodeSpec>;

   /**
    * The mark types that exist in this schema. The order in which they are
    * provided determines the order in which
    * [mark sets](http://prosemirror.net/docs/ref/#model.Mark.addToSet)
    * are sorted and in which [parse rules](#model.MarkSpec.parseDOM) are tried.
    */
   marks?: OrderedMap<MarkSpec>;

   /**
    * Name of the default top-level node for the schema. The default is `"doc"`.
    */
   topNode?: string;
}
