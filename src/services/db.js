import { openDB } from 'idb'

const DB_NAME = 'ExpenseTrackerDB'
const DB_VERSION = 6

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v2: wipe expenses so sample data re-seeds with correct year
        if (oldVersion < 2 && db.objectStoreNames.contains('expenses')) {
          db.deleteObjectStore('expenses')
        }
        if (!db.objectStoreNames.contains('expenses')) {
          const expenseStore = db.createObjectStore('expenses', {
            keyPath: 'id',
            autoIncrement: true,
          })
          expenseStore.createIndex('date', 'date')
          expenseStore.createIndex('category', 'category')
          expenseStore.createIndex('month', 'month')
        }

        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', {
            keyPath: 'id',
            autoIncrement: true,
          })
        }

        if (!db.objectStoreNames.contains('budgets')) {
          db.createObjectStore('budgets', { keyPath: 'id' })
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' })
        }

        // v4: SMS feature removed — drop its store if it exists
        if (oldVersion < 4 && db.objectStoreNames.contains('smsTransactions')) {
          db.deleteObjectStore('smsTransactions')
        }

        // v4: income entries (salary, freelance…)
        if (!db.objectStoreNames.contains('income')) {
          const s = db.createObjectStore('income', { keyPath: 'id', autoIncrement: true })
          s.createIndex('date', 'date')
        }

        // v4: investments (SIP, MF, FD, gold…) — money moved, not spent
        if (!db.objectStoreNames.contains('investments')) {
          const s = db.createObjectStore('investments', { keyPath: 'id', autoIncrement: true })
          s.createIndex('date', 'date')
        }

        // v4: udhaar (lend/borrow) transactions per person
        if (!db.objectStoreNames.contains('udhaar')) {
          const s = db.createObjectStore('udhaar', { keyPath: 'id', autoIncrement: true })
          s.createIndex('person', 'person')
          s.createIndex('status', 'status')
        }

        // v5: investment portfolio holdings (stocks + mutual funds)
        if (!db.objectStoreNames.contains('holdings')) {
          db.createObjectStore('holdings', { keyPath: 'id', autoIncrement: true })
        }

        // v6: manual net-worth assets (bank, cash, gold, FD, other, loan)
        if (!db.objectStoreNames.contains('assets')) {
          db.createObjectStore('assets', { keyPath: 'id', autoIncrement: true })
        }

        // v6: daily net-worth snapshots — one row per calendar day, keyed by date
        if (!db.objectStoreNames.contains('networth_snaps')) {
          db.createObjectStore('networth_snaps', { keyPath: 'date' })
        }
      },
    })
  }
  return dbPromise
}

// Expenses
export async function getAllExpenses() {
  const db = await getDB()
  return db.getAll('expenses')
}

export async function addExpense(expense) {
  const db = await getDB()
  const now = new Date(expense.date || new Date())
  const record = {
    ...expense,
    date: now.toISOString().split('T')[0],
    // month may be pre-computed by the caller (financial month); fallback: calendar
    month: expense.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    createdAt: Date.now(),
  }
  const id = await db.add('expenses', record)
  return { ...record, id }
}

export async function updateExpense(expense) {
  const db = await getDB()
  const now = new Date(expense.date)
  const record = {
    ...expense,
    month: expense.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    updatedAt: Date.now(),
  }
  await db.put('expenses', record)
  return record
}

export async function deleteExpense(id) {
  const db = await getDB()
  await db.delete('expenses', id)
}

// Categories
export async function getAllCategories() {
  const db = await getDB()
  return db.getAll('categories')
}

export async function addCategory(category) {
  const db = await getDB()
  const id = await db.add('categories', { ...category, createdAt: Date.now() })
  return { ...category, id }
}

export async function updateCategory(category) {
  const db = await getDB()
  await db.put('categories', category)
  return category
}

export async function deleteCategory(id) {
  const db = await getDB()
  await db.delete('categories', id)
}

export async function seedCategories(categories) {
  const db = await getDB()
  const existing = await db.getAll('categories')
  if (existing.length === 0) {
    const tx = db.transaction('categories', 'readwrite')
    for (const cat of categories) {
      await tx.store.add(cat)
    }
    await tx.done
  }
}

// Budgets
export async function getBudget(id) {
  const db = await getDB()
  return db.get('budgets', id)
}

export async function setBudget(budget) {
  const db = await getDB()
  await db.put('budgets', budget)
  return budget
}

