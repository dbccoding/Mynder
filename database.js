// ===== Database Module =====

// Initialize Dexie database
const db = new Dexie('ChieDB');
db.version(1).stores({
    journals: '++id, date, title',
    tasks: '++id, createdAt, completed',
    events: '++id, dateTime, title',
    settings: 'key'
});

// In-memory data arrays
let journalEntries = [];
let tasks = [];
let events = [];
let lastJournalDate = localStorage.getItem('lastJournalDate') || '';

// Migrate data from localStorage to Dexie (one-time migration)
async function migrateFromLocalStorage() {
    const oldJournals = JSON.parse(localStorage.getItem('journalEntries') || '[]');
    const oldTasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    const oldEvents = JSON.parse(localStorage.getItem('events') || '[]');
    
    if (oldJournals.length > 0) {
        for (const journal of oldJournals) {
            const encrypted = await encryptData(journal);
            await db.journals.add(encrypted);
        }
        localStorage.removeItem('journalEntries');
    }
    
    if (oldTasks.length > 0) {
        for (const task of oldTasks) {
            const encrypted = await encryptData(task);
            await db.tasks.add(encrypted);
        }
        localStorage.removeItem('tasks');
    }
    
    if (oldEvents.length > 0) {
        for (const event of oldEvents) {
            const encrypted = await encryptData(event);
            await db.events.add(encrypted);
        }
        localStorage.removeItem('events');
    }
}

// Journal database operations
async function addJournalToDB(entry) {
    const encrypted = await encryptData(entry);
    await db.journals.add(encrypted);
}

async function loadJournalsFromDB() {
    const encryptedEntries = await db.journals.toArray();
    
    if (encryptedEntries.length === 0) {
        journalEntries = [];
        return [];
    }
    
    journalEntries = [];
    for (const encrypted of encryptedEntries) {
        try {
            const decrypted = await decryptData(encrypted);
            journalEntries.push(decrypted);
        } catch (e) {
            console.error('Failed to decrypt entry:', e);
        }
    }
    
    // Sort by date (newest first)
    journalEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
    return journalEntries;
}

async function deleteJournalFromDB(id) {
    const encryptedEntries = await db.journals.toArray();
    for (const encrypted of encryptedEntries) {
        const decrypted = await decryptData(encrypted);
        if (decrypted.id === id) {
            await db.journals.delete(encrypted.id);
            break;
        }
    }
}

// Task database operations
async function addTaskToDB(task) {
    const encrypted = await encryptData(task);
    await db.tasks.add(encrypted);
}

async function loadTasksFromDB() {
    const encryptedTasks = await db.tasks.toArray();
    
    if (encryptedTasks.length === 0) {
        tasks = [];
        return [];
    }
    
    tasks = [];
    for (const encrypted of encryptedTasks) {
        try {
            const decrypted = await decryptData(encrypted);
            tasks.push(decrypted);
        } catch (e) {
            console.error('Failed to decrypt task:', e);
        }
    }
    
    return tasks;
}

async function updateTaskInDB(id, updatedTask) {
    const encryptedTasks = await db.tasks.toArray();
    
    for (const encrypted of encryptedTasks) {
        const decrypted = await decryptData(encrypted);
        if (decrypted.id === id) {
            const newEncrypted = await encryptData(updatedTask);
            await db.tasks.update(encrypted.id, newEncrypted);
            break;
        }
    }
}

async function deleteTaskFromDB(id) {
    const encryptedTasks = await db.tasks.toArray();
    for (const encrypted of encryptedTasks) {
        const decrypted = await decryptData(encrypted);
        if (decrypted.id === id) {
            await db.tasks.delete(encrypted.id);
            break;
        }
    }
}

// Event database operations
async function addEventToDB(event) {
    const encrypted = await encryptData(event);
    await db.events.add(encrypted);
}

async function loadEventsFromDB() {
    const encryptedEvents = await db.events.toArray();
    
    if (encryptedEvents.length === 0) {
        events = [];
        return [];
    }
    
    events = [];
    for (const encrypted of encryptedEvents) {
        try {
            const decrypted = await decryptData(encrypted);
            events.push(decrypted);
        } catch (e) {
            console.error('Failed to decrypt event:', e);
        }
    }
    
    // Sort by date
    events.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
    return events;
}

async function deleteEventFromDB(id) {
    const encryptedEvents = await db.events.toArray();
    for (const encrypted of encryptedEvents) {
        const decrypted = await decryptData(encrypted);
        if (decrypted.id === id) {
            await db.events.delete(encrypted.id);
            break;
        }
    }
}
