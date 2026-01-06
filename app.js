// ===== Main App Initialization & Coordination =====

// Lock the app
function lockApp() {
    clearKeys();
    
    document.querySelector('.container').style.display = 'none';
    document.getElementById('lock-screen').style.display = 'flex';
    
    // Hide ALL onboarding screens
    document.getElementById('onboarding-welcome').style.display = 'none';
    document.getElementById('onboarding-password').style.display = 'none';
    document.getElementById('onboarding-recovery').style.display = 'none';
    document.getElementById('onboarding-confirm').style.display = 'none';
    
    // Show only the unlock password screen
    document.getElementById('unlock-password').style.display = 'block';
    document.getElementById('unlock-recovery').style.display = 'none';
    
    // Clear any input fields
    document.getElementById('unlock-password-input').value = '';
    document.getElementById('unlock-error').textContent = '';
    document.getElementById('recovery-key-input').value = '';
    document.getElementById('recovery-unlock-error').textContent = '';
    
    // Clear in-memory data
    journalEntries = [];
    tasks = [];
    events = [];
}

// ===== Onboarding Flow Handlers =====

// Start onboarding
document.getElementById('start-onboarding-btn').addEventListener('click', () => {
    document.getElementById('onboarding-welcome').style.display = 'none';
    document.getElementById('onboarding-password').style.display = 'block';
});

// Password step - Next button
document.getElementById('password-next-btn').addEventListener('click', () => {
    const password = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;
    
    if (!password || password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    if (password !== confirm) {
        alert('Passwords do not match');
        return;
    }
    
    // Store password temporarily
    tempPassword = password;
    
    // Generate recovery key
    tempRecoveryKey = generateRecoveryKey();
    document.getElementById('recovery-key-display').textContent = tempRecoveryKey;
    
    // Show recovery key screen
    document.getElementById('onboarding-password').style.display = 'none';
    document.getElementById('onboarding-recovery').style.display = 'block';
});

// Copy recovery key
document.getElementById('copy-recovery-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(tempRecoveryKey).then(() => {
        const btn = document.getElementById('copy-recovery-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = originalText, 2000);
    }).catch(err => {
        alert('Failed to copy. Please copy manually.');
    });
});

