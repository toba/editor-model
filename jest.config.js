const config = require('@toba/test/jest');
// modify default test pattern to exclude spec.ts files
config.testMatch = ['**/?(*.)+(test).[jt]s?(x)'];
module.exports = config;