export async function getAllBudgets() {
  const db = await getDB()
  return db.getAll('budgets')
}

// Settings
export async function getSetting(key) {
  const db = await getDB()
  const record = await db.get('settings', key)
  return record ? record.value : null
}

export async function setSetting(key, value) {
  const db = await getDB()
  await db.put('settings', { key, value })
}

// Income
export async function getAllIncome() {
  const db = await getDB()
  return db.getAll('income')
}

export async function addIncome(entry) {
  const db = await getDB()
  const record = { ...entry, createdAt: Date.now() }
  const id = await db.add('income', record)
  return { ...record, id }
}

export async function deleteIncome(id) {
  const db = await getDB()
  await db.delete('income', id)
}

// Investments
export async function getAllInvestments() {
  const db = await getDB()
  return db.getAll('investments')
}

export async function addInvestment(entry) {
  const db = await getDB()
  const record = { ...entry, createdAt: Date.now() }
  const id = await db.add('investments', record)
  return { ...record, id }
}

export async function deleteInvestment(id) {
  const db = await getDB()
  await db.delete('investments', id)
}

// Udhaar (lend/borrow)
export async function getAllUdhaar() {
  const db = await getDB()
  return db.getAll('udhaar')
}

export async function addUdhaar(entry) {
  const db = await getDB()
  const record = { ...entry, createdAt: Date.now() }
  const id = await db.add('udhaar', record)
  return { ...record, id }
}

export async function updateUdhaar(record) {
  const db = await getDB()
  await db.put('udhaar', record)
  return record
}

export async function deleteUdhaar(id) {
  const db = await getDB()
  await db.delete('udhaar', id)
}

// Portfolio holdings
export async function getAllHoldings() {
  const db = await getDB()
  return db.getAll('holdings')
}

export async function addHolding(entry) {
  const db = await getDB()
  const record = { ...entry, createdAt: Date.now() }
  const id = await db.add('holdings', record)
  return { ...record, id }
}

export async function updateHolding(record) {
  const db = await getDB()
  await db.put('holdings', record)
  return record
}

export async function deleteHolding(id) {
  const db = await getDB()
  await db.delete('holdings', id)
}

// Net-worth assets (manual entries: bank, cash, gold, FD, other, loan)
export async function getAllAssets() {
  const db = await getDB()
  return db.getAll('assets')
}

export async function addAsset(entry) {
  const db = await getDB()
  const record = { ...entry, updatedAt: Date.now() }
  const id = await db.add('assets', record)
  return { ...record, id }
}

export async function updateAsset(record) {
  const db = await getDB()
  const merged = { ...record, updatedAt: Date.now() }
  await db.put('assets', merged)
  return merged
}

export async function deleteAsset(id) {
  const db = await getDB()
  await db.delete('assets', id)
}

// Net-worth snapshots (one per calendar day, keyed by date)
export async function getAllNetWorthSnaps() {
  const db = await getDB()
  return db.getAll('networth_snaps')
}

export async function putNetWorthSnap(snap) {
  const db = await getDB()
  await db.put('networth_snaps', snap)
  return snap
}

// Clear all data
export async function clearAllData() {
  const db = await getDB()
  const stores = ['expenses', 'budgets', 'income', 'investments', 'udhaar', 'holdings', 'assets', 'networth_snaps']
  const tx = db.transaction(stores, 'readwrite')
  for (const s of stores) await tx.objectStore(s).clear()
  await tx.done
}

// Remove only demo-tagged records (the "Try with sample data" set). The user's
// own entries never carry a `demo` flag, so they're always preserved.
export async function clearDemoData() {
  const db = await getDB()
  const stores = ['expenses', 'budgets', 'udhaar', 'holdings', 'assets', 'networth_snaps']
  const tx = db.transaction(stores, 'readwrite')
  for (const s of stores) {
    let cursor = await tx.objectStore(s).openCursor()
    while (cursor) {
      if (cursor.value?.demo) await cursor.delete()
      cursor = await cursor.continue()
    }
  }
  await tx.done
}

// Bulk import
export async function importExpenses(expenses) {
  const db = await getDB()
  const tx = db.transaction('expenses', 'readwrite')
  for (const exp of expenses) {
    await tx.store.add(exp)
  }
  await tx.done
}

export async function importRecords(store, records) {
  if (!records?.length) return
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  for (const r of records) {
    const { id, ...rest } = r
    await tx.store.add(rest)
  }
  await tx.done
}
