import {
  analyzeWordPressZip,
  buildMarkdownReport,
  createSampleWordPressZip,
} from './wordpress-zip-doctor.js'

const state = {
  fileBytes: null,
  sourceLabel: '',
  result: null,
}

const els = {
  dropZone: document.querySelector('#dropZone'),
  fileInput: document.querySelector('#fileInput'),
  fileLabel: document.querySelector('#fileLabel'),
  scanButton: document.querySelector('#scanButton'),
  resultPanel: document.querySelector('#resultPanel'),
  sampleTheme: document.querySelector('#sampleTheme'),
  samplePlugin: document.querySelector('#samplePlugin'),
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This browser does not support deflated ZIP inspection yet.')
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function getTargetMode() {
  return document.querySelector('input[name="targetMode"]:checked')?.value || 'not_sure'
}

function setFile(bytes, label) {
  state.fileBytes = bytes
  state.sourceLabel = label
  els.fileLabel.textContent = label
  els.scanButton.disabled = false
}

function downloadBytes(bytes, fileName, mimeType = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function renderResult(result) {
  const exportButton = result.export.eligible
    ? `<button id="downloadZip" class="button primary" type="button">Download installable ZIP</button>`
    : ''

  els.resultPanel.innerHTML = `
    <div class="result-header">
      <span class="result-code">${result.primaryCode}</span>
      <h2 class="result-title">${result.title}</h2>
      <p class="result-summary">${result.summary}</p>
    </div>
    <div class="metric-grid">
      <div class="metric"><span>Files</span><strong>${result.metrics.fileCount}</strong></div>
      <div class="metric"><span>Candidates</span><strong>${result.metrics.candidateCount}</strong></div>
      <div class="metric"><span>Nested ZIPs</span><strong>${result.metrics.nestedZipCount}</strong></div>
    </div>
    <ol class="next-steps">
      ${result.nextSteps.map((step) => `<li>${step}</li>`).join('')}
    </ol>
    <div class="export-row">
      ${exportButton}
      <button id="downloadReport" class="button secondary" type="button">Download report</button>
    </div>
  `

  document.querySelector('#downloadReport')?.addEventListener('click', () => {
    downloadBytes(new TextEncoder().encode(buildMarkdownReport(result)), 'wordpress-zip-doctor-report.md', 'text/markdown')
  })

  document.querySelector('#downloadZip')?.addEventListener('click', () => {
    downloadBytes(result.export.bytes, result.export.fileName || 'wordpress-installable.zip', 'application/zip')
  })
}

async function scanCurrentFile() {
  if (!state.fileBytes) return
  els.scanButton.disabled = true
  els.scanButton.textContent = 'Inspecting...'
  try {
    const result = await analyzeWordPressZip(state.fileBytes, {
      targetMode: getTargetMode(),
      inflateRaw,
    })
    state.result = result
    renderResult(result)
  } catch (error) {
    els.resultPanel.innerHTML = `<p class="empty">${error.message || 'Could not inspect this ZIP.'}</p>`
  } finally {
    els.scanButton.disabled = false
    els.scanButton.textContent = 'Inspect ZIP'
  }
}

els.dropZone.addEventListener('click', () => els.fileInput.click())
els.dropZone.addEventListener('dragenter', (event) => {
  event.preventDefault()
  els.dropZone.classList.add('dragging')
})
els.dropZone.addEventListener('dragover', (event) => {
  event.preventDefault()
  els.dropZone.classList.add('dragging')
})
els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragging'))
els.dropZone.addEventListener('drop', async (event) => {
  event.preventDefault()
  els.dropZone.classList.remove('dragging')
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  setFile(new Uint8Array(await file.arrayBuffer()), 'ZIP selected')
})

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files?.[0]
  if (!file) return
  setFile(new Uint8Array(await file.arrayBuffer()), 'ZIP selected')
})

els.sampleTheme.addEventListener('click', () => {
  setFile(createSampleWordPressZip('theme'), 'Sample theme ZIP loaded')
  scanCurrentFile()
})

els.samplePlugin.addEventListener('click', () => {
  setFile(createSampleWordPressZip('plugin'), 'Sample plugin ZIP loaded')
  scanCurrentFile()
})

els.scanButton.addEventListener('click', scanCurrentFile)
