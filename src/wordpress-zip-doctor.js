const DEFAULT_LIMITS = {
  maxZipBytes: 100 * 1024 * 1024,
  maxTotalUncompressedBytes: 250 * 1024 * 1024,
  maxEntryCount: 5000,
  maxNestedZipCount: 20,
  maxNestedDepth: 1,
  maxCompressionRatio: 100,
  headerBytes: 8 * 1024,
  maxHeaderEntryBytes: 1024 * 1024,
}

const ZIP_SIGNATURES = {
  localFile: 0x04034b50,
  centralDirectory: 0x02014b50,
  endOfCentralDirectory: 0x06054b50,
}

const RESULT_COPY = {
  invalid_zip: {
    title: 'This is not a readable ZIP file',
    summary: 'The file could not be parsed as a regular ZIP archive.',
    nextSteps: ['Download the package again from the original vendor or repository.'],
    confidence: 'high',
  },
  encrypted_or_unsupported: {
    title: 'The ZIP uses encrypted or unsupported entries',
    summary: 'WordPress ZIP Doctor only inspects normal stored or deflated ZIP entries.',
    nextSteps: ['Export an unencrypted ZIP and try again.'],
    confidence: 'high',
  },
  too_large_or_unsafe_to_scan: {
    title: 'This ZIP is too large to scan safely in the browser',
    summary: 'The archive exceeds the browser-local safety limits for size or entry count.',
    nextSteps: ['Use the installable WordPress package instead of a full source or vendor bundle.'],
    confidence: 'high',
  },
  zip_bomb_risk: {
    title: 'This ZIP looks unsafe to expand',
    summary: 'The declared extracted size or compression ratio is too high for a browser-local scan.',
    nextSteps: ['Do not upload this package to WordPress until you verify the source.'],
    confidence: 'high',
  },
  installable_theme: {
    title: 'This looks like an installable WordPress theme ZIP',
    summary: 'The package has a valid theme header and the required theme entry point.',
    nextSteps: ['Upload this ZIP under Appearance -> Themes -> Add New -> Upload Theme.'],
    confidence: 'high',
  },
  installable_plugin: {
    title: 'This looks like an installable WordPress plugin ZIP',
    summary: 'The package has a root-level PHP file with a valid Plugin Name header.',
    nextSteps: ['Upload this ZIP under Plugins -> Add New -> Upload Plugin.'],
    confidence: 'high',
  },
  nested_installable_zip_found: {
    title: 'Found the installable WordPress ZIP inside this bundle',
    summary: 'The outer ZIP is a bundle. Use the nested installable ZIP instead.',
    nextSteps: ['Download the extracted ZIP from this tool and upload that file to WordPress.'],
    confidence: 'high',
  },
  wrong_outer_bundle: {
    title: 'The WordPress package is wrapped inside extra files',
    summary: 'A valid theme or plugin folder was found, but the uploaded ZIP also contains unrelated top-level files.',
    nextSteps: ['Download the repacked ZIP from this tool, or zip only the WordPress package folder.'],
    confidence: 'high',
  },
  multiple_installable_candidates: {
    title: 'This bundle contains multiple possible WordPress packages',
    summary: 'The tool found more than one installable theme or plugin candidate.',
    nextSteps: ['Open the bundle and choose the exact installable ZIP or folder manually.'],
    confidence: 'medium',
  },
  theme_uploaded_as_plugin: {
    title: 'This is a theme, not a plugin',
    summary: 'The ZIP has WordPress theme markers, but you selected the plugin upload path.',
    nextSteps: ['Upload it under Appearance -> Themes -> Add New -> Upload Theme.'],
    confidence: 'high',
  },
  plugin_uploaded_as_theme: {
    title: 'This is a plugin, not a theme',
    summary: 'The ZIP has WordPress plugin markers, but you selected the theme upload path.',
    nextSteps: ['Upload it under Plugins -> Add New -> Upload Plugin.'],
    confidence: 'high',
  },
  missing_style_css: {
    title: 'Theme stylesheet is missing',
    summary: 'WordPress themes need a root-level style.css file in the installable package.',
    nextSteps: ['Look for an "installable WordPress file only" ZIP or zip the actual theme folder.'],
    confidence: 'high',
  },
  style_css_missing_theme_name: {
    title: 'style.css is present but does not declare a Theme Name',
    summary: 'WordPress reads the theme metadata from the first header block in style.css.',
    nextSteps: ['Add a Theme Name header or use the real theme package from the vendor.'],
    confidence: 'high',
  },
  theme_missing_required_template: {
    title: 'Theme header exists, but the required theme entry point is missing',
    summary: 'Parent themes need index.php, templates/index.html, or block-templates/index.html. Child themes need a Template header.',
    nextSteps: ['Use the complete theme package, not a partial source or documentation ZIP.'],
    confidence: 'high',
  },
  no_valid_plugin_header: {
    title: 'No valid plugin header was found',
    summary: 'WordPress plugin ZIPs need a root-level PHP file with a Plugin Name header.',
    nextSteps: ['Zip the plugin folder that contains the main PHP file, or use a release asset built for WordPress.'],
    confidence: 'high',
  },
  deep_php_only_non_installable: {
    title: 'Plugin header exists too deep in the package',
    summary: 'WordPress checks root-level PHP files in the extracted plugin package, not deeply nested source folders.',
    nextSteps: ['Repackage the folder that directly contains the main plugin PHP file.'],
    confidence: 'high',
  },
  github_or_source_archive_diagnostic: {
    title: 'This looks like a source archive, not a WordPress install package',
    summary: 'Source archives often contain src, build, tests, or repository metadata instead of an installable package root.',
    nextSteps: ['Use the project release ZIP or build the WordPress package before uploading.'],
    confidence: 'medium',
  },
  template_kit_or_non_theme_package: {
    title: 'This may be a template kit or non-theme package',
    summary: 'Template kits are imported through their own plugin flow, not through the WordPress theme/plugin uploader.',
    nextSteps: ['Use the vendor template-kit importer or check the package instructions.'],
    confidence: 'medium',
  },
  diagnostic_only_unknown: {
    title: 'No installable WordPress package was found',
    summary: 'The ZIP does not match the installable theme or plugin structure this tool can verify.',
    nextSteps: ['Check whether you downloaded a documentation bundle, source archive, or platform-specific package.'],
    confidence: 'low',
  },
}

