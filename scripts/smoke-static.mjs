import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

for (const path of ['index.html', 'src/main.js', 'src/styles.css', 'src/wordpress-zip-doctor.js']) {
  assert.equal(existsSync(path), true, `${path} should exist`)
}

const html = await readFile('index.html', 'utf8')
assert.match(html, /WordPress ZIP Doctor/)
assert.match(html, /\.\/src\/main\.js/)
assert.match(html, /\.\/src\/styles\.css/)

const main = await readFile('src/main.js', 'utf8')
assert.match(main, /analyzeWordPressZip/)
assert.match(main, /DecompressionStream/)

console.log('Static smoke checks passed.')
