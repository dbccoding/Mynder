// ===== Encryption & Security Module =====

// Encryption key (stored in memory only)
let encryptionKey = null;
let tempRecoveryKey = null; // Temporary storage during onboarding
let tempPassword = null; // Temporary storage during onboarding

// Generate a random recovery key (24 words/phrases for better UX)
function generateRecoveryKey() {
    const words = [
        'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
        'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
        'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray',
        'yankee', 'zulu', 'azure', 'bronze', 'copper', 'diamond', 'emerald', 'frost',
        'golden', 'harbor', 'ivory', 'jade', 'knight', 'lunar', 'marble', 'nebula',
        'ocean', 'pearl', 'quartz', 'ruby', 'silver', 'tiger', 'ultra', 'velvet'
    ];
    
    const keyWords = [];
    const randomBytes = crypto.getRandomValues(new Uint8Array(12));
    
    for (let i = 0; i < 12; i++) {
        const index = randomBytes[i] % words.length;
        keyWords.push(words[index]);
    }
    
    return keyWords.join('-');
}

// Derive encryption key from password using PBKDF2
async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );
    
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// Encrypt data
async function encryptData(data) {
    if (!encryptionKey) throw new Error('No encryption key');
    
    const encoder = new TextEncoder();
    const dataString = JSON.stringify(data);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        encryptionKey,
        encoder.encode(dataString)
    );
    
    // Combine iv and encrypted data
    return {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted))
    };
}

// Decrypt data
async function decryptData(encryptedObj) {
    if (!encryptionKey) throw new Error('No encryption key');
    
    const iv = new Uint8Array(encryptedObj.iv);
    const data = new Uint8Array(encryptedObj.data);
    
    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            encryptionKey,
            data
        );
        
        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(decrypted));
    } catch (e) {
        throw new Error('Decryption failed - wrong password?');
    }
}

// Check if password is already set
async function isPasswordSet() {
    const setting = await db.settings.get('passwordData');
    return !!setting;
}

// Set up new password
async function setupPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const masterKey = crypto.getRandomValues(new Uint8Array(32)); // Generate master key
    
    // Derive key from password
    const passwordKey = await deriveKey(password, salt);
    
    // Encrypt master key with password
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedMasterKey = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        passwordKey,
        masterKey
    );
    
    // Hash password for verification
    const passwordHash = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(password)
    );
    
    await db.settings.put({
        key: 'passwordData',
        passwordHash: Array.from(new Uint8Array(passwordHash)),
        salt: Array.from(salt),
        iv: Array.from(iv),
        encryptedMasterKey: Array.from(new Uint8Array(encryptedMasterKey))
    });
    
    // Import master key for use
    encryptionKey = await crypto.subtle.importKey(
        'raw',
        masterKey,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt']
    );
    
    return masterKey; // Return for recovery key encryption
}

// Set up recovery key
async function setupRecoveryKey(recoveryKey, masterKey) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    // Derive key from recovery key
    const recoveryDerivedKey = await deriveKey(recoveryKey, salt);
    
    // Encrypt master key with recovery key
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedMasterKey = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        recoveryDerivedKey,
        masterKey
    );
    
    await db.settings.put({
        key: 'recoveryData',
        salt: Array.from(salt),
        iv: Array.from(iv),
        encryptedMasterKey: Array.from(new Uint8Array(encryptedMasterKey))
    });
}

// Verify and unlock with password
async function unlockWithPassword(password) {
    const setting = await db.settings.get('passwordData');
    if (!setting) return false;
    
    const passwordHash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(password)
    );
    
    const hashArray = Array.from(new Uint8Array(passwordHash));
    const storedHash = setting.passwordHash;
    
    // Compare hashes
    if (hashArray.length !== storedHash.length) return false;
    for (let i = 0; i < hashArray.length; i++) {
        if (hashArray[i] !== storedHash[i]) return false;
    }
    
    // Derive key from password
    const salt = new Uint8Array(setting.salt);
    const passwordKey = await deriveKey(password, salt);
    
    // Decrypt master key
    try {
        const iv = new Uint8Array(setting.iv);
        const encryptedMasterKey = new Uint8Array(setting.encryptedMasterKey);
        
        const masterKey = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            passwordKey,
            encryptedMasterKey
        );
        
        // Import master key
        encryptionKey = await crypto.subtle.importKey(
            'raw',
            masterKey,
            { name: 'AES-GCM' },
            true,
            ['encrypt', 'decrypt']
        );
        
        return true;
    } catch (e) {
        return false;
    }
}

// Unlock with recovery key
async function unlockWithRecoveryKey(recoveryKey) {
    const setting = await db.settings.get('recoveryData');
    if (!setting) return false;
    
    try {
        // Derive key from recovery key
        const salt = new Uint8Array(setting.salt);
        const recoveryDerivedKey = await deriveKey(recoveryKey.trim().toLowerCase(), salt);
        
        // Decrypt master key
        const iv = new Uint8Array(setting.iv);
        const encryptedMasterKey = new Uint8Array(setting.encryptedMasterKey);
        
        const masterKey = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            recoveryDerivedKey,
            encryptedMasterKey
        );
        
        // Import master key
        encryptionKey = await crypto.subtle.importKey(
            'raw',
            masterKey,
            { name: 'AES-GCM' },
            true,
            ['encrypt', 'decrypt']
        );
        
        return true;
    } catch (e) {
        return false;
    }
}

// Clear encryption keys
function clearKeys() {
    encryptionKey = null;
    tempPassword = null;
    tempRecoveryKey = null;
}
