import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export async function exportToJSON(expenses, categories, budgets, extra = {}) {
  const data = {
    version: 3,
    exportedAt: new Date().toISOString(),
    expenses,
    categories,
    budgets,
    income: extra.income || [],
    investments: extra.investments || [],
    udhaar: extra.udhaar || [],
    holdings: extra.holdings || [],
    assets: extra.assets || [],
    netWorthSnaps: extra.netWorthSnaps || [],
  }
  await saveFile(JSON.stringify(data, null, 2), `expenses-backup-${formatDateForFile()}.json`, 'application/json')
}

export async function exportToCSV(expenses, categories) {
  const catMap = {}
  categories.forEach(c => { catMap[c.id] = c.name })

  const headers = ['Date', 'Category', 'Amount', 'Description', 'Payment Type']
  const rows = expenses
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(e => [
      e.date,
      catMap[e.categoryId] || e.category || '',
      e.amount,
      e.description || '',
      e.paymentType || 'Cash',
    ])

  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  await saveFile(csv, `expenses-${formatDateForFile()}.csv`, 'text/csv')
}

export async function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        resolve(data)
      } catch {
        reject(new Error('Invalid file format. Please upload a valid JSON backup.'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

// Save a text file. On Android/iOS: write to storage + open the share sheet
// (save to Files/Drive/WhatsApp). On web: trigger a normal browser download.
async function saveFile(content, filename, mime) {
  if (Capacitor.isNativePlatform()) {
    const res = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    await Share.share({
      title: filename,
      text: 'Expense Tracker backup',
      url: res.uri,
      dialogTitle: 'Save or share your backup',
    })
    return
  }
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatDateForFile() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
