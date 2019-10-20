const {schema, eq, doc, blockquote, pre, h1, h2, p, li, ol, ul, em, strong, code, a, br, img, hr,
       builders} = require("prosemirror-test-builder")
const ist = require("ist")
const {DOMParser, DOMSerializer, Slice, Fragment, Schema} = require("../dist")

// declare global: window
let document = typeof window == "undefined" ? (new (require("jsdom").JSDOM)).window.document : window.document

const parser = DOMParser.fromSchema(schema)
const serializer = DOMSerializer.fromSchema(schema)

describe("DOMParser", () => {



    it("normalizes newlines when preserving whitespace",
       recover("<p>foo  bar\nbaz</p>",
              doc(p("foo  bar baz")), {preserveWhitespace: true}))

    it("ignores <script> tags",
       recover("<p>hello<script>alert('x')</script>!</p>",
               doc(p("hello!"))))

    it("can handle a head/body input structure",
       recover("<head><title>T</title><meta charset='utf8'/></head><body>hi</body>",
               doc(p("hi"))))

    it("only applies a mark once",
       recover("<p>A <strong>big <strong>strong</strong> monster</strong>.</p>",
               doc(p("A ", strong("big strong monster"), "."))))

    it("interprets font-style: italic as em",
       recover("<p><span style='font-style: italic'>Hello</span>!</p>",
               doc(p(em("Hello"), "!"))))

    it("interprets font-weight: bold as strong",
       recover("<p style='font-weight: bold'>Hello</p>",
               doc(p(strong("Hello")))))

    it("ignores unknown inline tags",
       recover("<p><u>a</u>bc</p>",
               doc(p("abc"))))

    it("can add marks specified before their parent node is opened",
       recover("<em>hi</em> you",
               doc(p(em("hi"), " you"))))

    it("keeps applying a mark for the all of the node's content",
       recover("<p><strong><span>xx</span>bar</strong></p>",
               doc(p(strong("xxbar")))))

    function parse(html, options, doc) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        let result = parser.parse(dom, options)
        ist(result, doc, eq)
      }
    }

    it("accepts the topNode option",
       parse("<li>wow</li><li>such</li>", {topNode: schema.nodes.bullet_list.createAndFill()},
             ul(li(p("wow")), li(p("such")))))

    let item = schema.nodes.list_item.createAndFill()
    it("accepts the topMatch option",
       parse("<ul><li>x</li></ul>", {topNode: item, topMatch: item.contentMatchAt(1)},
             li(ul(li(p("x"))))))

    it("accepts from and to options",
       parse("<hr><p>foo</p><p>bar</p><img>", {from: 1, to: 3},
             doc(p("foo"), p("bar"))))

    it("accepts the preserveWhitespace option",
       parse("foo   bar", {preserveWhitespace: true},
             doc(p("foo   bar"))))

    function open(html, nodes, openStart, openEnd) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        let result = parser.parseSlice(dom)
        ist(result, new Slice(Fragment.from(nodes.map(n => typeof n == "string" ? schema.text(n) : n)), openStart, openEnd), eq)
      }
    }

    it("can parse an open slice",
       open("foo", ["foo"], 0, 0))

    it("will accept weird siblings",
       open("foo<p>bar</p>", ["foo", p("bar")], 0, 1))

    it("will open all the way to the inner nodes",
       open("<ul><li>foo</li><li>bar<br></li></ul>", [ul(li(p("foo")), li(p("bar", br)))], 3, 3))

    it("accepts content open to the left",
       open("<li><ul><li>a</li></ul></li>", [li(ul(li(p("a"))))], 4, 4))

    it("accepts content open to the right",
       open("<li>foo</li><li></li>", [li(p("foo")), li()], 2, 1))

    it("will create textblocks for block nodes",
       open("<div><div>foo</div><div>bar</div></div>", [p("foo"), p("bar")], 1, 1))

    it("can parse marks at the start of defaulted textblocks",
       open("<div>foo</div><div><em>bar</em></div>",
            [p("foo"), p(em("bar"))], 1, 1))

    function find(html, doc) {
      return () => {
        let dom = document.createElement("div")
        dom.innerHTML = html
        let tag = dom.querySelector("var"), prev = tag.previousSibling, next = tag.nextSibling, pos
        if (prev && next && prev.nodeType == 3 && next.nodeType == 3) {
          pos = {node: prev, offset: prev.nodeValue.length}
          prev.nodeValue += next.nodeValue
          next.parentNode.removeChild(next)
        } else {
          pos = {node: tag.parentNode, offset: Array.prototype.indexOf.call(tag.parentNode.childNodes, tag)}
        }
        tag.parentNode.removeChild(tag)
        let result = parser.parse(dom, {
          findPositions: [pos]
        })
        ist(result, doc, eq)
        ist(pos.pos, doc.tag.a)
      }
    }

    it("can find a position at the start of a paragraph",
       find("<p><var></var>hello</p>",
            doc(p("<a>hello"))))

    it("can find a position at the end of a paragraph",
       find("<p>hello<var></var></p>",
            doc(p("hello<a>"))))

    it("can find a position inside text",
       find("<p>hel<var></var>lo</p>",
            doc(p("hel<a>lo"))))

    it("can find a position inside an ignored node",
       find("<p>hi</p><object><var></var>foo</object><p>ok</p>",
            doc(p("hi"), "<a>", p("ok"))))

    it("can find a position between nodes",
       find("<ul><li>foo</li><var></var><li>bar</li></ul>",
            doc(ul(li(p("foo")), "<a>", li(p("bar"))))))

    it("can find a position at the start of the document",
       find("<var></var><p>hi</p>",
            doc("<a>", p("hi"))))

    it("can find a position at the end of the document",
       find("<p>hi</p><var></var>",
            doc(p("hi"), "<a>")))

    let quoteSchema = new Schema({nodes: schema.spec.nodes, marks: schema.spec.marks, topNode: "blockquote"})

    it("uses a custom top node when parsing",
       test(quoteSchema.node("blockquote", null, quoteSchema.node("paragraph", null, quoteSchema.text("hello"))),
            "<p>hello</p>"))

    function contextParser(context) {
      return new DOMParser(schema, [{tag: "foo", node: "horizontal_rule", context}].concat(DOMParser.schemaRules(schema)))
    }

    it("recognizes context restrictions", () => {
      ist(contextParser("blockquote/").parse(domFrom("<foo></foo><blockquote><foo></foo><p><foo></foo></p></blockquote>")),
          doc(blockquote(hr, p())), eq)
    })

    it("accepts group names in contexts", () => {
      ist(contextParser("block/").parse(domFrom("<foo></foo><blockquote><foo></foo><p></p></blockquote>")),
          doc(blockquote(hr, p())), eq)
    })

    it("understands nested context restrictions", () => {
      ist(contextParser("blockquote/ordered_list//")
          .parse(domFrom("<foo></foo><blockquote><foo></foo><ol><li><p>a</p><foo></foo></li></ol></blockquote>")),
          doc(blockquote(ol(li(p("a"), hr)))), eq)
    })

    it("understands double slashes in context restrictions", () => {
      ist(contextParser("blockquote//list_item/")
          .parse(domFrom("<foo></foo><blockquote><foo></foo><ol><foo></foo><li><p>a</p><foo></foo></li></ol></blockquote>")),
          doc(blockquote(ol(li(p("a"), hr)))), eq)
    })

    it("understands pipes in context restrictions", () => {
      ist(contextParser("list_item/|blockquote/")
          .parse(domFrom("<foo></foo><blockquote><p></p><foo></foo></blockquote><ol><li><p>a</p><foo></foo></li></ol>")),
          doc(blockquote(p(), hr), ol(li(p("a"), hr))), eq)
    })

    it("uses the passed context", () => {
      let cxDoc = doc(blockquote("<a>", hr))
      ist(contextParser("doc//blockquote/").parse(domFrom("<blockquote><foo></foo></blockquote>"), {
        topNode: blockquote(),
        context: cxDoc.resolve(cxDoc.tag.a)
      }), blockquote(blockquote(hr)), eq)
    })

    it("uses the passed context when parsing a slice", () => {
      let cxDoc = doc(blockquote("<a>", hr))
      ist(contextParser("doc//blockquote/").parseSlice(domFrom("<foo></foo>"), {
        context: cxDoc.resolve(cxDoc.tag.a)
      }), new Slice(blockquote(hr).content, 0, 0), eq)
    })
  })

  describe("schemaRules", () => {
    it("defaults to schema order", () => {
      let schema = new Schema({
        marks: {em: {parseDOM: [{tag: "i"}, {tag: "em"}]}},
        nodes: {doc: {content: "inline*"},
                text: {group: "inline"},
                foo: {group: "inline", inline: true, parseDOM: [{tag: "foo"}]},
                bar: {group: "inline", inline: true, parseDOM: [{tag: "bar"}]}}
      })
      ist(DOMParser.schemaRules(schema).map(r => r.tag).join(" "), "i em foo bar")
    })

    it("understands priority", () => {
      let schema = new Schema({
        marks: {em: {parseDOM: [{tag: "i", priority: 40}, {tag: "em", priority: 70}]}},
        nodes: {doc: {content: "inline*"},
                text: {group: "inline"},
                foo: {group: "inline", inline: true, parseDOM: [{tag: "foo"}]},
                bar: {group: "inline", inline: true, parseDOM: [{tag: "bar", priority: 60}]}}
      })
      ist(DOMParser.schemaRules(schema).map(r => r.tag).join(" "), "em bar foo i")
    })

    const xmlDocument = typeof window == "undefined"
          ? (new (require("jsdom").JSDOM)("<tag/>", {contentType: "application/xml"})).window.document
          : window.document

    function nsParse(doc, namespace) {
      let schema = new Schema({
        nodes: {doc: {content: "h*"}, text: {},
                h: {parseDOM: [{tag: "h", namespace}]}}
      })
      return DOMParser.fromSchema(schema).parse(doc)
    }

    it("includes nodes when namespace is correct", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS("urn:ns", "h")
      doc.appendChild(h)
      ist(nsParse(doc, "urn:ns").childCount, 1)
    })

    it("excludes nodes when namespace is wrong", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS("urn:nt", "h")
      doc.appendChild(h)
      ist(nsParse(doc, "urn:ns").childCount, 0)
    })

    it("excludes nodes when namespace is absent", () => {
      let doc = xmlDocument.createElement("doc")
      // in HTML documents, createElement gives namespace
      // 'http://www.w3.org/1999/xhtml' so use createElementNS
      let h = xmlDocument.createElementNS(null, "h")
      doc.appendChild(h)
      ist(nsParse(doc, "urn:ns").childCount, 0)
    })

    it("excludes nodes when namespace is wrong and xhtml", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS("urn:nt", "h")
      doc.appendChild(h)
      ist(nsParse(doc, "http://www.w3.org/1999/xhtml").childCount, 0)
    })

    it("excludes nodes when namespace is wrong and empty", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS("urn:nt", "h")
      doc.appendChild(h)
      ist(nsParse(doc, "").childCount, 0)
    })

    it("includes nodes when namespace is correct and empty", () => {
      let doc = xmlDocument.createElement("doc")
      let h = xmlDocument.createElementNS(null, "h")
      doc.appendChild(h)
      ist(nsParse(doc, null).childCount, 1)
    })
  })
})

