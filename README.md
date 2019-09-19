[![npm package](https://img.shields.io/npm/v/@toba/editor-model.svg)](https://www.npmjs.org/package/@toba/editor-model)
[![Build Status](https://travis-ci.org/toba/editor-model.svg?branch=master)](https://travis-ci.org/toba/editor-model)
![Code style](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)
[![Dependencies](https://img.shields.io/david/toba/editor-model.svg)](https://david-dm.org/toba/editor-model)
[![DevDependencies](https://img.shields.io/david/dev/toba/editor-model.svg)](https://david-dm.org/toba/editor-model#info=devDependencies&view=list)
[![Test Coverage](https://codecov.io/gh/toba/editor-model/branch/master/graph/badge.svg)](https://codecov.io/gh/toba/editor-model)

<img src='https://toba.github.io/about/images/logo-colored.svg' width="100" align="right"/>

This is a fork of [prosemirror-model](https://github.com/ProseMirror/prosemirror-model) with these trade-offs:

- Converted to strict TypeScript
- Formatted with Prettier
- Unit test coverage reports
- Fully compatible (interchangeable) with original ProseMirror modules
- Distributed as both CommonJS and ESM modules with no bundling
   - Better tree shaking
   - `package.json` configuration facilitates automatic load of correct module types

- ️️No direct forum or community support

## Original ProseMirror documentation

This is a [core module](http://prosemirror.net/docs/ref/#model) of [ProseMirror](http://prosemirror.net).
ProseMirror is a well-behaved rich semantic content editor based on contentEditable, with support for collaborative editing and custom document schemas.

This [module](http://prosemirror.net/docs/ref/#model) implements ProseMirror's [document model](http://prosemirror\.net/docs/guide/#doc), along with the mechanisms needed to support
[schemas](http://prosemirror\.net/docs/guide/#schema).

The [project page](http://prosemirror.net) has more information, a number of [examples](http://prosemirror.net/examples/) and the
[documentation](http://prosemirror.net/docs/).
