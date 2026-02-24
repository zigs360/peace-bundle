
const axios = require('axios');

async function testRegister() {
    try {
        const payload = {
            fullName: "Al-Amin " + Math.floor(Math.random() * 1000),
            email: "al-amin" + Math.floor(Math.random() * 1000) + "@example.com",
            phone: "080" + Math.floor(Math.random() * 100000000),
            password: "password123",
            referralCode: ""
        };
        console.log("Sending payload:", payload);

        const response = await axios.post('http://127.0.0.1:5000/api/auth/register', payload);
        console.log("Response status:", response.status);
        console.log("Response data:", response.data);
    } catch (error) {
        if (error.response) {
            console.error("Error status:", error.response.status);
            console.error("Error data:", error.response.data);
        } else {
            console.error("Error:", error.message);
        }
    }
}

testRegister();
