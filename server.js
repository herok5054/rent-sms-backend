require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const africastalking = require('africastalking')({
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME
});

app.use(cors());
app.use(express.json());

app.post('/send-sms', async (req, res) => {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
        return res.status(400).json({ error: 'Missing phone number or message' });
    }

    try {
        const sms = africastalking.SMS;
        const options = {
            to: [phoneNumber],
            message: message,
        };

        // Optional: only include sender ID if set
        if (process.env.MUHWEZIMGT) {
            options.from = process.env.MUHWEZIMGT;
        }

        const response = await sms.send(options);
        console.log('✅ SMS sent:', response);
        res.status(200).json({ success: true, response });
    } catch (error) {
        console.error('❌ Failed to send SMS:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});


