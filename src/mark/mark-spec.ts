import { ItemSpec } from '../types';
import { Mark } from './mark';

/**
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.js#L404
 */
export interface MarkSpec extends ItemSpec<Mark> {
   /**
    * Whether this mark should be active when the cursor is positioned at its
    * end (or at its start when that is also the start of the parent node).
    * The default is `true`.
    */
   inclusive?: boolean;

   /**
    * Determines which other marks this mark can coexist with. Should be a
    * space-separated string naming other marks or groups of marks. When a mark
    * is [added](#model.Mark.addToSet) to a set, all marks that it excludes are
    * removed in the process. If the set contains any mark that excludes the
    * new mark but is not, itself, excluded by the new mark, the mark can not be
    * added an the set. You can use the value `"_"` to indicate that the mark
    * excludes all marks in the schema.
    *
    * Defaults to only being exclusive with marks of the same type. You can set
    * it to an empty string (or any string not containing the mark's own name)
    * to allow multiple marks of a given type to coexist (as long as they have
    * different attributes).
    */
   excludes?: string;

   /**
    * Determines whether marks of this type can span multiple adjacent nodes
    * when serialized to DOM/HTML. The default is `true`.
    */
   spanning?: boolean;
}
