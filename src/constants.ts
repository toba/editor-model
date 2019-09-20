/**
 * @see https://www.w3schools.com/jsref/prop_node_nodetype.asp
 */
export const enum HtmlNodeType {
   Element = 1,
   Attribute = 2,
   /** Text content of an element or attribute */
   Text = 3,
   CDATA = 4,
   EntityReference = 5,
   Entity = 6,
   ProcessingInstruction = 7,
   Comment = 8,
   /** Root of the DOM tree */
   Document = 9,
   DocumentType = 10,
   DocumentFragment = 11,
   /** Notation declared in the DTD */
   Notation = 12
}