const textDecoder = new TextDecoder('utf-8', { fatal: false })
const textEncoder = new TextEncoder()

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  throw new TypeError('Expected ArrayBuffer or Uint8Array input')
}

function readUint16(view, offset) {
  return view.getUint16(offset, true)
}

function readUint32(view, offset) {
  return view.getUint32(offset, true)
}

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const minOffset = Math.max(0, bytes.length - 65557)
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === ZIP_SIGNATURES.endOfCentralDirectory) {
      return offset
    }
  }
  return -1
}

function normalizeZipPath(rawName) {
  const path = rawName.replace(/\\/g, '/').replace(/^\/+/, '')
  const segments = path.split('/').filter(Boolean)

  if (!path || /^[a-z]:/i.test(path) || path.startsWith('/') || segments.includes('..')) {
    return { unsafe: true, path }
  }

  return {
    unsafe: false,
    path: segments.join('/'),
  }
}

function isIgnoredPath(path) {
  if (!path) return true
  const parts = path.split('/')
  if (parts.includes('__MACOSX')) return true
  const leaf = parts[parts.length - 1]
  if (leaf === '.DS_Store' || leaf === 'Thumbs.db') return true
  if (parts.includes('.git') || parts.includes('node_modules')) return true
  return false
}

function parseZipDirectory(input, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) }
  const bytes = toUint8Array(input)

  if (bytes.length > limits.maxZipBytes) {
    return { ok: false, code: 'too_large_or_unsafe_to_scan', entries: [], warnings: ['zip_byte_limit_exceeded'] }
  }

  const eocdOffset = findEndOfCentralDirectory(bytes)
  if (eocdOffset < 0) {
    return { ok: false, code: 'invalid_zip', entries: [], warnings: ['eocd_missing'] }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const totalEntries = readUint16(view, eocdOffset + 10)
  const centralDirectorySize = readUint32(view, eocdOffset + 12)
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16)

  if (totalEntries === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    return { ok: false, code: 'encrypted_or_unsupported', entries: [], warnings: ['zip64_not_supported'] }
  }

  if (totalEntries > limits.maxEntryCount) {
    return { ok: false, code: 'too_large_or_unsafe_to_scan', entries: [], warnings: ['entry_count_limit_exceeded'] }
  }

  if (centralDirectoryOffset + centralDirectorySize > bytes.length) {
    return { ok: false, code: 'invalid_zip', entries: [], warnings: ['central_directory_out_of_bounds'] }
  }

  const entries = []
  let offset = centralDirectoryOffset
  let totalUncompressedBytes = 0

  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > bytes.length || readUint32(view, offset) !== ZIP_SIGNATURES.centralDirectory) {
      return { ok: false, code: 'invalid_zip', entries: [], warnings: ['central_directory_entry_invalid'] }
    }

    const flags = readUint16(view, offset + 8)
    const method = readUint16(view, offset + 10)
    const compressedSize = readUint32(view, offset + 20)
    const uncompressedSize = readUint32(view, offset + 24)
    const fileNameLength = readUint16(view, offset + 28)
    const extraLength = readUint16(view, offset + 30)
    const commentLength = readUint16(view, offset + 32)
    const localHeaderOffset = readUint32(view, offset + 42)
    const nameStart = offset + 46
    const nameEnd = nameStart + fileNameLength
    const rawName = textDecoder.decode(bytes.slice(nameStart, nameEnd))
    const normalized = normalizeZipPath(rawName)

    if (normalized.unsafe) {
      return { ok: false, code: 'too_large_or_unsafe_to_scan', entries: [], warnings: ['unsafe_path'] }
    }

    if ((flags & 0x1) === 0x1) {
      return { ok: false, code: 'encrypted_or_unsupported', entries: [], warnings: ['encrypted_entry'] }
    }

    if (method !== 0 && method !== 8) {
      return { ok: false, code: 'encrypted_or_unsupported', entries: [], warnings: [`unsupported_method_${method}`] }
    }

    totalUncompressedBytes += uncompressedSize
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      return { ok: false, code: 'zip_bomb_risk', entries: [], warnings: ['uncompressed_size_limit_exceeded'] }
    }

    if (compressedSize > 0 && uncompressedSize > 1024 * 1024 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
      return { ok: false, code: 'zip_bomb_risk', entries: [], warnings: ['compression_ratio_limit_exceeded'] }
    }

    entries.push({
      path: normalized.path,
      rawName,
      isDirectory: rawName.endsWith('/'),
      ignored: isIgnoredPath(normalized.path),
      flags,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })

    offset = nameEnd + extraLength + commentLength
  }

  return {
    ok: true,
    bytes,
    entries,
    limits,
    totalUncompressedBytes,
    warnings: [],
  }
}

