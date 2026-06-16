import {
  analyzeWordPressZip,
  buildMarkdownReport,
  createWordPressZipDoctorDemo,
  listWordPressZipDoctorDemos,
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
  demoGrid: document.querySelector('#demoGrid'),
  validDemoGrid: document.querySelector('#validDemoGrid'),
}

const problemDemos = listWordPressZipDoctorDemos().filter((demo) => demo.resultCode !== 'installable_theme' && demo.resultCode !== 'installable_plugin')
const validDemos = [
  { id: 'installable-theme', label: 'Valid theme' },
  { id: 'installable-plugin', label: 'Valid plugin' },
]

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

function setTargetMode(value) {
  const input = document.querySelector(`input[name="targetMode"][value="${value}"]`)
  if (input) input.checked = true
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function artifactLabel(result) {
  if (result.export.eligible) return 'Download upload-ready ZIP'
  if (result.artifactKind === 'none_needed') return 'No new ZIP needed'
  return 'Diagnostic report'
}

function renderResult(result) {
  const exportButton = result.export.eligible
    ? `<button id="downloadZip" class="button primary" type="button">Download installable ZIP</button>`
    : ''
  const decisionCards = [
    ['WordPress expected', result.wordpressExpected],
    ['Found in this ZIP', result.foundSummary],
    ['Artifact', artifactLabel(result)],
    ['Safe export', result.safeToExport ? 'Available' : 'Not automatic'],
  ]
  const technicalCards = [
    ['Files inspected', result.metrics.fileCount],
    ['Candidates', result.metrics.candidateCount],
    ['Nested ZIPs', result.metrics.nestedZipCount],
    ['Result code', result.primaryCode],
  ]

  els.resultPanel.innerHTML = `
    <div class="result-header">
      <span class="result-code">${escapeHtml(result.verdictKind)}</span>
      <h2 class="result-title">${escapeHtml(result.title)}</h2>
      <p class="result-summary">${escapeHtml(result.summary)}</p>
    </div>
    <div class="decision-grid">
      ${decisionCards.map(([label, value]) => `
        <div class="decision-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `).join('')}
    </div>
    <div class="next-action">
      <span>Do this next</span>
      <strong>${escapeHtml(result.userAction)}</strong>
    </div>
    <ol class="next-steps">
      ${result.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
    </ol>
    <div class="export-row">
      ${exportButton}
      <button id="downloadReport" class="button secondary" type="button">Download report</button>
    </div>
    <details class="technical-details">
      <summary>Package signals</summary>
      <div class="metric-grid">
        ${technicalCards.map(([label, value]) => `
          <div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
        `).join('')}
      </div>
    </details>
  `

  document.querySelector('#downloadReport')?.addEventListener('click', () => {
    downloadBytes(new TextEncoder().encode(buildMarkdownReport(result)), 'wordpress-zip-doctor-report.md', 'text/markdown')
  })

  document.querySelector('#downloadZip')?.addEventListener('click', () => {
    downloadBytes(result.export.bytes, result.export.fileName || 'wordpress-installable.zip', 'application/zip')
  })
}

function renderDemoButtons() {
  els.demoGrid.innerHTML = problemDemos.map((demo) => `
    <button class="demo-button" type="button" data-demo="${escapeHtml(demo.id)}">
      <span>${escapeHtml(demo.label)}</span>
      <small>${escapeHtml(demo.copy)}</small>
    </button>
  `).join('')

  els.validDemoGrid.innerHTML = validDemos.map((demo) => `
    <button class="button secondary" type="button" data-demo="${escapeHtml(demo.id)}">${escapeHtml(demo.label)}</button>
  `).join('')
}

function loadDemo(id) {
  const demo = createWordPressZipDoctorDemo(id)
  setTargetMode(demo.targetMode)
  setFile(demo.bytes, `${demo.shortLabel || demo.label} demo loaded`)
  scanCurrentFile()
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

els.demoGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-demo]')
  if (!button) return
  loadDemo(button.dataset.demo)
})

els.validDemoGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-demo]')
  if (!button) return
  loadDemo(button.dataset.demo)
})

els.scanButton.addEventListener('click', scanCurrentFile)
renderDemoButtons()
