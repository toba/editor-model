import { ParseRule } from './parse-dom';
import { AttributeSpec } from './attribute';
import { Mark } from './mark';
import { EditorNode } from './node';
import { DOMOutputSpec } from './to-dom';

export type SimpleMap<T> = { [key: string]: T };

export interface ItemSpec<T extends Mark | EditorNode> {
   /**
    * The attributes that items of this type get.
    */
   attrs?: SimpleMap<AttributeSpec<any>>;

   /**
    * The group or space-separated groups to which this node belongs, which can
    * be referred to in the content expressions for the schema.
    */
   group?: string;

   /**
    * DOM parser information for the item that can be used by
    * `DOMParser.fromSchema` to derive a parser. The `node` field in the rules
    * is implied (the name of this node will be filled in automatically). If
    * you supply your own parser, you do not need to also specify parsing rules
    * in your schema.
    */
   parseDOM?: ParseRule[];

   /**
    * Defines the default way items of this type should be serialized to
    * DOM/HTML. When the resulting spec contains a hole, that is where the
    * marked content is placed. Otherwise, it is appended to the top node.
    *
    * Defines the default way a node of this type should be serialized to
    * DOM/HTML (as used by [`DOMSerializer.fromSchema`](#model.DOMSerializer^fromSchema)).
    * Should return a DOM node or an [array structure](#model.DOMOutputSpec)
    * that describes one, with an optional number zero (“hole”) in it to
    * indicate where the node's content should be inserted.
    *
    * For text nodes, the default is to create a text DOM node. Though it is
    * possible to create a serializer where text is rendered differently, this
    * is not supported inside the editor, so you shouldn't override that in your
    * text node spec.
    *
    * @param inline Whether a mark's content is block or inline content (for
    * typical use, it will always be inline)
    */
   toDOM?: (item: T, inline?: boolean) => DOMOutputSpec;
}
