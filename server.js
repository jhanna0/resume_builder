const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.static(__dirname));
app.use(express.json());

// Load resume data
app.get('/api/resume', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read data file' });
        }
        try {
            const parsedData = JSON.parse(data);
            res.json(parsedData);
        } catch (parseError) {
            res.status(500).json({ error: 'Failed to parse JSON data' });
        }
    });
});

// Save resume data
app.post('/api/resume', (req, res) => {
    fs.writeFile(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to save data' });
        }
        res.json({ message: 'Data saved successfully' });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});