async function inflateStoredOrDeflated(zip, entry, options) {
  const bytes = zip.bytes
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const localOffset = entry.localHeaderOffset

  if (localOffset + 30 > bytes.length || readUint32(view, localOffset) !== ZIP_SIGNATURES.localFile) {
    throw new Error('Invalid local ZIP entry')
  }

  const localNameLength = readUint16(view, localOffset + 26)
  const localExtraLength = readUint16(view, localOffset + 28)
  const dataStart = localOffset + 30 + localNameLength + localExtraLength
  const dataEnd = dataStart + entry.compressedSize

  if (dataStart < 0 || dataEnd > bytes.length) {
    throw new Error('ZIP entry data is out of bounds')
  }

  const compressed = bytes.slice(dataStart, dataEnd)
  if (entry.method === 0) return compressed

  if (typeof options.inflateRaw !== 'function') {
    throw new Error('Deflated ZIP entry support requires inflateRaw')
  }

  return toUint8Array(await options.inflateRaw(compressed))
}

async function readEntryHeaderText(zip, entry, options) {
  if (entry.uncompressedSize > zip.limits.maxHeaderEntryBytes) {
    return { text: '', warning: 'header_entry_too_large' }
  }

  const bytes = await inflateStoredOrDeflated(zip, entry, options)
  return {
    text: textDecoder.decode(bytes.slice(0, zip.limits.headerBytes)),
    warning: null,
  }
}

