const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api';
const LOG_FILE = path.join(__dirname, '../audit_report.txt');

// Reset Log File
fs.writeFileSync(LOG_FILE, `API Audit Report - ${new Date().toISOString()}\n\n`);

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

async function testRoute(name, method, endpoint, token, data = null, expectedStatus = 200) {
    try {
        const config = {
            method: method,
            url: `${BASE_URL}${endpoint}`,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            data: data,
            validateStatus: () => true
        };

        const start = Date.now();
        const response = await axios(config);
        const duration = Date.now() - start;

        const success = response.status === expectedStatus || (Array.isArray(expectedStatus) && expectedStatus.includes(response.status));

        if (success) {
            log(`PASS: ${name} (${method} ${endpoint}) - Status: ${response.status} - Time: ${duration}ms`);
            return { success: true, data: response.data, status: response.status };
        } else {
            log(`FAIL: ${name} (${method} ${endpoint}) - Expected: ${expectedStatus}, Got: ${response.status} - Time: ${duration}ms`, 'ERROR');
            log(`Response: ${JSON.stringify(response.data)}`, 'ERROR');
            return { success: false, data: response.data, status: response.status };
        }
    } catch (error) {
        log(`ERROR: ${name} (${method} ${endpoint}) - ${error.message}`, 'ERROR');
        if (error.code === 'ECONNREFUSED') {
            log('Server is not reachable. Is it running?', 'CRITICAL');
            process.exit(1);
        }
        return { success: false, error: error.message };
    }
}

async function runAudit() {
    log('Starting API Audit...');

    // 1. Health Check
    await testRoute('Health Check', 'GET', '/../', null, null, 200);

    // 2. Auth - Login Admin
    const adminLogin = await testRoute('Admin Login', 'POST', '/auth/login', null, {
        emailOrPhone: 'admin@peacebundlle.com',
        password: 'admin123'
    }, 200);

    if (!adminLogin.success) {
        log('Admin login failed. Aborting admin tests.', 'CRITICAL');
        process.exit(1);
    }
    const adminToken = adminLogin.data.token;
    log('Admin Token acquired.');

    // 3. Auth - Register User
    const userEmail = `audit_user_${Date.now()}@test.com`;
    const userRegister = await testRoute('Register User', 'POST', '/auth/register', null, {
        name: 'Audit User',
        email: userEmail,
        phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: 'password123',
        confirmPassword: 'password123'
    }, 201);

    let userToken = null;
    if (userRegister.success) {
        userToken = userRegister.data.token;
        log('User Token acquired.');
    }

    // 4. Public Data Plans
    await testRoute('Get Data Plans (Public)', 'GET', '/plans', null, null, 200);

    // 5. User Routes
    if (userToken) {
        await testRoute('Get Me', 'GET', '/auth/me', userToken, null, 200);
        await testRoute('Get Profile (Alias)', 'GET', '/auth/profile', userToken, null, 200);
        await testRoute('Get Dashboard Data', 'GET', '/users/data/purchase', userToken, null, 200);
        await testRoute('Get Affiliate Stats', 'GET', '/users/affiliate-stats', userToken, null, 200);
        
        // Transaction Validation Tests
        await testRoute('Buy Data (Invalid)', 'POST', '/transactions/data', userToken, {}, 400); // Expect 400 Validation Error
        await testRoute('Fund Wallet (Invalid)', 'POST', '/transactions/fund', userToken, {}, 400); // Expect 400 Validation Error
    }

    // 6. Admin Routes
    await testRoute('Get Admin Stats', 'GET', '/admin/stats', adminToken, null, 200);
    await testRoute('Get All Users', 'GET', '/admin/users', adminToken, null, 200);
    await testRoute('Get System Settings', 'GET', '/admin/settings', adminToken, null, 200);
    await testRoute('Get Sims', 'GET', '/admin/sims', adminToken, null, 200);
    await testRoute('Get Reports', 'GET', '/reports/stats', adminToken, null, 200);

    log('Audit Completed.');
    console.log(`Report saved to ${LOG_FILE}`);
}

runAudit();
