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
    // Check if migration already done
    if (localStorage.getItem('migrationCompleted') === 'true') {
        return;
    }
    
    // Check if database already has data (prevents re-migration)
    const existingJournals = await db.journals.count();
    if (existingJournals > 0) {
        localStorage.setItem('migrationCompleted', 'true');
        localStorage.removeItem('journalEntries');
        localStorage.removeItem('tasks');
        localStorage.removeItem('events');
        return;
    }
    
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
    
    localStorage.setItem('migrationCompleted', 'true');
}

// Journal database operations
async function addJournalToDB(entry) {
    // Check if entry with this ID already exists
    const existing = await db.journals.where('id').equals(entry.id).first();
    if (existing) {
        console.warn('Journal entry with ID', entry.id, 'already exists, skipping');
        return;
    }
    
    const encrypted = await encryptData(entry);
    await db.journals.add(encrypted);
}

async function loadJournalsFromDB() {
    const encryptedEntries = await db.journals.toArray();
    
    if (encryptedEntries.length === 0) {
        journalEntries = [];
        return [];
    }
    
    // Build a map of unique entries by their actual content ID
    const uniqueEntries = new Map();
    const idsToDelete = [];
    
    for (const encrypted of encryptedEntries) {
        try {
            const decrypted = await decryptData(encrypted);
            
            // If we've seen this content ID before, mark this DB entry for deletion
            if (uniqueEntries.has(decrypted.id)) {
                idsToDelete.push(encrypted.id); // Delete by DB auto-increment id
            } else {
                uniqueEntries.set(decrypted.id, { decrypted, dbId: encrypted.id });
            }
        } catch (e) {
            console.error('Failed to decrypt entry:', e);
        }
    }
    
    // Delete all duplicate DB entries
    if (idsToDelete.length > 0) {
        console.log('Removing', idsToDelete.length, 'duplicate entries');
        await db.journals.bulkDelete(idsToDelete);
    }
    
    // Build the in-memory array from unique entries only
    journalEntries = Array.from(uniqueEntries.values()).map(item => item.decrypted);
    
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

// Export all user data as JSON
async function exportAllData() {
    try {
        // Ensure all data is loaded and decrypted
        await loadJournalsFromDB();
        await loadTasksFromDB();
        await loadEventsFromDB();
        
        // Bundle all data together
        const exportData = {
            exportDate: new Date().toISOString(),
            appVersion: "Chie 1.0",
            journals: journalEntries,
            tasks: tasks,
            events: events
        };
        
        // Convert to JSON string
        const dataStr = JSON.stringify(exportData, null, 2);
        
        // Create a Blob (Binary Large Object) of the data
        const blob = new Blob([dataStr], { type: "application/json" });
        
        // Create a temporary download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        
        link.href = url;
        link.download = `Chie_Backup_${new Date().toISOString().split('T')[0]}.json`;
        
        // Trigger download and cleanup
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log("Export successful");
        alert("Data exported successfully!");
    } catch (err) {
        console.error("Export failed:", err);
        alert("Could not export data. Check console for details.");
    }
}
