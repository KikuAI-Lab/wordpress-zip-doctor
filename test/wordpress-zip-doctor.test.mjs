import assert from 'node:assert/strict'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { test } from 'node:test'
import {
  analyzeWordPressZip,
  buildMarkdownReport,
  createWordPressZipDoctorDemo,
  createSampleWordPressZip,
  createStoredZip,
  listWordPressZipDoctorDemos,
} from '../src/wordpress-zip-doctor.js'

function inflateRaw(bytes) {
  return inflateRawSync(bytes)
}

function makeDeflatedZip(files) {
  const textEncoder = new TextEncoder()
  const localParts = []
  const centralParts = []
  let offset = 0

  function crc32(bytes) {
    let crc = 0xffffffff
    for (const byte of bytes) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
      }
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  function write16(target, at, value) {
    target[at] = value & 0xff
    target[at + 1] = (value >>> 8) & 0xff
  }

  function write32(target, at, value) {
    target[at] = value & 0xff
    target[at + 1] = (value >>> 8) & 0xff
    target[at + 2] = (value >>> 16) & 0xff
    target[at + 3] = (value >>> 24) & 0xff
  }

  for (const [name, text] of Object.entries(files)) {
    const nameBytes = textEncoder.encode(name)
    const data = textEncoder.encode(text)
    const compressed = deflateRawSync(data)
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length + compressed.length)
    write32(local, 0, 0x04034b50)
    write16(local, 4, 20)
    write16(local, 6, 0x0800)
    write16(local, 8, 8)
    write32(local, 14, crc)
    write32(local, 18, compressed.length)
    write32(local, 22, data.length)
    write16(local, 26, nameBytes.length)
    local.set(nameBytes, 30)
    local.set(compressed, 30 + nameBytes.length)
    localParts.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    write32(central, 0, 0x02014b50)
    write16(central, 4, 20)
    write16(central, 6, 20)
    write16(central, 8, 0x0800)
    write16(central, 10, 8)
    write32(central, 16, crc)
    write32(central, 20, compressed.length)
    write32(central, 24, data.length)
    write16(central, 28, nameBytes.length)
    write32(central, 42, offset)
    central.set(nameBytes, 46)
    centralParts.push(central)
    offset += local.length
  }

  const centralOffset = offset
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const eocd = new Uint8Array(22)
  write32(eocd, 0, 0x06054b50)
  write16(eocd, 8, localParts.length)
  write16(eocd, 10, localParts.length)
  write32(eocd, 12, centralSize)
  write32(eocd, 16, centralOffset)
  const output = new Uint8Array(centralOffset + centralSize + eocd.length)
  let cursor = 0
  for (const part of localParts) {
    output.set(part, cursor)
    cursor += part.length
  }
  for (const part of centralParts) {
    output.set(part, cursor)
    cursor += part.length
  }
  output.set(eocd, cursor)
  return output
}

test('detects installable theme and plugin ZIPs', async () => {
  const theme = await analyzeWordPressZip(createSampleWordPressZip('theme'))
  assert.equal(theme.primaryCode, 'installable_theme')
  assert.equal(theme.detectedKind, 'theme')
  assert.equal(theme.export.eligible, false)
  assert.equal(theme.verdictKind, 'upload_this_zip')
  assert.equal(theme.artifactKind, 'none_needed')

  const plugin = await analyzeWordPressZip(createSampleWordPressZip('plugin'))
  assert.equal(plugin.primaryCode, 'installable_plugin')
  assert.equal(plugin.detectedKind, 'plugin')
  assert.equal(plugin.export.eligible, false)
  assert.equal(plugin.verdictKind, 'upload_this_zip')
})

test('ships pain-path demo fixtures with preview decision contracts', async () => {
  const expected = new Map([
    ['missing-style-css', 'missing_style_css'],
    ['no-valid-plugin', 'no_valid_plugin_header'],
    ['nested-theme-bundle', 'nested_installable_zip_found'],
    ['source-archive', 'github_or_source_archive_diagnostic'],
    ['wrong-target-plugin-as-theme', 'plugin_uploaded_as_theme'],
    ['installable-theme', 'installable_theme'],
  ])

  assert.deepEqual(listWordPressZipDoctorDemos().map((demo) => demo.id), [...expected.keys()])

  for (const [id, primaryCode] of expected) {
    const demo = createWordPressZipDoctorDemo(id)
    const result = await analyzeWordPressZip(demo.bytes, { targetMode: demo.targetMode, inflateRaw })
    assert.equal(result.primaryCode, primaryCode)
    assert.equal(typeof result.verdictKind, 'string')
    assert.equal(typeof result.userAction, 'string')
    assert.equal(typeof result.artifactKind, 'string')
    assert.equal(typeof result.blockingReason, 'string')
    assert.equal(typeof result.metricOutcome, 'string')
    assert.equal(typeof result.wordpressExpected, 'string')
    assert.equal(typeof result.foundSummary, 'string')
    assert.equal(Array.isArray(result.decision.intentOffers), true)
  }
})

test('supports deflated ZIP entries when inflateRaw is provided', async () => {
  const zip = makeDeflatedZip({
    'deflated-plugin/deflated-plugin.php': `<?php
/**
 * Plugin Name: Deflated Plugin
 */
`,
  })
  const result = await analyzeWordPressZip(zip, { targetMode: 'plugin', inflateRaw })
  assert.equal(result.primaryCode, 'installable_plugin')
})