function parseWordPressHeaders(text, headerNames) {
  const headers = {}
  const wanted = new Map(headerNames.map((name) => [name.toLowerCase(), name]))

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^[\s/*#@-]*([A-Za-z][A-Za-z ]{1,40})\s*:\s*(.*?)\s*(?:\*\/)?$/)
    if (!match) continue
    const normalized = match[1].trim().toLowerCase()
    if (!wanted.has(normalized)) continue
    headers[wanted.get(normalized)] = match[2].trim()
  }

  return headers
}

function relativePathForRoot(entryPath, root) {
  if (!root) return entryPath
  if (entryPath === root) return ''
  if (!entryPath.startsWith(`${root}/`)) return null
  return entryPath.slice(root.length + 1)
}

function getMeaningfulFiles(entries) {
  return entries.filter((entry) => !entry.isDirectory && !entry.ignored)
}

function getTopEntities(files) {
  const entities = new Set()
  for (const entry of files) {
    const [first] = entry.path.split('/')
    if (!entry.path.includes('/')) {
      entities.add('__root_files__')
    } else if (first) {
      entities.add(first)
    }
  }
  return [...entities]
}

function getCandidateRoots(files) {
  const roots = new Set()
  if (files.some((entry) => !entry.path.includes('/'))) {
    roots.add('')
  }
  for (const entry of files) {
    const [first] = entry.path.split('/')
    if (first && entry.path.includes('/')) roots.add(first)
  }
  return [...roots]
}

function isAsIsCandidate(root, topEntities) {
  if (!root) return true
  return topEntities.length === 1 && topEntities[0] === root
}

function hasRepositoryMarkers(files) {
  return files.some((entry) => {
    const path = entry.path.toLowerCase()
    return path.includes('/.github/') ||
      path.endsWith('/package.json') ||
      path === 'package.json' ||
      path.endsWith('/composer.json') ||
      path === 'composer.json' ||
      path.includes('/tests/') ||
      path.includes('/src/')
  })
}

function hasTemplateKitMarkers(files) {
  return files.some((entry) => {
    const path = entry.path.toLowerCase()
    return path.includes('elementor') ||
      path.includes('template-kit') ||
      path.endsWith('.json') && path.includes('templates')
  })
}

function countByKind(candidates, kind, predicate = () => true) {
  return candidates.filter((candidate) => candidate.kind === kind && predicate(candidate)).length
}

async function inspectThemeRoot(zip, files, root, options) {
  const styleEntry = files.find((entry) => relativePathForRoot(entry.path, root) === 'style.css')
  if (!styleEntry) {
    return null
  }

  const headerRead = await readEntryHeaderText(zip, styleEntry, options)
  const headers = parseWordPressHeaders(headerRead.text, ['Theme Name', 'Template'])
  const hasThemeName = Boolean(headers['Theme Name'])
  const isChildTheme = Boolean(headers.Template)
  const hasRequiredTemplate = files.some((entry) => {
    const relative = relativePathForRoot(entry.path, root)
    return relative === 'index.php' || relative === 'templates/index.html' || relative === 'block-templates/index.html'
  })

  if (!hasThemeName) {
    return {
      kind: 'theme',
      root,
      installable: false,
      code: 'style_css_missing_theme_name',
      warnings: [headerRead.warning].filter(Boolean),
    }
  }

  if (!isChildTheme && !hasRequiredTemplate) {
    return {
      kind: 'theme',
      root,
      installable: false,
      code: 'theme_missing_required_template',
      name: headers['Theme Name'],
      warnings: [headerRead.warning].filter(Boolean),
    }
  }

  return {
    kind: 'theme',
    root,
    installable: true,
    code: 'installable_theme',
    name: headers['Theme Name'],
    isChildTheme,
    warnings: [headerRead.warning].filter(Boolean),
  }
}

async function inspectPluginRoot(zip, files, root, options) {
  const rootPhpEntries = files.filter((entry) => {
    const relative = relativePathForRoot(entry.path, root)
    return relative !== null && !relative.includes('/') && /\.php$/i.test(relative)
  })

  for (const entry of rootPhpEntries) {
    const headerRead = await readEntryHeaderText(zip, entry, options)
    const headers = parseWordPressHeaders(headerRead.text, ['Plugin Name'])
    if (headers['Plugin Name']) {
      return {
        kind: 'plugin',
        root,
        installable: true,
        code: 'installable_plugin',
        name: headers['Plugin Name'],
        warnings: [headerRead.warning].filter(Boolean),
      }
    }
  }

  const nestedPhpEntries = files.filter((entry) => {
    const relative = relativePathForRoot(entry.path, root)
    return relative !== null && relative.includes('/') && /\.php$/i.test(relative)
  }).slice(0, 12)

  for (const entry of nestedPhpEntries) {
    const headerRead = await readEntryHeaderText(zip, entry, options)
    const headers = parseWordPressHeaders(headerRead.text, ['Plugin Name'])
    if (headers['Plugin Name']) {
      return {
        kind: 'plugin',
        root,
        installable: false,
        code: 'deep_php_only_non_installable',
        name: headers['Plugin Name'],
        warnings: [headerRead.warning].filter(Boolean),
      }
    }
  }

  return null
}

function candidateMatchesTarget(candidate, targetMode) {
  return targetMode === 'not_sure' || candidate.kind === targetMode
}

function makeResult(code, context = {}) {
  const copy = RESULT_COPY[code] || RESULT_COPY.diagnostic_only_unknown
  const metrics = context.metrics || {}
  const warnings = [...new Set([...(context.warnings || [])])]

  return {
    ok: !['invalid_zip', 'encrypted_or_unsupported', 'too_large_or_unsafe_to_scan', 'zip_bomb_risk'].includes(code),
    primaryCode: code,
    title: copy.title,
    summary: copy.summary,
    nextSteps: copy.nextSteps,
    confidence: context.confidence || copy.confidence,
    targetMode: context.targetMode || 'not_sure',
    detectedKind: context.detectedKind || null,
    export: context.export || { eligible: false, mode: 'none', fileName: null, bytes: null },
    candidates: context.candidates || [],
    warnings,
    metrics: {
      entryCount: metrics.entryCount || 0,
      fileCount: metrics.fileCount || 0,
      nestedZipCount: metrics.nestedZipCount || 0,
      candidateCount: metrics.candidateCount || 0,
      installableCandidateCount: metrics.installableCandidateCount || 0,
      directThemeCount: metrics.directThemeCount || 0,
      directPluginCount: metrics.directPluginCount || 0,
    },
    evidence: context.evidence || [],
  }
}

function safeSlug(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || fallback
}

async function buildRepackedZip(zip, files, candidate, options) {
  const selected = files.filter((entry) => {
    const relative = relativePathForRoot(entry.path, candidate.root)
    return relative !== null && relative.length > 0
  })
  const archiveFiles = []

  for (const entry of selected) {
    archiveFiles.push({
      path: entry.path,
      data: await inflateStoredOrDeflated(zip, entry, options),
    })
  }

  return createStoredZip(archiveFiles)
}

function exportFileNameForCandidate(candidate, suffix = '') {
  const kind = candidate.kind === 'theme' ? 'theme' : 'plugin'
  const root = safeSlug(candidate.root || candidate.name, `wordpress-${kind}`)
  return `${root}${suffix}.zip`
}

async function inspectNestedZips(zip, files, options) {
  const nestedEntries = files.filter((entry) => /\.zip$/i.test(entry.path)).slice(0, zip.limits.maxNestedZipCount)
  const nestedCandidates = []
  const warnings = []

  if (nestedEntries.length > zip.limits.maxNestedZipCount) {
    warnings.push('nested_zip_count_limit_exceeded')
  }

  if ((options.depth || 0) >= zip.limits.maxNestedDepth) {
    return { nestedCandidates, warnings }
  }

  for (const entry of nestedEntries) {
    try {
      const nestedBytes = await inflateStoredOrDeflated(zip, entry, options)
      const nestedResult = await scanArchive(nestedBytes, {
        ...options,
        targetMode: 'not_sure',
        depth: (options.depth || 0) + 1,
        parentPath: entry.path,
      })

      if (nestedResult.primaryCode === 'installable_theme' || nestedResult.primaryCode === 'installable_plugin') {
        nestedCandidates.push({
          kind: nestedResult.detectedKind,
          root: nestedResult.candidates[0]?.root || '',
          installable: true,
          code: nestedResult.primaryCode,
          source: 'nested',
          sourcePath: entry.path,
          exportMode: 'return_nested_unchanged',
          bytes: nestedBytes,
        })
      }
    } catch {
      warnings.push('nested_zip_read_failed')
    }
  }

  return { nestedCandidates, warnings }
}

async function scanArchive(input, options = {}) {
  const targetMode = normalizeTargetMode(options.targetMode)
  const zip = parseZipDirectory(input, options)
  if (!zip.ok) {
    return makeResult(zip.code, {
      targetMode,
      warnings: zip.warnings,
    })
  }

  const files = getMeaningfulFiles(zip.entries)
  const topEntities = getTopEntities(files)
  const roots = getCandidateRoots(files)
  const warnings = [...zip.warnings]
  const candidates = []

  for (const root of roots) {
    const theme = await inspectThemeRoot(zip, files, root, options)
    if (theme) {
      candidates.push({
        ...theme,
        source: 'direct',
        asIs: isAsIsCandidate(root, topEntities),
      })
    }

    const plugin = await inspectPluginRoot(zip, files, root, options)
    if (plugin) {
      candidates.push({
        ...plugin,
        source: 'direct',
        asIs: isAsIsCandidate(root, topEntities),
      })
    }
  }

  const nestedScan = await inspectNestedZips(zip, files, options)
  warnings.push(...nestedScan.warnings)
  const installableDirect = candidates.filter((candidate) => candidate.installable)
  const installableAsIs = installableDirect.filter((candidate) => candidate.asIs)
  const matchingDirect = installableDirect.filter((candidate) => candidateMatchesTarget(candidate, targetMode))
  const matchingAsIs = installableAsIs.filter((candidate) => candidateMatchesTarget(candidate, targetMode))
  const matchingWrapped = matchingDirect.filter((candidate) => !candidate.asIs)
  const matchingNested = nestedScan.nestedCandidates.filter((candidate) => candidateMatchesTarget(candidate, targetMode))
  const allCandidates = [...candidates, ...nestedScan.nestedCandidates]
  const metrics = {
    entryCount: zip.entries.length,
    fileCount: files.length,
    nestedZipCount: files.filter((entry) => /\.zip$/i.test(entry.path)).length,
    candidateCount: allCandidates.length,
    installableCandidateCount: [...installableDirect, ...nestedScan.nestedCandidates].length,
    directThemeCount: countByKind(candidates, 'theme'),
    directPluginCount: countByKind(candidates, 'plugin'),
  }
  const baseContext = {
    targetMode,
    candidates: publicCandidates(allCandidates),
    warnings,
    metrics,
  }

  if (targetMode === 'theme' && installableAsIs.some((candidate) => candidate.kind === 'plugin') && !matchingAsIs.length) {
    return makeResult('plugin_uploaded_as_theme', {
      ...baseContext,
      detectedKind: 'plugin',
      confidence: 'high',
    })
  }

  if (targetMode === 'plugin' && installableAsIs.some((candidate) => candidate.kind === 'theme') && !matchingAsIs.length) {
    return makeResult('theme_uploaded_as_plugin', {
      ...baseContext,
      detectedKind: 'theme',
      confidence: 'high',
    })
  }

  if (matchingAsIs.length === 1 && (targetMode !== 'not_sure' || installableAsIs.length === 1)) {
    const winner = matchingAsIs[0]
    return makeResult(winner.kind === 'theme' ? 'installable_theme' : 'installable_plugin', {
      ...baseContext,
      detectedKind: winner.kind,
      export: { eligible: false, mode: 'none', fileName: null, bytes: null },
      evidence: evidenceForCandidate(winner),
    })
  }

  if (matchingAsIs.length > 1 || (targetMode === 'not_sure' && installableAsIs.length > 1)) {
    return makeResult('multiple_installable_candidates', baseContext)
  }

  if (matchingWrapped.length === 1 && matchingNested.length === 0) {
    const winner = matchingWrapped[0]
    const repackedBytes = await buildRepackedZip(zip, files, winner, options)
    return makeResult('wrong_outer_bundle', {
      ...baseContext,
      detectedKind: winner.kind,
      export: {
        eligible: true,
        mode: 'repack_single_root',
        fileName: exportFileNameForCandidate(winner, '-installable'),
        bytes: repackedBytes,
      },
      evidence: evidenceForCandidate(winner),
    })
  }

  if (matchingNested.length === 1 && matchingWrapped.length === 0) {
    const winner = matchingNested[0]
    return makeResult('nested_installable_zip_found', {
      ...baseContext,
      detectedKind: winner.kind,
      export: {
        eligible: true,
        mode: 'return_nested_unchanged',
        fileName: exportFileNameForCandidate({ ...winner, root: winner.sourcePath.replace(/\.zip$/i, '') }, '-installable'),
        bytes: winner.bytes,
      },
      evidence: [`Nested archive: ${winner.sourcePath}`],
    })
  }

  if (matchingNested.length > 1 || (matchingWrapped.length + matchingNested.length) > 1) {
    return makeResult('multiple_installable_candidates', baseContext)
  }

  const invalidTheme = candidates.find((candidate) => candidate.kind === 'theme' && !candidate.installable)
  const invalidPlugin = candidates.find((candidate) => candidate.kind === 'plugin' && !candidate.installable)

  if ((targetMode === 'theme' || targetMode === 'not_sure') && invalidTheme) {
    return makeResult(invalidTheme.code, {
      ...baseContext,
      detectedKind: 'theme',
      evidence: evidenceForCandidate(invalidTheme),
    })
  }

  if ((targetMode === 'plugin' || targetMode === 'not_sure') && invalidPlugin) {
    return makeResult(invalidPlugin.code, {
      ...baseContext,
      detectedKind: 'plugin',
      evidence: evidenceForCandidate(invalidPlugin),
    })
  }

  if (targetMode === 'theme') {
    return makeResult('missing_style_css', baseContext)
  }

  if (targetMode === 'plugin') {
    return makeResult('no_valid_plugin_header', baseContext)
  }

  if (hasTemplateKitMarkers(files)) {
    return makeResult('template_kit_or_non_theme_package', baseContext)
  }

  if (hasRepositoryMarkers(files)) {
    return makeResult('github_or_source_archive_diagnostic', baseContext)
  }

  return makeResult('diagnostic_only_unknown', baseContext)
}

function evidenceForCandidate(candidate) {
  const root = candidate.root ? `Package root: ${candidate.root}` : 'Package root: ZIP root'
  const kind = candidate.kind === 'theme' ? 'Detected theme metadata' : 'Detected plugin metadata'
  const shape = candidate.asIs === false ? 'Archive has extra top-level files' : 'Archive shape is installable as-is'
  return [kind, root, shape]
}

function publicCandidates(candidates) {
  return candidates.map((candidate) => ({
    kind: candidate.kind,
    root: candidate.root || '',
    installable: Boolean(candidate.installable),
    code: candidate.code,
    source: candidate.source || 'direct',
    asIs: candidate.asIs !== false,
    exportMode: candidate.exportMode || 'none',
  }))
}

export function normalizeTargetMode(value) {
  if (value === 'theme' || value === 'plugin') return value
  return 'not_sure'
}

export async function analyzeWordPressZip(input, options = {}) {
  return scanArchive(input, {
    ...options,
    targetMode: normalizeTargetMode(options.targetMode),
    depth: options.depth || 0,
  })
}

export function buildMarkdownReport(result) {
  const lines = [
    '# WordPress ZIP Doctor report',
    '',
    `Result: ${result.title}`,
    `Code: ${result.primaryCode}`,
    `Confidence: ${result.confidence}`,
    `Selected target: ${result.targetMode}`,
    `Detected type: ${result.detectedKind || 'unknown'}`,
    '',
    '## Summary',
    result.summary,
    '',
    '## Next steps',
    ...result.nextSteps.map((step) => `- ${step}`),
    '',
    '## Package signals',
    `- Entries: ${result.metrics.entryCount}`,
    `- Files inspected: ${result.metrics.fileCount}`,
    `- Nested ZIP files: ${result.metrics.nestedZipCount}`,
    `- Candidates: ${result.metrics.candidateCount}`,
    `- Installable candidates: ${result.metrics.installableCandidateCount}`,
    '',
    '## Export',
    `- Eligible: ${result.export.eligible ? 'yes' : 'no'}`,
    `- Mode: ${result.export.mode}`,
  ]

  if (result.evidence.length) {
    lines.push('', '## Evidence', ...result.evidence.map((item) => `- ${item}`))
  }

  if (result.warnings.length) {
    lines.push('', '## Warnings', ...result.warnings.map((warning) => `- ${warning}`))
  }

  lines.push('', 'No file content is included in this report.')
  return `${lines.join('\n')}\n`
}

export function buildWordPressZipDoctorMetrics(result) {
  return {
    totalIssues: ['installable_theme', 'installable_plugin'].includes(result.primaryCode) ? 0 : 1,
    fileCount: result.metrics.fileCount,
    entryCount: result.metrics.entryCount,
    nestedZipCount: result.metrics.nestedZipCount,
    candidateCount: result.metrics.candidateCount,
    installableCandidateCount: result.metrics.installableCandidateCount,
  }
}

let crcTable = null

function getCrcTable() {
  if (crcTable) return crcTable
  crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    crcTable[n] = c >>> 0
  }
  return crcTable
}

function crc32(bytes) {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint16(target, offset, value) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
}

function writeUint32(target, offset, value) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

function normalizeArchiveFiles(files) {
  if (Array.isArray(files)) return files
  return Object.entries(files).map(([path, data]) => ({ path, data }))
}

export function createStoredZip(filesInput) {
  const files = normalizeArchiveFiles(filesInput).map((file) => ({
    path: normalizeZipPath(file.path).path,
    data: typeof file.data === 'string' ? textEncoder.encode(file.data) : toUint8Array(file.data),
  })).filter((file) => file.path && !file.path.endsWith('/'))

  const localParts = []
  const centralParts = []
  let offset = 0

  for (const file of files) {
    const nameBytes = textEncoder.encode(file.path)
    const data = file.data
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    writeUint32(local, 0, ZIP_SIGNATURES.localFile)
    writeUint16(local, 4, 20)
    writeUint16(local, 6, 0x0800)
    writeUint16(local, 8, 0)
    writeUint16(local, 10, 0)
    writeUint16(local, 12, 0)
    writeUint32(local, 14, crc)
    writeUint32(local, 18, data.length)
    writeUint32(local, 22, data.length)
    writeUint16(local, 26, nameBytes.length)
    writeUint16(local, 28, 0)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    localParts.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    writeUint32(central, 0, ZIP_SIGNATURES.centralDirectory)
    writeUint16(central, 4, 20)
    writeUint16(central, 6, 20)
    writeUint16(central, 8, 0x0800)
    writeUint16(central, 10, 0)
    writeUint16(central, 12, 0)
    writeUint16(central, 14, 0)
    writeUint32(central, 16, crc)
    writeUint32(central, 20, data.length)
    writeUint32(central, 24, data.length)
    writeUint16(central, 28, nameBytes.length)
    writeUint16(central, 30, 0)
    writeUint16(central, 32, 0)
    writeUint16(central, 34, 0)
    writeUint16(central, 36, 0)
    writeUint32(central, 38, 0)
    writeUint32(central, 42, offset)
    central.set(nameBytes, 46)
    centralParts.push(central)
    offset += local.length
  }

  const centralOffset = offset
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const eocd = new Uint8Array(22)
  writeUint32(eocd, 0, ZIP_SIGNATURES.endOfCentralDirectory)
  writeUint16(eocd, 8, files.length)
  writeUint16(eocd, 10, files.length)
  writeUint32(eocd, 12, centralSize)
  writeUint32(eocd, 16, centralOffset)
  writeUint16(eocd, 20, 0)

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

export function createSampleWordPressZip(kind = 'theme') {
  if (kind === 'plugin') {
    return createStoredZip({
      'sample-plugin/sample-plugin.php': `<?php
/**
 * Plugin Name: Sample Plugin
 */
`,
      'sample-plugin/readme.txt': 'Sample plugin package.',
    })
  }

  return createStoredZip({
    'sample-theme/style.css': `/*
Theme Name: Sample Theme
*/
`,
    'sample-theme/index.php': '<?php get_header(); get_footer();',
  })
}

export function defaultWordPressZipDoctorLimits() {
  return { ...DEFAULT_LIMITS }
}