// Download recovery key
document.getElementById('download-recovery-btn').addEventListener('click', () => {
    const text = `Chie Recovery Key\n\nIMPORTANT: Keep this key safe and secure!\n\nYour Recovery Key:\n${tempRecoveryKey}\n\nDate: ${new Date().toLocaleString()}\n\nIf you forget your password, you can use this recovery key to regain access to your encrypted journal data.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chie-recovery-key.txt';
    a.click();
    URL.revokeObjectURL(url);
});

// Recovery key - Next button
document.getElementById('recovery-next-btn').addEventListener('click', () => {
    document.getElementById('onboarding-recovery').style.display = 'none';
    document.getElementById('onboarding-confirm').style.display = 'block';
});

// Back to recovery key
document.getElementById('back-to-recovery-btn').addEventListener('click', () => {
    document.getElementById('onboarding-confirm').style.display = 'none';
    document.getElementById('onboarding-recovery').style.display = 'block';
    document.getElementById('confirm-recovery-input').value = '';
});

// Confirm recovery key and finish setup
document.getElementById('confirm-recovery-btn').addEventListener('click', async () => {
    const confirmedKey = document.getElementById('confirm-recovery-input').value.trim().toLowerCase();
    
    if (confirmedKey !== tempRecoveryKey.toLowerCase()) {
        alert('Recovery key does not match. Please check and try again.');
        return;
    }
    
    // Setup is complete - save everything
    const masterKey = await setupPassword(tempPassword);
    await setupRecoveryKey(tempRecoveryKey, masterKey);
    
    // Migrate existing localStorage data if any
    await migrateFromLocalStorage();
    
    // Clear temp variables
    tempPassword = null;
    tempRecoveryKey = null;
    
    // Hide lock screen and show app
    document.getElementById('lock-screen').style.display = 'none';
    document.querySelector('.container').style.display = 'block';
    await initApp();
});

// ===== Unlock UI Handlers =====

// Unlock with password
document.getElementById('unlock-btn').addEventListener('click', async () => {
    const password = document.getElementById('unlock-password-input').value;
    const errorEl = document.getElementById('unlock-error');
    
    if (!password) {
        errorEl.textContent = 'Please enter your password';
        return;
    }
    
    const success = await unlockWithPassword(password);
    
    if (success) {
        errorEl.textContent = '';
        document.getElementById('lock-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        await initApp();
    } else {
        errorEl.textContent = 'Incorrect password. Please try again.';
        document.getElementById('unlock-password-input').value = '';
    }
});

document.getElementById('unlock-password-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('unlock-btn').click();
    }
});

// Show recovery option
document.getElementById('show-recovery-option-btn').addEventListener('click', () => {
    document.getElementById('unlock-password').style.display = 'none';
    document.getElementById('unlock-recovery').style.display = 'block';
});

// Back to password
document.getElementById('back-to-password-btn').addEventListener('click', () => {
    document.getElementById('unlock-recovery').style.display = 'none';
    document.getElementById('unlock-password').style.display = 'block';
    document.getElementById('recovery-key-input').value = '';
    document.getElementById('recovery-unlock-error').textContent = '';
});

// Unlock with recovery key
document.getElementById('unlock-recovery-btn').addEventListener('click', async () => {
    const recoveryKey = document.getElementById('recovery-key-input').value;
    const errorEl = document.getElementById('recovery-unlock-error');
    
    if (!recoveryKey) {
        errorEl.textContent = 'Please enter your recovery key';
        return;
    }
    
    const success = await unlockWithRecoveryKey(recoveryKey);
    
    if (success) {
        errorEl.textContent = '';
        document.getElementById('lock-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        await initApp();
    } else {
        errorEl.textContent = 'Invalid recovery key. Please check and try again.';
    }
});

// Lock app button
document.getElementById('lock-app-btn').addEventListener('click', () => {
    if (confirm('Lock the app? You\'ll need your password to unlock it.')) {
        lockApp();
    }
});

// Check password setup on load
async function checkPasswordSetup() {
    const hasPassword = await isPasswordSet();
    
    if (hasPassword) {
        // Returning user - show unlock screen
        document.getElementById('onboarding-welcome').style.display = 'none';
        document.getElementById('onboarding-password').style.display = 'none';
        document.getElementById('onboarding-recovery').style.display = 'none';
        document.getElementById('onboarding-confirm').style.display = 'none';
        document.getElementById('unlock-password').style.display = 'block';
        document.getElementById('unlock-recovery').style.display = 'none';
    } else {
        // New user - show welcome screen
        document.getElementById('onboarding-welcome').style.display = 'block';
        document.getElementById('onboarding-password').style.display = 'none';
        document.getElementById('onboarding-recovery').style.display = 'none';
        document.getElementById('onboarding-confirm').style.display = 'none';
        document.getElementById('unlock-password').style.display = 'none';
        document.getElementById('unlock-recovery').style.display = 'none';
    }
}

// ===== Tab Switching =====

document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.getAttribute('data-tab');
        
        // Remove active class from all tabs and contents
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        button.classList.add('active');
        document.getElementById(tabName).classList.add('active');
    });
});

// ===== Calendar Navigation & Controls =====

document.getElementById('prev-month').addEventListener('click', () => {
    currentCalendarMonth--;
    if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    }
    renderMiniCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
    currentCalendarMonth++;
    if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
    }
    renderMiniCalendar();
});

document.getElementById('calendar-toggle').addEventListener('click', () => {
    const calendar = document.querySelector('.mini-calendar');
    const isCollapsed = calendar.classList.toggle('collapsed');
    localStorage.setItem('calendarCollapsed', isCollapsed);
});

function restoreCalendarState() {
    const isCollapsed = localStorage.getItem('calendarCollapsed') === 'true';
    if (isCollapsed) {
        document.querySelector('.mini-calendar').classList.add('collapsed');
    }
}

// ===== Event Listeners for User Actions =====

document.getElementById('add-journal-btn').addEventListener('click', addJournalEntry);
document.getElementById('add-task-btn').addEventListener('click', addTask);
document.getElementById('task-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTask();
    }
});
document.getElementById('add-event-btn').addEventListener('click', addEvent);

// ===== Mood Ring Toggle =====

document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('mood-ring-toggle');
    if (toggle) {
        // Load saved preference
        const enabled = localStorage.getItem('moodRingEnabled') !== 'false';
        toggle.checked = enabled;
        
        toggle.addEventListener('change', (e) => {
            localStorage.setItem('moodRingEnabled', e.target.checked);
            const container = document.querySelector('.container');
            
            if (e.target.checked) {
                // Re-apply mood background
                const sentiment = getMostRecentSentiment();
                if (sentiment) {
                    applyMoodBackground(sentiment);
                } else if (container) {
                    container.style.backgroundColor = '#F5F7FA';
                }
            } else {
                // Reset to white
                document.documentElement.style.setProperty('--mood-bg-color', '#ffffff');
                if (container) {
                    container.style.backgroundColor = '#ffffff';
                }
            }
        });
    }
});

// ===== App Initialization =====

async function initApp() {
    renderMiniCalendar();
    restoreCalendarState();
    await renderJournalEntries();
    await renderTasks();
    await renderEvents();
    
    // Apply mood background from most recent entry
    const recentSentiment = getMostRecentSentiment();
    if (recentSentiment) {
        applyMoodBackground(recentSentiment);
    }
    
    // Show welcome message based on last access
    const lastAccess = localStorage.getItem('lastAccess');
    const now = new Date();
    
    if (lastAccess) {
        const lastAccessDate = new Date(lastAccess);
        const daysSinceLastAccess = Math.floor((now - lastAccessDate) / (1000 * 60 * 60 * 24));
        const welcomeMsg = getWelcomeMessage(daysSinceLastAccess);
        setTimeout(() => showWelcomeBanner(welcomeMsg), 500);
    } else {
        // First time ever accessing the app
        setTimeout(() => showWelcomeBanner("Welcome to Chie. This is your space."), 500);
    }
    
    // Update last access time
    localStorage.setItem('lastAccess', now.toISOString());
    
    // Check for reminders on load
    setTimeout(() => {
        checkJournalReminder();
        checkEventReminders();
    }, 1000);
    
    // Check event reminders more frequently (every minute) to catch event times
    setInterval(() => {
        checkEventReminders();
    }, 60 * 1000);
    
    // Check journal reminders less frequently (every 30 minutes)
    setInterval(() => {
        checkJournalReminder();
    }, 30 * 60 * 1000);
    
    // Request notification permission
    requestNotificationPermission();
}

// ===== Run on Page Load =====

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkPasswordSetup);
} else {
    checkPasswordSetup();
}