test('separates wrong upload target cases', async () => {
  const themeAsPlugin = await analyzeWordPressZip(createSampleWordPressZip('theme'), { targetMode: 'plugin' })
  assert.equal(themeAsPlugin.primaryCode, 'theme_uploaded_as_plugin')

  const pluginAsTheme = await analyzeWordPressZip(createSampleWordPressZip('plugin'), { targetMode: 'theme' })
  assert.equal(pluginAsTheme.primaryCode, 'plugin_uploaded_as_theme')
})

test('requires parent themes to include a WordPress theme entry point', async () => {
  const zip = createStoredZip({
    'partial-theme/style.css': `/*
Theme Name: Partial Theme
*/
`,
    'partial-theme/readme.txt': 'No template entry point.',
  })
  const result = await analyzeWordPressZip(zip, { targetMode: 'theme' })
  assert.equal(result.primaryCode, 'theme_missing_required_template')
  assert.equal(result.export.eligible, false)
})

test('allows child themes with a Template header', async () => {
  const zip = createStoredZip({
    'child-theme/style.css': `/*
Theme Name: Child Theme
Template: parent-theme
*/
`,
    'child-theme/functions.php': '<?php',
  })
  const result = await analyzeWordPressZip(zip, { targetMode: 'theme' })
  assert.equal(result.primaryCode, 'installable_theme')
})

test('does not treat deeply nested plugin headers as installable', async () => {
  const zip = createStoredZip({
    'source-package/src/deep-plugin/deep-plugin.php': `<?php
/**
 * Plugin Name: Deep Plugin
 */
`,
  })
  const result = await analyzeWordPressZip(zip, { targetMode: 'plugin' })
  assert.equal(result.primaryCode, 'deep_php_only_non_installable')
  assert.equal(result.export.eligible, false)
})

test('finds a single nested installable ZIP and returns it unchanged', async () => {
  const nested = createSampleWordPressZip('theme')
  const outer = createStoredZip({
    'themeforest-bundle/documentation/readme.txt': 'Docs.',
    'themeforest-bundle/installable-wordpress-file.zip': nested,
  })
  const result = await analyzeWordPressZip(outer, { targetMode: 'theme' })
  assert.equal(result.primaryCode, 'nested_installable_zip_found')
  assert.equal(result.export.eligible, true)
  assert.equal(result.export.mode, 'return_nested_unchanged')

  const roundTrip = await analyzeWordPressZip(result.export.bytes, { targetMode: 'theme' })
  assert.equal(roundTrip.primaryCode, 'installable_theme')
})

test('repackages a single valid folder when the outer ZIP has extra files', async () => {
  const outer = createStoredZip({
    'docs/readme.txt': 'Vendor docs.',
    'actual-theme/style.css': `/*
Theme Name: Actual Theme
*/
`,
    'actual-theme/index.php': '<?php',
  })
  const result = await analyzeWordPressZip(outer, { targetMode: 'theme' })
  assert.equal(result.primaryCode, 'wrong_outer_bundle')
  assert.equal(result.export.eligible, true)
  assert.equal(result.export.mode, 'repack_single_root')

  const roundTrip = await analyzeWordPressZip(result.export.bytes, { targetMode: 'theme' })
  assert.equal(roundTrip.primaryCode, 'installable_theme')
})

test('blocks ambiguous bundles with multiple candidates', async () => {
  const outer = createStoredZip({
    'theme-one/style.css': '/*\nTheme Name: Theme One\n*/',
    'theme-one/index.php': '<?php',
    'theme-two/style.css': '/*\nTheme Name: Theme Two\n*/',
    'theme-two/index.php': '<?php',
  })
  const result = await analyzeWordPressZip(outer, { targetMode: 'theme' })
  assert.equal(result.primaryCode, 'multiple_installable_candidates')
  assert.equal(result.export.eligible, false)
})

test('diagnoses common non-installable package shapes', async () => {
  const source = await analyzeWordPressZip(createStoredZip({
    'project-main/package.json': '{}',
    'project-main/src/index.js': 'console.log("source")',
  }))
  assert.equal(source.primaryCode, 'github_or_source_archive_diagnostic')

  const templateKit = await analyzeWordPressZip(createStoredZip({
    'template-kit/templates/home.json': '{}',
    'template-kit/elementor-kit.json': '{}',
  }))
  assert.equal(templateKit.primaryCode, 'template_kit_or_non_theme_package')
})

test('rejects invalid and unsafe ZIPs', async () => {
  const invalid = await analyzeWordPressZip(new Uint8Array([1, 2, 3]))
  assert.equal(invalid.primaryCode, 'invalid_zip')

  const tooMany = createStoredZip(Object.fromEntries(
    Array.from({ length: 4 }, (_, index) => [`files/${index}.txt`, 'x']),
  ))
  const blocked = await analyzeWordPressZip(tooMany, { limits: { maxEntryCount: 3 } })
  assert.equal(blocked.primaryCode, 'too_large_or_unsafe_to_scan')
})

test('builds a privacy-safe markdown report', async () => {
  const result = await analyzeWordPressZip(createSampleWordPressZip('plugin'), { targetMode: 'plugin' })
  const report = buildMarkdownReport(result)
  assert.match(report, /WordPress ZIP Doctor report/)
  assert.match(report, /installable_plugin/)
  assert.match(report, /Preview decision/)
  assert.doesNotMatch(report, /Sample Plugin/)
})
